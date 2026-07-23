// Verdict tier taxonomy — working terminology, subject to product review.
// Pure and deterministic: no I/O, fully unit-tested. This is the shared
// vocabulary the recommendation pipeline (Phase 4) will map scores onto.

export type VerdictTier =
  | 'Must Read'
  | 'Strong Yes'
  | 'Worth a Look'
  | 'Maybe'
  | 'Probably Pass';

export interface TierMeta {
  tier: VerdictTier;
  /** Inclusive lower bound of the personalized 0–100 score for this tier. */
  min: number;
  /** Tailwind color token key under theme `verdict.*`. */
  colorToken: 'must' | 'strong' | 'worth' | 'maybe' | 'pass';
  /** One-line, spoiler-safe gloss shown near the badge. */
  blurb: string;
}

/** Ordered high → low. The first tier whose `min` is met wins. */
export const TIERS: readonly TierMeta[] = [
  { tier: 'Must Read', min: 85, colorToken: 'must', blurb: 'A standout match for you.' },
  { tier: 'Strong Yes', min: 72, colorToken: 'strong', blurb: 'A confident recommendation.' },
  { tier: 'Worth a Look', min: 60, colorToken: 'worth', blurb: 'Promising if the premise lands.' },
  { tier: 'Maybe', min: 45, colorToken: 'maybe', blurb: 'Situational — depends on your mood.' },
  { tier: 'Probably Pass', min: 0, colorToken: 'pass', blurb: 'Unlikely to be your next read.' },
] as const;

const clampScore = (n: number): number => {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
};

/** Map a personalized 0–100 score to its verdict tier. */
export function tierForScore(score: number): TierMeta {
  const s = clampScore(score);
  // TIERS is ordered high → low with a terminal min of 0, so a match is
  // guaranteed; the non-null assertion is safe by construction.
  return TIERS.find((t) => s >= t.min)!;
}

/** Whether a tier is a positive recommendation (used for "why it fits" framing). */
export function isPositive(tier: VerdictTier): boolean {
  return tier === 'Must Read' || tier === 'Strong Yes' || tier === 'Worth a Look';
}
