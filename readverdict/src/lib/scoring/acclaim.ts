// The ReadVerdict Acclaim Score — one honest 0..100 quality number blended
// from every rating feed we actually have for a book. Pure, deterministic,
// unit-tested. Two ideas keep it honest, mirroring the discipline of the rest
// of the engine:
//   1. Each source is weighted by a BASE weight × a per-title CONFIDENCE that
//      grows with sample size. A 5-star average from 3 ratings never dominates.
//   2. We only ever blend sources that are really present, and when the total
//      evidence is thin we shrink the result toward a neutral prior and label
//      it low-confidence — never fabricating a number we don't have.
//
// Today the only public feed with per-title ratings is Open Library, but the
// blend is written for N sources so adding Goodreads/StoryGraph later is a
// data change, not an engine rewrite.
import type { Confidence } from '@/lib/types';

export type AcclaimSourceKey = 'openLibrary' | 'goodreads' | 'storygraph';

export type AcclaimWeights = Record<AcclaimSourceKey, number>;

export interface SourceReading {
  key: AcclaimSourceKey;
  /** Normalized 0..100 (e.g. Open Library 4.2/5 → 84). */
  value: number;
  /** Ratings backing it. Use Infinity for editorial aggregates with no count. */
  sampleSize: number;
}

export interface AcclaimContribution {
  key: AcclaimSourceKey;
  value: number;
  /** Effective share of the final blend, 0..1, across present sources. */
  weight: number;
}

export interface AcclaimResult {
  score: number; // 0..100
  confidence: Confidence;
  /** 0..1 — how much real evidence backs the score (drives the neutral pull). */
  trust: number;
  contributions: AcclaimContribution[];
  coverage: number; // number of sources actually present
}

const NEUTRAL = 55;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** Base weights across feeds. Open Library is the only public one for now. */
export const ACCLAIM_WEIGHTS: AcclaimWeights = {
  openLibrary: 1,
  goodreads: 1,
  storygraph: 0.8,
};

/** How many ratings until a source is "fully" trusted on its own. Book rating
 *  pools are far smaller than movie vote pools, so this is intentionally low. */
const CONF_K: Record<AcclaimSourceKey, number> = {
  openLibrary: 25,
  goodreads: 100,
  storygraph: 50,
};

function confidenceOf(key: AcclaimSourceKey, sampleSize: number): number {
  if (!Number.isFinite(sampleSize)) return 1; // editorial aggregate → trusted
  if (sampleSize <= 0) return 0;
  const k = CONF_K[key];
  return sampleSize / (sampleSize + k);
}

/**
 * Blend the present sources into one Acclaim Score. Missing sources are simply
 * absent (never penalized, never faked); thin evidence pulls the score toward
 * the neutral prior and lowers the confidence label.
 */
export function computeAcclaim(
  readings: SourceReading[],
  weights: AcclaimWeights = ACCLAIM_WEIGHTS,
): AcclaimResult {
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
  const raw = sumEff > 0 ? parts.reduce((a, p) => a + p.value * p.eff, 0) / sumEff : NEUTRAL;
  const trust = presentBase > 0 ? clamp(sumEff / presentBase, 0, 1) : 0;
  // Thin evidence → shrink toward neutral so we never over-claim.
  const score = clamp(raw * trust + NEUTRAL * (1 - trust));

  const contributions: AcclaimContribution[] = parts.map((p) => ({
    key: p.key,
    value: Math.round(p.value),
    weight: sumEff > 0 ? p.eff / sumEff : 0,
  }));

  let confidence: Confidence = 'low';
  if (trust >= 0.66 && present.length >= 1) confidence = 'high';
  else if (trust >= 0.4) confidence = 'medium';

  return { score: Math.round(score), confidence, trust, contributions, coverage: present.length };
}
