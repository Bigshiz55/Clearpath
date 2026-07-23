/**
 * WatchVerdict Search Lab — seed-similarity runner.
 *
 * Modes (SEARCHLAB_MODE):
 *   baseline — run the CURRENT engine reference (currentRanker); SAVE results as
 *              the frozen "before". Documents the failure; no gold assertion.
 *   gated    — run the production gate (rankSeedSimilar); ASSERT gold on dev+holdout.
 *   compare  — run both; write comparison.json; assert the gate fixes every
 *              critical failure the baseline had and introduces none.
 *
 * Writes artifacts under search-lab-results/runs/<label>/.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GOLD_CASES, fixtureFor } from './cases';
import { gradeCase, summarize, type CaseGrade } from './grade';
import { currentRanker } from './currentModel';
import type { Ranker, RankedResult } from './types';

const MODE = (process.env.SEARCHLAB_MODE ?? 'baseline') as 'baseline' | 'gated' | 'compare';
const OUT_ROOT = path.join(process.cwd(), 'search-lab-results', 'runs');

function runSuite(ranker: Ranker): { grades: CaseGrade[]; results: { caseId: string; result: RankedResult }[] } {
  const grades: CaseGrade[] = [];
  const results: { caseId: string; result: RankedResult }[] = [];
  for (const gc of GOLD_CASES) {
    const fx = fixtureFor(gc.fixtureKey);
    const result = ranker(fx.seed, fx.candidates, {
      requestedCount: gc.requestedCount,
      lens: gc.lens,
      allowFranchise: gc.allowFranchise,
      allowSeed: gc.allowSeed,
    });
    results.push({ caseId: gc.id, result });
    grades.push(gradeCase(gc, fx, result));
  }
  return { grades, results };
}

function writeArtifacts(label: string, grades: CaseGrade[], results: { caseId: string; result: RankedResult }[], extra?: object) {
  const dir = path.join(OUT_ROOT, label);
  fs.mkdirSync(dir, { recursive: true });
  const summary = summarize(label, grades);
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(dir, 'cases.jsonl'), grades.map((g) => JSON.stringify(g)).join('\n') + '\n');
  fs.writeFileSync(
    path.join(dir, 'score-traces.jsonl'),
    results.flatMap((r) => r.result.traces.map((t) => JSON.stringify({ caseId: r.caseId, ...t }))).join('\n') + '\n',
  );
  if (extra) fs.writeFileSync(path.join(dir, 'comparison.json'), JSON.stringify(extra, null, 2));
  // Human-readable report
  const lines = [
    `# Search Lab — ${label}`, '',
    `- total: ${summary.total} · passed: ${summary.passed} · failed: ${summary.failed}`,
    `- critical: seedLeak=${summary.criticalCounts.seedLeak} duplicate=${summary.criticalCounts.duplicate} contradictionLeak=${summary.criticalCounts.contradictionLeak} hallucination=${summary.criticalCounts.hallucination}`,
    `- franchise-cap violations: ${summary.franchiseViolations} · genuine-match recall misses: ${summary.recallMisses}`, '',
    '## Cases', '',
    ...grades.map((g) => `- ${g.pass ? 'PASS' : 'FAIL'} \`${g.caseId}\` (${g.split}) returned ${g.returned}/${g.requested}` +
      (g.critical.seedLeak.length ? ` · SEED-LEAK ${g.critical.seedLeak.join(',')}` : '') +
      (g.critical.contradictionLeak.length ? ` · CONTRADICTION ${g.critical.contradictionLeak.join(',')}` : '') +
      (g.critical.duplicate.length ? ` · DUP ${g.critical.duplicate.join(',')}` : '') +
      (g.franchiseCapViolated ? ` · FRANCHISE ${g.franchiseTop5}` : '') +
      (g.recall.mustQualifyMissing.length ? ` · missing ${g.recall.mustQualifyMissing.join(',')}` : '')),
  ];
  fs.writeFileSync(path.join(dir, 'report.md'), lines.join('\n') + '\n');
  return summary;
}

async function loadGatedRanker(): Promise<Ranker> {
  const mod = await import('@/lib/search/seedSimilarity');
  return mod.rankSeedSimilar as Ranker;
}

describe(`Search Lab (${MODE})`, () => {
  if (MODE === 'baseline') {
    it('runs the current engine reference and saves the frozen baseline', () => {
      const { grades, results } = runSuite(currentRanker);
      const summary = writeArtifacts('baseline', grades, results);
      // Baseline is a record of the CURRENT behaviour, not a target. We assert it
      // ran every case and — to prove the reproduction — that it DOES exhibit the
      // failure (contradiction and/or seed leaks) the fix must remove.
      expect(summary.total).toBe(GOLD_CASES.length);
      expect(summary.criticalCounts.contradictionLeak + summary.criticalCounts.seedLeak).toBeGreaterThan(0);
    });
  }

  if (MODE === 'gated' || MODE === 'compare') {
    it('gate meets gold on dev + holdout with zero critical failures', async () => {
      const gated = await loadGatedRanker();
      const { grades, results } = runSuite(gated);
      const summary = writeArtifacts('gated', grades, results);
      expect(summary.criticalCounts.seedLeak, 'seed leak').toBe(0);
      expect(summary.criticalCounts.duplicate, 'duplicate').toBe(0);
      expect(summary.criticalCounts.contradictionLeak, 'contradiction leak').toBe(0);
      expect(summary.criticalCounts.hallucination, 'hallucination').toBe(0);
      expect(summary.franchiseViolations, 'franchise cap').toBe(0);
      // Genuine matches must still surface (no over-filtering).
      expect(summary.recallMisses, 'genuine-match recall').toBe(0);
      void results;
    });
  }

  if (MODE === 'compare') {
    it('gate removes every baseline critical failure and adds none', async () => {
      const base = runSuite(currentRanker);
      const gated = await loadGatedRanker();
      const g = runSuite(gated);
      const baseSummary = summarize('baseline', base.grades);
      const gatedSummary = summarize('gated', g.grades);
      const comparison = {
        baseline: baseSummary,
        gated: gatedSummary,
        baselineCritical: baseSummary.criticalCounts,
        gatedCritical: gatedSummary.criticalCounts,
      };
      writeArtifacts('compare', g.grades, g.results, comparison);
      const baseCrit = Object.values(baseSummary.criticalCounts).reduce((a, b) => a + b, 0);
      const gatedCrit = Object.values(gatedSummary.criticalCounts).reduce((a, b) => a + b, 0);
      expect(baseCrit, 'baseline should have critical failures to fix').toBeGreaterThan(0);
      expect(gatedCrit, 'gate introduces no critical failure').toBe(0);
    });
  }
});
