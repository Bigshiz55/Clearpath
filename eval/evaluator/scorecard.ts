/**
 * Phase 6 — the weighted scorecard + critical thresholds. Strong soft-preference
 * performance can NEVER hide a hard failure: the run fails if any critical
 * threshold is breached, regardless of the composite score.
 */
import type { CaseResult } from './result';
import { CASE_WEIGHTS } from './evaluate';
import { TAXONOMY, type FailureCategory } from './taxonomy';

export interface Thresholds {
  hallucinationRate: number;
  hardViolationRate: number;
  duplicateRate: number;
  timeWindowRate: number;
  crashRate: number;
  minComposite: number | null;
}

/** Phase 6 initial critical thresholds (all configurable). */
export const DEFAULT_THRESHOLDS: Thresholds = {
  hallucinationRate: 0, // 0%
  hardViolationRate: 0.005, // <0.5%
  duplicateRate: 0.005,
  timeWindowRate: 0.005,
  crashRate: 0, // 0%
  minComposite: null,
};

export interface RunMetrics {
  cases: number;
  passRate: number;
  composite: number; // weighted, 0..1
  categoryScores: {
    hardPrecision: number;
    parsing: number;
    recall: number;
    ranking: number;
    response: number;
    reliability: number;
  };
  // separate rates
  hardFailureRate: number;
  hallucinationRate: number;
  wrongTimeWindowRate: number;
  wrongNetworkOrPlatformRate: number;
  exclusionViolationRate: number;
  duplicateRate: number;
  previouslyWatchedLeakRate: number;
  previouslyRejectedLeakRate: number;
  subscriptionViolationRate: number;
  crashRate: number;
  clarificationAccuracy: number;
  noResultHonesty: number;
  top1PersonalizationAccuracy: number;
  top3PersonalizationQuality: number;
  meanNdcg: number;
  meanMrr: number;
  parseFieldAccuracy: number;
  intentAccuracy: number;
  latency: { p50: number; p95: number; p99: number; mean: number };
  failuresByCategory: Record<string, number>;
  externalApiCalls: number;
}

function rate(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}
function pct(results: CaseResult[], pred: (r: CaseResult) => boolean): number {
  return rate(results.filter(pred).length, results.length);
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

export function computeMetrics(results: CaseResult[]): RunMetrics {
  const n = results.length;
  const catScore = (sel: (r: CaseResult) => number) => mean(results.map(sel));

  // per-category re-derivation for the run breakdown
  const hardPrecision = catScore((r) => {
    const returned = r.pipeline.items.length;
    const violated = new Set(r.layerB.violations.map((v) => v.itemId)).size;
    const expectEmpty = Boolean(r.case.expected.expectsEmptyOrFewer) || Boolean(r.case.expected.expectsRejection);
    return returned > 0 ? (returned - violated) / returned : expectEmpty ? 1 : r.case.expected.maxResults ? 0.6 : 1;
  });
  const parsing = catScore((r) => 0.5 * (r.layerA.intentCorrect ? 1 : 0) + 0.5 * r.layerA.fieldAccuracy);
  const recall = catScore((r) => (r.layerC.graded ? r.layerC.recall ?? 1 : 1));
  const ranking = catScore((r) => (r.layerD.graded ? 0.6 * (r.layerD.ndcg ?? 1) + 0.4 * (r.layerD.mrr ?? r.layerD.judge?.rankingScore ?? 1) : 1));
  const response = catScore((r) => r.layerE.score);
  const reliability = catScore((r) => (r.error ? 0 : r.layerF.totalMs > 1500 ? 0.5 : 1));

  const composite =
    CASE_WEIGHTS.hardPrecision * hardPrecision +
    CASE_WEIGHTS.parsing * parsing +
    CASE_WEIGHTS.recall * recall +
    CASE_WEIGHTS.ranking * ranking +
    CASE_WEIGHTS.response * response +
    CASE_WEIGHTS.reliability * reliability;

  const rankingGraded = results.filter((r) => r.layerD.graded);
  const idealCases = results.filter((r) => r.case.expected.idealTopId);
  const clarifyCases = results.filter((r) => r.case.expected.expectsClarification);
  const fewerCases = results.filter((r) => r.case.expected.expectsEmptyOrFewer);

  const latencies = results.map((r) => r.layerF.totalMs).sort((a, b) => a - b);

  const failuresByCategory: Record<string, number> = {};
  for (const cat of TAXONOMY) failuresByCategory[cat] = 0;
  for (const r of results) if (r.primaryCategory) failuresByCategory[r.primaryCategory] = (failuresByCategory[r.primaryCategory] ?? 0) + 1;

  return {
    cases: n,
    passRate: pct(results, (r) => r.passed),
    composite,
    categoryScores: { hardPrecision, parsing, recall, ranking, response, reliability },
    hardFailureRate: pct(results, (r) => !r.layerB.hardValid),
    hallucinationRate: pct(results, (r) => r.layerB.hallucinations > 0),
    wrongTimeWindowRate: pct(results, (r) => r.layerB.timeWindowViolations > 0),
    wrongNetworkOrPlatformRate: pct(results, (r) => r.layerB.networkOrPlatformViolations > 0),
    exclusionViolationRate: pct(results, (r) => r.layerB.exclusionViolations > 0),
    duplicateRate: pct(results, (r) => r.layerB.duplicateCount > 0),
    previouslyWatchedLeakRate: pct(results, (r) => r.layerB.previouslyWatchedLeaks > 0),
    previouslyRejectedLeakRate: pct(results, (r) => r.layerB.previouslyRejectedLeaks > 0),
    subscriptionViolationRate: pct(results, (r) => r.layerB.subscriptionViolations > 0),
    crashRate: pct(results, (r) => Boolean(r.error)),
    clarificationAccuracy: clarifyCases.length ? rate(clarifyCases.filter((r) => r.passed).length, clarifyCases.length) : 1,
    noResultHonesty: fewerCases.length ? rate(fewerCases.filter((r) => r.layerE.honestAboutFewer).length, fewerCases.length) : 1,
    top1PersonalizationAccuracy: idealCases.length ? rate(idealCases.filter((r) => r.layerD.idealTopRank === 1).length, idealCases.length) : 1,
    top3PersonalizationQuality: idealCases.length ? rate(idealCases.filter((r) => (r.layerD.idealTopRank ?? 99) <= 3).length, idealCases.length) : 1,
    meanNdcg: mean(rankingGraded.map((r) => r.layerD.ndcg ?? 1)),
    meanMrr: idealCases.length ? mean(idealCases.map((r) => r.layerD.mrr ?? 0)) : 1,
    parseFieldAccuracy: mean(results.map((r) => r.layerA.fieldAccuracy)),
    intentAccuracy: pct(results, (r) => r.layerA.intentCorrect),
    latency: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), p99: percentile(latencies, 99), mean: mean(latencies) },
    failuresByCategory,
    externalApiCalls: results.reduce((s, r) => s + r.layerF.externalApiCalls, 0),
  };
}

export interface CriticalBreach {
  metric: string;
  value: number;
  threshold: number;
}

export function checkThresholds(m: RunMetrics, t: Thresholds = DEFAULT_THRESHOLDS): CriticalBreach[] {
  const breaches: CriticalBreach[] = [];
  const chk = (metric: string, value: number, threshold: number) => {
    if (value > threshold) breaches.push({ metric, value, threshold });
  };
  chk('hallucinationRate', m.hallucinationRate, t.hallucinationRate);
  chk('hardViolationRate', m.hardFailureRate, t.hardViolationRate);
  chk('duplicateRate', m.duplicateRate, t.duplicateRate);
  chk('timeWindowRate', m.wrongTimeWindowRate, t.timeWindowRate);
  chk('crashRate', m.crashRate, t.crashRate);
  if (t.minComposite != null && m.composite < t.minComposite) {
    breaches.push({ metric: 'composite', value: m.composite, threshold: t.minComposite });
  }
  return breaches;
}

export interface Scorecard {
  metrics: RunMetrics;
  breaches: CriticalBreach[];
  passed: boolean;
}

export function scoreRun(results: CaseResult[], thresholds: Thresholds = DEFAULT_THRESHOLDS): Scorecard {
  const metrics = computeMetrics(results);
  const breaches = checkThresholds(metrics, thresholds);
  return { metrics, breaches, passed: breaches.length === 0 };
}

export type { FailureCategory };
