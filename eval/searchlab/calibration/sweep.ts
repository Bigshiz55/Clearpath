/**
 * Pure calibration sweep — no I/O. Evaluates the seed-similarity gate
 * (`qualify`) over a GRID of threshold values against the human-labelled
 * calibration pairs, and reports metrics ACROSS the whole grid (not one point).
 *
 * Discipline (per the approved plan):
 *   - Threshold SELECTION uses the CALIBRATION split only.
 *   - The CAL_HOLDOUT split is evaluated exactly once, with the already-frozen
 *     selection, and never influences which thresholds are chosen.
 *   - We report ranges: precision, recall, false-qualification rate,
 *     no-result rate, critical-contradiction rate, and per genre / category.
 */
import { qualify } from '@/lib/search/seedSimilarity';
import type { SeedSimilarityThresholds } from '@/lib/search/thresholds';
import type { LabeledPair } from './dataset';

export interface PairOutcome {
  id: string;
  category: LabeledPair['category'];
  genreBucket: string;
  expected: 'qualify' | 'reject';
  passed: boolean;
  reason: string | null;
  outcome: 'TP' | 'FP' | 'FN' | 'TN';
}

export interface Metrics {
  n: number;
  tp: number; fp: number; fn: number; tn: number;
  precision: number;
  recall: number;
  /** FP / (labelled-reject pairs) — how often a "not similar" pair wrongly qualifies. */
  falseQualificationRate: number;
  /** Among labelled-qualify seeds, fraction whose candidates ALL failed (over-filtering). */
  noResultRate: number;
  /** Among category='contradiction' pairs (all reject), fraction that wrongly qualified. */
  criticalContradictionRate: number;
  f1: number;
  byCategory: Record<string, { qualified: number; total: number; correct: number }>;
  byBucket: Record<string, { correct: number; total: number }>;
}

export interface SweepPoint {
  thresholds: SeedSimilarityThresholds;
  metrics: Metrics;
}

/** Deterministic grid. Ranges bracket the provisional point on every axis. */
export const GRID = {
  minAnchor: [0.2, 0.24, 0.28, 0.32, 0.36, 0.4],
  maxContradiction: [0.3, 0.36, 0.42, 0.48, 0.54],
  hardRealismGap: [40, 45, 50, 55, 60],
  minConfidence: [0.3, 0.4, 0.5],
};

export function gridConfigs(base: SeedSimilarityThresholds): SeedSimilarityThresholds[] {
  const out: SeedSimilarityThresholds[] = [];
  for (const minAnchor of GRID.minAnchor)
    for (const maxContradiction of GRID.maxContradiction)
      for (const hardRealismGap of GRID.hardRealismGap)
        for (const minConfidence of GRID.minConfidence)
          out.push({ ...base, version: 'sweep-candidate', minAnchor, maxContradiction, hardRealismGap, minConfidence });
  return out;
}

export function evaluate(pairs: LabeledPair[], th: SeedSimilarityThresholds): { outcomes: PairOutcome[]; metrics: Metrics } {
  const outcomes: PairOutcome[] = [];
  let tp = 0, fp = 0, fn = 0, tn = 0;
  const byCategory: Metrics['byCategory'] = {};
  const byBucket: Metrics['byBucket'] = {};
  // seed → did ANY of its (expected-qualify) candidates qualify?
  const seedHasExpectedQualify = new Map<string, boolean>();
  const seedGotAny = new Map<string, boolean>();

  for (const p of pairs) {
    const decision = qualify(p.seed, p.candidate, { lens: p.lens, thresholds: th });
    const passed = decision.passed;
    const reason = decision.reason;
    const expQualify = p.expected === 'qualify';
    let outcome: PairOutcome['outcome'];
    if (expQualify && passed) { tp++; outcome = 'TP'; }
    else if (!expQualify && passed) { fp++; outcome = 'FP'; }
    else if (expQualify && !passed) { fn++; outcome = 'FN'; }
    else { tn++; outcome = 'TN'; }
    outcomes.push({ id: p.id, category: p.category, genreBucket: p.genreBucket, expected: p.expected, passed, reason, outcome });

    const cat = (byCategory[p.category] ??= { qualified: 0, total: 0, correct: 0 });
    cat.total++; if (passed) cat.qualified++;
    if ((expQualify && passed) || (!expQualify && !passed)) cat.correct++;
    const bkt = (byBucket[p.genreBucket] ??= { correct: 0, total: 0 });
    bkt.total++; if ((expQualify && passed) || (!expQualify && !passed)) bkt.correct++;

    const sid = p.seed.canonicalId;
    if (expQualify) {
      seedHasExpectedQualify.set(sid, true);
      if (passed) seedGotAny.set(sid, true);
      else if (!seedGotAny.has(sid)) seedGotAny.set(sid, seedGotAny.get(sid) ?? false);
    }
  }

  const rejectPairs = pairs.filter((p) => p.expected === 'reject').length;
  const contradictionPairs = pairs.filter((p) => p.category === 'contradiction').length;
  const contradictionLeaks = outcomes.filter((o) => o.category === 'contradiction' && o.passed).length;

  // no-result rate: among seeds that SHOULD surface ≥1 match, how many got none.
  let seedsNeedingMatch = 0, seedsWithNone = 0;
  for (const [sid, needs] of seedHasExpectedQualify) {
    if (!needs) continue;
    seedsNeedingMatch++;
    if (!seedGotAny.get(sid)) seedsWithNone++;
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    outcomes,
    metrics: {
      n: pairs.length, tp, fp, fn, tn,
      precision: r(precision), recall: r(recall),
      falseQualificationRate: r(rejectPairs === 0 ? 0 : fp / rejectPairs),
      noResultRate: r(seedsNeedingMatch === 0 ? 0 : seedsWithNone / seedsNeedingMatch),
      criticalContradictionRate: r(contradictionPairs === 0 ? 0 : contradictionLeaks / contradictionPairs),
      f1: r(f1),
      byCategory, byBucket,
    },
  };
}

export function sweep(pairs: LabeledPair[], base: SeedSimilarityThresholds): SweepPoint[] {
  return gridConfigs(base).map((th) => ({ thresholds: th, metrics: evaluate(pairs, th).metrics }));
}

/**
 * Selection policy (documented + deterministic):
 *   1. HARD: zero critical-contradiction leaks — a contradiction must NEVER qualify.
 *      This is the safety property the Rocky incident was about; it is never traded
 *      away for recall or count.
 *   2. Maximize F1 (balances false-qualification against recall — we deliberately do
 *      NOT chase recall alone, which would loosen thresholds to fill results).
 *   3. Tie-break: lower false-qualification rate (precision-leaning under ties).
 *   4. Tie-break: lower no-result rate (avoid gratuitous over-filtering of genuine
 *      matches — reported, but only a tie-break so it can't force over-permissive
 *      thresholds).
 *   5. Tie-break: minimal L1 distance to the provisional point, so we do NOT overfit
 *      a small calibration set — the closest-to-default config wins remaining ties.
 */
export function selectBest(points: SweepPoint[], provisional: SeedSimilarityThresholds): { chosen: SweepPoint; rationale: string; consideredEligible: number } {
  const eligible = points.filter((p) => p.metrics.criticalContradictionRate === 0);
  const pool = eligible.length ? eligible : points;
  const dist = (t: SeedSimilarityThresholds) =>
    Math.abs(t.minAnchor - provisional.minAnchor) / 0.4 +
    Math.abs(t.maxContradiction - provisional.maxContradiction) / 0.54 +
    Math.abs(t.hardRealismGap - provisional.hardRealismGap) / 60 +
    Math.abs(t.minConfidence - provisional.minConfidence) / 0.5;
  const sorted = [...pool].sort((a, b) => {
    if (b.metrics.f1 !== a.metrics.f1) return b.metrics.f1 - a.metrics.f1;
    if (a.metrics.falseQualificationRate !== b.metrics.falseQualificationRate)
      return a.metrics.falseQualificationRate - b.metrics.falseQualificationRate;
    if (a.metrics.noResultRate !== b.metrics.noResultRate)
      return a.metrics.noResultRate - b.metrics.noResultRate;
    return dist(a.thresholds) - dist(b.thresholds);
  });
  const chosen = sorted[0];
  if (!chosen) throw new Error('sweep produced no configurations');
  const rationale = eligible.length
    ? `Chosen among ${eligible.length} configs with zero critical-contradiction leaks; max F1=${chosen.metrics.f1}, tie-broken by false-qualification, then no-result rate, then closeness to provisional.`
    : `No config achieved zero critical-contradiction leaks; fell back to best F1 across all ${points.length} configs (flagged — do NOT freeze as production).`;
  return { chosen, rationale, consideredEligible: eligible.length };
}

/** Range (min/max) of each metric across the whole grid — proves we report ranges. */
export function metricRanges(points: SweepPoint[]): Record<string, { min: number; max: number }> {
  const keys: (keyof Metrics)[] = ['precision', 'recall', 'falseQualificationRate', 'noResultRate', 'criticalContradictionRate', 'f1'];
  const out: Record<string, { min: number; max: number }> = {};
  for (const k of keys) {
    const vals = points.map((p) => p.metrics[k] as number);
    out[k as string] = { min: Math.min(...vals), max: Math.max(...vals) };
  }
  return out;
}

function r(x: number): number { return Math.round(x * 1000) / 1000; }
