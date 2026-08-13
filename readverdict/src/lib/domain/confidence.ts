// Confidence & evidence-status primitives — the backbone of ReadVerdict's
// "never fabricate, always label" discipline. Pure, deterministic, tested.

/** How a data point came to be known. Drives how it is labelled in the UI. */
export type EvidenceStatus =
  | 'confirmed' // verified against an authoritative source
  | 'sourced' // pulled from a third-party provider, unverified
  | 'user-supplied' // the user told us directly
  | 'inferred' // derived from other signals
  | 'estimated' // calculated approximation (e.g. reading time)
  | 'ai-generated' // produced by an AI synthesis step
  | 'insufficient'; // not enough evidence to assert a value

/** Qualitative confidence band, derived from a 0..1 score. */
export type ConfidenceLabel = 'high' | 'medium' | 'low' | 'none';

/** How stable a learned preference is (Reader DNA). */
export type Stability = 'stable' | 'emerging' | 'uncertain';

export const clamp01 = (n: number): number => {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
};

/** Map a 0..1 confidence score to a qualitative band. */
export function confidenceLabel(score: number): ConfidenceLabel {
  const s = clamp01(score);
  if (s <= 0) return 'none';
  if (s >= 0.75) return 'high';
  if (s >= 0.45) return 'medium';
  return 'low';
}

/**
 * Confidence from a sample size via a saturating curve. `k` is the sample size
 * at which confidence reaches 0.5 (bigger k = more skeptical). Never returns a
 * value that overstates thin evidence.
 */
export function confidenceFromSample(sampleSize: number, k = 20): number {
  if (!Number.isFinite(sampleSize) || sampleSize <= 0) return 0;
  return clamp01(sampleSize / (sampleSize + k));
}

/**
 * Combine independent confidences. We treat them as independent probabilities
 * of being right and take the complement of joint wrongness, so more agreeing
 * evidence raises confidence but never to a false certainty from one weak source.
 */
export function combineConfidence(...scores: number[]): number {
  const valid = scores.map(clamp01).filter((s) => s > 0);
  if (valid.length === 0) return 0;
  const jointWrong = valid.reduce((acc, s) => acc * (1 - s), 1);
  return clamp01(1 - jointWrong);
}

/** Derive stability from evidence volume and confidence. */
export function stabilityOf(evidenceCount: number, confidence: number): Stability {
  const c = clamp01(confidence);
  if (evidenceCount >= 8 && c >= 0.7) return 'stable';
  if (evidenceCount >= 3 && c >= 0.4) return 'emerging';
  return 'uncertain';
}
