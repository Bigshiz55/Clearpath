/**
 * Recommendation VALIDATION engine (pure). This is how WatchVerd1ct answers the
 * only question that matters long-term: "are we actually getting better at
 * predicting what people will enjoy?"
 *
 * Every recommendation shown is logged as an IMPRESSION (with the DNA snapshot,
 * algorithm version, predicted score, confidence, and reasoning that produced
 * it). Every user reaction is an OUTCOME. This module turns joined
 * impression+outcome rows into honest accuracy + calibration metrics, broken
 * down every way you'd want to slice them — with confidence intervals and
 * explicit small-sample gating so we never over-claim.
 *
 * No I/O. Deterministic. The DB read/write layer lives in ./store.
 */

/** Bump when the recommendation algorithm changes so cohorts stay comparable. */
export const ALGO_VERSION = 'reco-1.0.0';

/** What the user did with a shown recommendation. */
export type OutcomeKind = 'watched' | 'saved' | 'skipped' | 'dismissed' | 'corrected' | 'rated_up' | 'rated_down';

/** Positive = the prediction ("you'll enjoy this") held. */
const POSITIVE: ReadonlySet<OutcomeKind> = new Set(['watched', 'saved', 'rated_up']);
/** Negative = the prediction missed. `skipped` is a weak miss (configurable). */
const HARD_NEGATIVE: ReadonlySet<OutcomeKind> = new Set(['dismissed', 'rated_down', 'corrected']);

export type Confidence = 'low' | 'medium' | 'high';
export type Cohort = 'new' | 'experienced';

/** A joined impression+outcome, ready to score. */
export interface EvalRow {
  algoVersion: string;
  mediaType: 'movie' | 'tv';
  genres: string[];
  platform?: string | null;
  confidence: Confidence;
  cohort: Cohort;
  /** Our predicted match score at impression time (0..100). */
  predicted: number;
  outcome: OutcomeKind;
}

export interface Bucket {
  n: number;
  hits: number;
  accuracy: number;   // hits / n
  ciLow: number;
  ciHigh: number;
  /** true when n >= minSamples — only then should the number be trusted/shown. */
  reliable: boolean;
}

export interface AccuracyReport {
  overall: Bucket;
  byConfidence: Record<Confidence, Bucket>;
  byFormat: Record<'movie' | 'tv', Bucket>;
  byGenre: Record<string, Bucket>;
  byPlatform: Record<string, Bucket>;
  byAlgoVersion: Record<string, Bucket>;
  byCohort: Record<Cohort, Bucket>;
  /** Is the model calibrated: does higher confidence really mean higher accuracy? */
  calibration: { monotonic: boolean; high: number; medium: number; low: number; note: string };
  minSamples: number;
  totalRows: number;
}

export interface AccuracyOptions {
  /** Below this, a bucket is `reliable:false` (never over-claim on thin data). */
  minSamples?: number;
  /** Treat a bare "skipped" as a miss (default) or ignore it entirely. */
  skippedIsMiss?: boolean;
}

/** Wilson score interval — honest CI for a proportion (better than normal at small n). */
export function wilson(hits: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 0];
  const p = hits / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/** Did this outcome confirm the prediction? null = no scorable signal. */
export function outcomeIsHit(kind: OutcomeKind, skippedIsMiss = true): boolean | null {
  if (POSITIVE.has(kind)) return true;
  if (HARD_NEGATIVE.has(kind)) return false;
  if (kind === 'skipped') return skippedIsMiss ? false : null;
  return null;
}

function bucket(rows: readonly boolean[], minSamples: number): Bucket {
  const n = rows.length;
  const hits = rows.reduce((s, b) => s + (b ? 1 : 0), 0);
  const [ciLow, ciHigh] = wilson(hits, n);
  return { n, hits, accuracy: n ? hits / n : 0, ciLow, ciHigh, reliable: n >= minSamples };
}

/** Group scorable rows by a key → Bucket. */
function groupBy(scored: { key: string; hit: boolean }[], minSamples: number): Record<string, Bucket> {
  const byKey = new Map<string, boolean[]>();
  for (const s of scored) {
    const arr = byKey.get(s.key) ?? [];
    arr.push(s.hit);
    byKey.set(s.key, arr);
  }
  const out: Record<string, Bucket> = {};
  for (const [k, arr] of byKey) out[k] = bucket(arr, minSamples);
  return out;
}

/**
 * Build the full accuracy report from joined impression+outcome rows. Only rows
 * with a scorable outcome contribute; small buckets are flagged unreliable.
 */
export function accuracyReport(rows: readonly EvalRow[], opts: AccuracyOptions = {}): AccuracyReport {
  const minSamples = opts.minSamples ?? 20;
  const skippedIsMiss = opts.skippedIsMiss ?? true;

  // Reduce to scorable (hit/miss) rows, carrying their facets.
  const scored = rows
    .map((r) => ({ r, hit: outcomeIsHit(r.outcome, skippedIsMiss) }))
    .filter((x): x is { r: EvalRow; hit: boolean } => x.hit !== null);

  const hits = scored.map((s) => s.hit);
  const overall = bucket(hits, minSamples);

  const conf = (c: Confidence) => bucket(scored.filter((s) => s.r.confidence === c).map((s) => s.hit), minSamples);
  const byConfidence: Record<Confidence, Bucket> = { low: conf('low'), medium: conf('medium'), high: conf('high') };

  const fmt = (m: 'movie' | 'tv') => bucket(scored.filter((s) => s.r.mediaType === m).map((s) => s.hit), minSamples);
  const byFormat = { movie: fmt('movie'), tv: fmt('tv') } as Record<'movie' | 'tv', Bucket>;

  const cohort = (c: Cohort) => bucket(scored.filter((s) => s.r.cohort === c).map((s) => s.hit), minSamples);
  const byCohort: Record<Cohort, Bucket> = { new: cohort('new'), experienced: cohort('experienced') };

  // Genre rows fan out (a title can be several genres).
  const byGenre = groupBy(scored.flatMap((s) => s.r.genres.map((g) => ({ key: g, hit: s.hit }))), minSamples);
  const byPlatform = groupBy(scored.filter((s) => s.r.platform).map((s) => ({ key: s.r.platform as string, hit: s.hit })), minSamples);
  const byAlgoVersion = groupBy(scored.map((s) => ({ key: s.r.algoVersion, hit: s.hit })), minSamples);

  // Calibration: higher confidence should mean higher accuracy (only judged on
  // buckets that are large enough to trust).
  const relAcc = (b: Bucket): number | null => (b.reliable ? b.accuracy : null);
  const hi = relAcc(byConfidence.high);
  const mid = relAcc(byConfidence.medium);
  const lo = relAcc(byConfidence.low);
  let monotonic = true;
  let note = 'insufficient data to judge calibration';
  if (hi != null && mid != null && lo != null) {
    monotonic = hi >= mid && mid >= lo;
    note = monotonic ? 'well-calibrated: confidence tracks accuracy' : 'MISCALIBRATED: higher confidence is not more accurate';
  }

  return {
    overall,
    byConfidence,
    byFormat,
    byGenre,
    byPlatform,
    byAlgoVersion,
    byCohort,
    calibration: { monotonic, high: byConfidence.high.accuracy, medium: byConfidence.medium.accuracy, low: byConfidence.low.accuracy, note },
    minSamples,
    totalRows: scored.length,
  };
}

/**
 * Head-to-head: is algorithm B better than A? Returns the accuracy delta and
 * whether B's improvement is statistically meaningful (CIs don't overlap).
 */
export function compareAlgorithms(a: readonly EvalRow[], b: readonly EvalRow[], opts: AccuracyOptions = {}): {
  a: Bucket; b: Bucket; delta: number; bWins: boolean; significant: boolean;
} {
  const ra = accuracyReport(a, opts).overall;
  const rb = accuracyReport(b, opts).overall;
  const significant = rb.ciLow > ra.ciHigh || ra.ciLow > rb.ciHigh;
  return { a: ra, b: rb, delta: rb.accuracy - ra.accuracy, bWins: rb.accuracy > ra.accuracy, significant };
}
