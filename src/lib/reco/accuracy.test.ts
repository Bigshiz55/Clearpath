import { describe, it, expect } from 'vitest';
import {
  accuracyReport, compareAlgorithms, outcomeIsHit, wilson,
  ALGO_VERSION, type EvalRow, type OutcomeKind, type Confidence,
} from './accuracy';
import { assignVariant, confidenceOf, cohortOf } from './experiments';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Synthesize N rows where each confidence bucket hits at a target rate. */
function population(rng: () => number, n: number, rate: Record<Confidence, number>, over: Partial<EvalRow> = {}): EvalRow[] {
  const confs: Confidence[] = ['low', 'medium', 'high'];
  const rows: EvalRow[] = [];
  for (let i = 0; i < n; i++) {
    const confidence = confs[i % 3]!;
    const hit = rng() < rate[confidence];
    const outcome: OutcomeKind = hit ? (rng() < 0.5 ? 'watched' : 'saved') : (rng() < 0.5 ? 'skipped' : 'dismissed');
    rows.push({
      algoVersion: ALGO_VERSION, mediaType: rng() < 0.5 ? 'movie' : 'tv',
      genres: [['crime', 'comedy', 'scifi', 'romance'][i % 4]!], platform: ['Netflix', 'Max', 'Hulu'][i % 3],
      confidence, cohort: rng() < 0.5 ? 'new' : 'experienced', predicted: confidence === 'high' ? 82 : confidence === 'medium' ? 63 : 48,
      outcome, ...over,
    });
  }
  return rows;
}

describe('recommendation validation: accuracy + calibration', () => {
  it('outcome scoring: positives are hits, hard negatives are misses', () => {
    expect(outcomeIsHit('watched')).toBe(true);
    expect(outcomeIsHit('saved')).toBe(true);
    expect(outcomeIsHit('rated_up')).toBe(true);
    expect(outcomeIsHit('dismissed')).toBe(false);
    expect(outcomeIsHit('rated_down')).toBe(false);
    expect(outcomeIsHit('corrected')).toBe(false);
    expect(outcomeIsHit('skipped', true)).toBe(false);
    expect(outcomeIsHit('skipped', false)).toBeNull();
  });

  it('a WELL-calibrated algo reports monotonic confidence→accuracy', () => {
    const rng = mulberry32(1);
    const rows = population(rng, 3000, { low: 0.45, medium: 0.65, high: 0.85 });
    const rep = accuracyReport(rows);
    expect(rep.byConfidence.high.accuracy).toBeGreaterThan(rep.byConfidence.medium.accuracy);
    expect(rep.byConfidence.medium.accuracy).toBeGreaterThan(rep.byConfidence.low.accuracy);
    expect(rep.calibration.monotonic).toBe(true);
    expect(rep.calibration.note).toMatch(/well-calibrated/);
    // Buckets are reliable at this sample size, with sane CIs bracketing truth.
    expect(rep.byConfidence.high.reliable).toBe(true);
    expect(rep.byConfidence.high.ciLow).toBeLessThan(0.85);
    expect(rep.byConfidence.high.ciHigh).toBeGreaterThan(0.85);
  });

  it('DETECTS a miscalibrated algo (high confidence, low accuracy)', () => {
    const rng = mulberry32(2);
    const rows = population(rng, 3000, { low: 0.8, medium: 0.6, high: 0.35 }); // inverted
    const rep = accuracyReport(rows);
    expect(rep.calibration.monotonic).toBe(false);
    expect(rep.calibration.note).toMatch(/MISCALIBRATED/);
  });

  it('breaks accuracy down by genre / platform / format / cohort', () => {
    const rng = mulberry32(3);
    const rows = population(rng, 2400, { low: 0.5, medium: 0.65, high: 0.8 });
    const rep = accuracyReport(rows);
    expect(Object.keys(rep.byGenre).sort()).toEqual(['comedy', 'crime', 'romance', 'scifi']);
    expect(Object.keys(rep.byPlatform).sort()).toEqual(['Hulu', 'Max', 'Netflix']);
    expect(rep.byFormat.movie.n + rep.byFormat.tv.n).toBe(rep.totalRows);
    expect(rep.byCohort.new.reliable && rep.byCohort.experienced.reliable).toBe(true);
  });

  it('never over-claims on thin data (small buckets are flagged unreliable)', () => {
    const rows = population(mulberry32(4), 12, { low: 0.5, medium: 0.5, high: 0.5 });
    const rep = accuracyReport(rows, { minSamples: 20 });
    expect(rep.overall.reliable).toBe(false);
    expect(rep.calibration.note).toMatch(/insufficient/);
  });

  it('A/B: detects a genuinely better algorithm with significance', () => {
    const a = population(mulberry32(10), 3000, { low: 0.45, medium: 0.6, high: 0.72 });
    const b = population(mulberry32(11), 3000, { low: 0.55, medium: 0.72, high: 0.88 });
    const cmp = compareAlgorithms(a, b);
    expect(cmp.bWins).toBe(true);
    expect(cmp.delta).toBeGreaterThan(0.05);
    expect(cmp.significant).toBe(true); // CIs don't overlap at this size
  });

  it('A/B: calls a tie when the two are actually equal', () => {
    const a = population(mulberry32(20), 3000, { low: 0.6, medium: 0.6, high: 0.6 });
    const b = population(mulberry32(21), 3000, { low: 0.6, medium: 0.6, high: 0.6 });
    expect(compareAlgorithms(a, b).significant).toBe(false);
  });

  it('wilson interval is sane and tightens with n', () => {
    const [lo1, hi1] = wilson(8, 10);
    const [lo2, hi2] = wilson(800, 1000);
    expect(hi1 - lo1).toBeGreaterThan(hi2 - lo2); // more data ⇒ tighter
    expect(lo2).toBeGreaterThan(0.75);
    expect(hi2).toBeLessThan(0.85);
  });
});

describe('experiment assignment + facet helpers', () => {
  it('assignment is deterministic and stable', () => {
    const vs = [{ id: 'A' }, { id: 'B' }];
    for (let i = 0; i < 200; i++) {
      const u = `user-${i}`;
      const first = assignVariant(u, 'exp1', vs);
      expect(assignVariant(u, 'exp1', vs)).toBe(first); // stable
    }
  });

  it('assignment splits ~proportionally to weights', () => {
    const vs = [{ id: 'control', weight: 3 }, { id: 'candidate', weight: 1 }];
    let control = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) if (assignVariant(`u${i}`, 'exp', vs) === 'control') control++;
    const frac = control / N;
    expect(frac).toBeGreaterThan(0.72); // ~0.75
    expect(frac).toBeLessThan(0.78);
  });

  it('different experiments give independent assignments', () => {
    const vs = [{ id: 'A' }, { id: 'B' }];
    let same = 0;
    for (let i = 0; i < 1000; i++) if (assignVariant(`u${i}`, 'x', vs) === assignVariant(`u${i}`, 'y', vs)) same++;
    expect(same).toBeGreaterThan(400); // ~50% coincidental overlap, not correlated
    expect(same).toBeLessThan(600);
  });

  it('confidence + cohort helpers use the shared thresholds', () => {
    expect(confidenceOf(90)).toBe('high');
    expect(confidenceOf(60)).toBe('medium');
    expect(confidenceOf(40)).toBe('low');
    expect(cohortOf(5)).toBe('new');
    expect(cohortOf(25)).toBe('experienced');
  });
});
