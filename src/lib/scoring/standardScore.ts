// The WatchVrdIQt Standard Score — one honest 0..100 quality number blended
// from every rating source we actually have for a title (TMDB audience, IMDb,
// Rotten Tomatoes critics, Metacritic). Pure, deterministic, unit-tested — the
// same discipline as the rest of scoring. Two ideas make it honest:
//   1. Each source is weighted by a learnable BASE weight × a per-title
//      CONFIDENCE (sample size). A 100%-from-8-reviews never dominates.
//   2. We only ever blend sources that are really present, and when the total
//      evidence is thin we shrink the result toward a neutral prior and label
//      it low-confidence — never fabricating a number we don't have.
// The base weights live in `standardWeights.ts` and are tuned by the
// calibration brain (`calibrateStandardScore.ts`) against real user ratings.
import type { Confidence } from '@/lib/types';

export type StandardSourceKey = 'tmdbAudience' | 'imdb' | 'rottenTomatoes' | 'rtAudience' | 'metacritic';

export interface StandardWeights {
  tmdbAudience: number;
  imdb: number;
  rottenTomatoes: number;
  rtAudience: number;
  metacritic: number;
}

export interface SourceReading {
  key: StandardSourceKey;
  /** Normalized 0..100 (e.g. IMDb 8.6 → 86, RT 91 → 91). */
  value: number;
  /** Votes/reviews backing it. Use Infinity for editorial aggregates (RT,
   *  Metacritic, IMDb from OMDb) that carry no per-title count but are trusted. */
  sampleSize: number;
}

export interface StandardContribution {
  key: StandardSourceKey;
  value: number;
  /** Effective share of the final blend, 0..1, across present sources. */
  weight: number;
}

export interface StandardResult {
  score: number; // 0..100
  confidence: Confidence;
  /** 0..1 — how much real evidence backs the score (drives the neutral pull). */
  trust: number;
  contributions: StandardContribution[];
  coverage: number; // number of sources actually present
}

const NEUTRAL = 55;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** How many samples until a source is "fully" trusted on its own. */
const CONF_K: Record<StandardSourceKey, number> = {
  tmdbAudience: 250,
  imdb: 250,
  rottenTomatoes: 1,
  rtAudience: 1,
  metacritic: 1,
};

function confidenceOf(key: StandardSourceKey, sampleSize: number): number {
  if (!Number.isFinite(sampleSize)) return 1; // editorial aggregate → trusted when present
  if (sampleSize <= 0) return 0;
  const k = CONF_K[key];
  return sampleSize / (sampleSize + k);
}

/**
 * Blend the present sources into one Standard Score. Missing sources are simply
 * absent from the average (never penalized, never faked); thin evidence pulls
 * the score toward the neutral prior and lowers the confidence label.
 */
export function computeStandardScore(readings: SourceReading[], weights: StandardWeights): StandardResult {
  const present = readings.filter((r) => Number.isFinite(r.value));
  if (present.length === 0) {
    return { score: NEUTRAL, confidence: 'low', trust: 0, contributions: [], coverage: 0 };
  }

  const parts = present.map((r) => {
    const base = Math.max(0, weights[r.key]);
    const c = confidenceOf(r.key, r.sampleSize);
    return { key: r.key, value: clamp(r.value), eff: base * c, c };
  });

  const sumEff = parts.reduce((a, p) => a + p.eff, 0);
  const presentBase = present.reduce((a, r) => a + Math.max(0, weights[r.key]), 0) || 1;
  // Evidence-weighted mean of the sources we actually have.
  const raw = sumEff > 0 ? parts.reduce((a, p) => a + p.value * p.eff, 0) / sumEff : NEUTRAL;
  // Trust = average confidence of the present sources (weighted by base weight).
  const trust = presentBase > 0 ? clamp(sumEff / presentBase, 0, 1) : 0;
  // Thin evidence → shrink toward neutral so we never over-claim.
  const score = clamp(raw * trust + NEUTRAL * (1 - trust));

  const contributions: StandardContribution[] = parts.map((p) => ({
    key: p.key,
    value: Math.round(p.value),
    weight: sumEff > 0 ? p.eff / sumEff : 0,
  }));

  // Confidence needs BOTH solid per-source trust AND corroboration (coverage).
  let confidence: Confidence = 'low';
  if (trust >= 0.66 && present.length >= 2) confidence = 'high';
  else if (trust >= 0.4) confidence = 'medium';

  return { score: Math.round(score), confidence, trust, contributions, coverage: present.length };
}
