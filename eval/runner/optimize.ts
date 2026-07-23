/**
 * Phase 8 — the controlled optimization loop (analysis + proposal half).
 *
 * SAFETY: this module NEVER edits production code and NEVER deploys. Applying a
 * fix is a human/Skill action gated on approval. What it does automatically and
 * safely:
 *   1. run a baseline evaluation (development split),
 *   2. cluster failures by root cause, rank by frequency × severity × impact,
 *   3. propose the smallest generalizable fix per top cluster,
 *   4. freeze the discovered failures into the regression store (never deleted),
 *   5. write an optimization proposal for human review.
 *
 * The candidate-vs-baseline / holdout verification runs when a human has applied
 * a change and re-invokes compare against the frozen baseline + holdout split.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runEval } from './run';
import { saveRegressionExtras, loadRegressionExtras } from './datasets';
import type { CaseResult } from '../evaluator/result';
import type { EvalCase } from '../types';

export interface OptimizeConfig {
  maximumIterations: number;
  minimumImprovement: number;
  maximumCriticalRegression: number;
  maximumAllowedCost: number;
  stopAfterNoImprovementIterations: number;
}

export const DEFAULT_OPTIMIZE_CONFIG: OptimizeConfig = {
  maximumIterations: 10,
  minimumImprovement: 0.01,
  maximumCriticalRegression: 0,
  maximumAllowedCost: 10,
  stopAfterNoImprovementIterations: 2,
};

export interface Cluster {
  category: string;
  count: number;
  severity: number; // 0..1 (critical categories weigh more)
  impactScore: number; // frequency × severity
  representativeCaseIds: string[];
  recommendedFix: string;
  requiresProductDecision: boolean;
}

const CRITICAL_CATS = new Set([
  'schedule_filtering',
  'deduplication',
  'subscription_filtering',
  'viewing_history_filtering',
  'metadata_enrichment',
  'exclusion_filtering',
]);

const FIX_LIBRARY: Record<string, { fix: string; productDecision?: boolean }> = {
  time_interpretation: { fix: 'Extend detectAiringHorizon to parse clock times ("at 8pm", "after 8") and treat a bare "tonight" as an evening window; add unit cases.' },
  entity_extraction: { fix: 'Fix the specific detector shown in parseFields (extractWatchTitle stopwords / " on " truncation; detectNetwork↔GN_NETS key drift; hbo→Max conflation).' },
  exclusion_filtering: { fix: 'Add deterministic negation parsing to the normalizer/route so "no X"/"nothing X" reaches excludedAttributes even without the LLM path.' },
  intent_classification: { fix: 'Reorder the build-case cascade so airing + network intent is not shadowed by detectPlatform when both are present.' },
  query_normalization: { fix: 'Count parsing: stop reading recency numbers ("last 5 years") as counts; map "a couple/a few" to 2/3.' },
  deduplication: { fix: 'Dedup broadcast airings by (title|start) before slicing to the requested count.' },
  schedule_filtering: { fix: 'Unify in-progress semantics across TVmaze/Gracenote/stored paths and honor the requested window boundary consistently.' },
  ranking_weights: { fix: 'Investigate ranking only if evidence shows the model is the source — check the personal score for the mis-ranked titles before touching weights.', productDecision: true },
  ambiguity_handling: { fix: 'Detect the contradiction and surface ONE clarification instead of silently choosing an interpretation.', productDecision: true },
  candidate_retrieval: { fix: 'Revisit CANDIDATE_CAP or add a second retrieval pass so strong matches below the popularity cap are not dropped.' },
  subscription_filtering: { fix: 'Apply the includedServiceNames post-filter even on explicit-provider searches; handle missing TMDB region data without dropping owned titles.' },
  viewing_history_filtering: { fix: 'Ensure previously watched/rejected titles are excluded for the relevant intents.' },
};

export function clusterFailures(results: CaseResult[]): Cluster[] {
  const byCat = new Map<string, CaseResult[]>();
  for (const r of results) {
    if (r.passed || !r.primaryCategory) continue;
    const arr = byCat.get(r.primaryCategory) ?? [];
    arr.push(r);
    byCat.set(r.primaryCategory, arr);
  }
  const clusters: Cluster[] = [];
  for (const [category, rs] of byCat) {
    const severity = CRITICAL_CATS.has(category) ? 1 : rs.some((r) => r.criticalFailure) ? 0.9 : 0.5;
    const lib = FIX_LIBRARY[category];
    clusters.push({
      category,
      count: rs.length,
      severity,
      impactScore: rs.length * severity,
      representativeCaseIds: rs.slice(0, 5).map((r) => r.case.id),
      recommendedFix: lib?.fix ?? 'Inspect parseFields + violations to localize the smallest change.',
      requiresProductDecision: Boolean(lib?.productDecision),
    });
  }
  return clusters.sort((a, b) => b.impactScore - a.impactScore);
}

/** Freeze the discovered failures into the permanent regression store (Phase 9:
 *  never delete failed cases after a fix). Dedups by case id. */
export function freezeFailuresAsRegression(results: CaseResult[]): number {
  const existing = loadRegressionExtras();
  const have = new Set(existing.map((c) => c.id));
  const added: EvalCase[] = [];
  for (const r of results) {
    if (r.passed) continue;
    // Re-tag as a frozen regression case; keep its ground truth.
    const id = `reg-${r.case.id}`;
    if (have.has(id)) continue;
    added.push({ ...r.case, id, source: 'regression' });
    have.add(id);
  }
  if (added.length) saveRegressionExtras([...existing, ...added]);
  return added.length;
}

export interface OptimizeReport {
  baselineComposite: number;
  clusters: Cluster[];
  frozenRegressionCases: number;
  proposalPath: string;
  stopReason: string;
}

export function runOptimize(config: OptimizeConfig = DEFAULT_OPTIMIZE_CONFIG): OptimizeReport {
  // 1. baseline (development split)
  const base = runEval({ mode: 'standard', split: 'development' });
  const results = base.results;

  // 2/3. cluster + rank + propose
  const clusters = clusterFailures(results);

  // 4. freeze failures as permanent regression cases
  const frozen = freezeFailuresAsRegression(results);

  // 5. write proposal (no code edits, no deploy)
  const proposalPath = path.join(base.options.outDir, 'runs', base.runId, 'optimization-proposal.md');
  const stopReason =
    clusters.length === 0
      ? 'No failures — nothing to optimize.'
      : clusters[0]!.requiresProductDecision
        ? 'Top cluster requires a product decision — human review needed before any change.'
        : `Proposed the smallest fix for the top ${Math.min(clusters.length, config.maximumIterations)} clusters; apply on a branch and re-run compare + holdout. No code changed, nothing deployed.`;

  fs.writeFileSync(proposalPath, renderProposal(base.scorecard.metrics.composite, clusters, frozen, config, stopReason));

  return { baselineComposite: base.scorecard.metrics.composite, clusters, frozenRegressionCases: frozen, proposalPath, stopReason };
}

function renderProposal(composite: number, clusters: Cluster[], frozen: number, config: OptimizeConfig, stopReason: string): string {
  const lines: string[] = [];
  lines.push('# WatchVerdict Eval — Optimization Proposal');
  lines.push('');
  lines.push('> This is a PROPOSAL for human review. No production code was changed and nothing was deployed.');
  lines.push('');
  lines.push(`Baseline composite: **${(composite * 100).toFixed(1)}%** · froze **${frozen}** new regression cases.`);
  lines.push('');
  lines.push(`Config: maxIterations=${config.maximumIterations}, minImprovement=${config.minimumImprovement}, maxCriticalRegression=${config.maximumCriticalRegression}, stopAfterNoImprovement=${config.stopAfterNoImprovementIterations}.`);
  lines.push('');
  lines.push(`Stop reason: ${stopReason}`);
  lines.push('');
  lines.push('## Failure clusters (ranked by frequency × severity)');
  clusters.forEach((c, i) => {
    lines.push('');
    lines.push(`### ${i + 1}. ${c.category} — ${c.count} case(s), impact ${c.impactScore.toFixed(1)}${c.requiresProductDecision ? ' · ⚠️ product decision' : ''}`);
    lines.push(`**Smallest proposed fix:** ${c.recommendedFix}`);
    lines.push(`Representative cases: ${c.representativeCaseIds.map((id) => `\`${id}\``).join(', ')}`);
  });
  lines.push('');
  lines.push('## How to apply (human)');
  lines.push('1. Pick the top non-product-decision cluster.');
  lines.push('2. Make the smallest generalizable change (prefer normalization/detector fixes over ranking weights).');
  lines.push('3. Update the frozen characterization test(s) in `src/lib/nlu/detectors.test.ts` on purpose.');
  lines.push('4. Re-run `npm run eval:watchverdict:compare` (vs baseline) AND `npm run eval:watchverdict:holdout`.');
  lines.push('5. Reject the change if it introduces ANY critical regression or fails to generalize on holdout.');
  return lines.join('\n') + '\n';
}
