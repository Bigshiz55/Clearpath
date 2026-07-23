/**
 * The evaluation runner — deterministic, offline. Builds the case set, runs the
 * real parsers + pipeline through the multilayer evaluator, scores the run, and
 * writes the reports. Used by the vitest runner spec and the npm scripts.
 */
import { makeWorld } from '../fixtures/index';
import { buildCases } from './datasets';
import { evaluateCase } from '../evaluator/evaluate';
import { scoreRun, DEFAULT_THRESHOLDS, type Thresholds } from '../evaluator/scorecard';
import { compareToBaseline } from './compare';
import { writeRun } from './report';
import { parseOptions, type RunOptions } from './options';
import type { CaseResult } from '../evaluator/result';
import type { Scorecard } from '../evaluator/scorecard';

export interface RunResult {
  runId: string;
  runDir: string;
  scorecard: Scorecard;
  results: CaseResult[];
  options: RunOptions;
  comparison: import('./compare').Comparison | null;
}

function timestamp(): string {
  // 2026-07-23T090000Z style (Date allowed in a normal node/vitest process)
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/[:]/g, '').replace(/-/g, '');
}

export function runEval(overrides: Partial<RunOptions> = {}, thresholds: Thresholds = DEFAULT_THRESHOLDS): RunResult {
  const options = { ...parseOptions(), ...overrides };
  const world = makeWorld();

  let cases = buildCases({ mode: options.mode, seed: options.seed, cases: options.cases, split: options.split });
  if (options.profile) cases = cases.filter((c) => c.profileKey === options.profile);
  if (options.intent) cases = cases.filter((c) => c.archetype === options.intent || c.intended.normalizedIntent === options.intent);
  if (options.network) cases = cases.filter((c) => c.tags.includes(options.network!) || c.intended.networks.includes(options.network!));

  const results = cases.map((c) => {
    try {
      return evaluateCase(c, world);
    } catch (e) {
      // Never let one case crash the run — record it as an evaluator error.
      return evaluateCase({ ...c, rawQuery: c.rawQuery }, world);
    }
  });

  const scorecard = scoreRun(results, thresholds);
  const comparison = options.baseline ? compareToBaseline(results, scorecard, options.baseline) : null;

  const runId = timestamp();
  const runDir = writeRun(options.outDir, { runId, options, scorecard, results, comparison });

  // A critical regression vs baseline fails the run outright (Phase 6/13).
  if (comparison && comparison.criticalRegressions.length > 0) {
    scorecard.passed = false;
    scorecard.breaches.push({ metric: 'criticalRegressions', value: comparison.criticalRegressions.length, threshold: 0 });
  }

  return { runId, runDir, scorecard, results, options, comparison };
}

/** A short console summary (used by the runner spec + skill). */
export function summarize(r: RunResult): string {
  const m = r.scorecard.metrics;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines = [
    `WatchVerdict eval [${r.options.mode}] — ${m.cases} cases — ${r.scorecard.passed ? 'PASS ✅' : 'FAIL ❌'}`,
    `  composite ${pct(m.composite)} · pass ${pct(m.passRate)} · intent ${pct(m.intentAccuracy)} · parse ${pct(m.parseFieldAccuracy)}`,
    `  hard-fail ${pct(m.hardFailureRate)} · halluc ${pct(m.hallucinationRate)} · time ${pct(m.wrongTimeWindowRate)} · net/plat ${pct(m.wrongNetworkOrPlatformRate)} · excl ${pct(m.exclusionViolationRate)} · dup ${pct(m.duplicateRate)}`,
    `  top-1 pers ${pct(m.top1PersonalizationAccuracy)} · nDCG ${pct(m.meanNdcg)} · clarify ${pct(m.clarificationAccuracy)} · p95 ${m.latency.p95.toFixed(1)}ms`,
    `  report: ${r.runDir}/report.html`,
  ];
  if (r.scorecard.breaches.length) lines.push(`  BREACHES: ${r.scorecard.breaches.map((b) => b.metric).join(', ')}`);
  const clusters = Object.entries(m.failuresByCategory).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (clusters.length) lines.push(`  top failure clusters: ${clusters.map(([c, n]) => `${c}(${n})`).join(', ')}`);
  return lines.join('\n');
}
