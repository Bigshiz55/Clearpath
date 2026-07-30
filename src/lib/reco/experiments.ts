/**
 * A/B experiment assignment (pure, deterministic). Lets future recommendation
 * algorithms compete for real: a user is deterministically bucketed into a
 * variant by hashing (userId + experimentId), so the assignment is stable across
 * requests and sessions, needs no storage, and splits traffic to the configured
 * weights. Every impression records its `algoVersion`, so accuracyReport can
 * then compare variants head-to-head.
 */

/** FNV-1a 32-bit — small, stable, well-distributed. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Variant {
  /** e.g. 'reco-1.0.0' | 'reco-1.1.0-candidate' */
  id: string;
  /** Relative weight (need not sum to 1). Default 1. */
  weight?: number;
}

/**
 * Deterministically assign a user to a variant. Same (userId, experimentId) →
 * always the same variant. Traffic splits proportionally to weights.
 */
export function assignVariant(userId: string, experimentId: string, variants: Variant[]): string {
  if (variants.length === 0) throw new Error('assignVariant: no variants');
  const total = variants.reduce((s, v) => s + (v.weight ?? 1), 0);
  // Map the hash into [0, total) with good precision.
  const point = (fnv1a(`${experimentId}:${userId}`) / 0x100000000) * total;
  let acc = 0;
  for (const v of variants) {
    acc += v.weight ?? 1;
    if (point < acc) return v.id;
  }
  return variants[variants.length - 1]!.id;
}

/** Confidence bucket from a 0..100 predicted score — the shared thresholds. */
export function confidenceOf(predicted: number): 'low' | 'medium' | 'high' {
  if (predicted >= 75) return 'high';
  if (predicted >= 55) return 'medium';
  return 'low';
}

/** New vs experienced cohort from how many titles the user has rated. */
export function cohortOf(ratedCount: number): 'new' | 'experienced' {
  return ratedCount >= 20 ? 'experienced' : 'new';
}
