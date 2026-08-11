/**
 * HOW MUCH IS ONE TAP WORTH?
 *
 * Showdown used a flat `SHOWDOWN_WEIGHT = 0.34` for every pick. That is wrong
 * in a specific and expensive direction: it pays a CONFOUNDED observation the
 * same as a clean one.
 *
 * Choosing Se7en over Knives Out moves darkness, comedy, patience and
 * complexity all at once, and exactly one of them might be the reason. Four
 * full-strength writes from one tap is four claims where the player made one,
 * and three of them are probably wrong. Choosing between two films that differ
 * on ONE axis has no such ambiguity — whatever moved, that is what moved.
 *
 * So strength decomposes, and each factor answers a different question:
 *
 *   base           what an explicit head-to-head is worth at best
 *   separation     how hard the two films disagreed on THIS axis
 *   attribution    how confident we are it was THIS axis and not a neighbour
 *   informationValue  how much the answer was worth asking for at all
 *
 * ATTRIBUTION IS THE NEW PART, and it is a property of the MATCHUP, not of the
 * axis: it falls as the number and magnitude of simultaneously-differing axes
 * rises. A two-axis pair is not half as trustworthy as a one-axis pair — the
 * ambiguity grows sublinearly, because a strong split alongside three trivial
 * ones is still mostly attributable. Hence the effective-axis count below
 * weights each competing axis by its own separation rather than counting it.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import type { TraitKey } from '@/lib/voice/quickdna/traits';

/**
 * The ceiling for a perfectly clean, maximally-separated comparison — a Twist.
 *
 * ANCHORED, NOT INVENTED. This is the strength the canonical preference engine
 * already assigns to an explicit `interested` attraction grade
 * (`signals.ts`: attraction/interested = 0.8), and that is the correct
 * comparison: a clean single-axis head-to-head is a person stating a preference
 * about a named title they can see, which is exactly what an attraction grade
 * is. Picking a number Showdown liked, in a unit only Showdown used, is how the
 * old flat 0.34 came to be indefensible in either direction.
 *
 * It is REACHABLE ONLY by an observation that deserves it. A typical
 * seven-axis matchup lands its leading axis near 0.33 — roughly where the old
 * flat constant sat, which is why calibration still learns at the same speed —
 * while its incidental axes land near 0.06. The old constant paid all seven the
 * same, and that was the defect.
 */
export const MAX_PERMANENT_WEIGHT = 0.8;

/**
 * Attribution at which a multi-axis observation is still worth full trust.
 * One clearly-dominant axis among noise should not be punished as if the pair
 * were genuinely ambiguous.
 */
export const ATTRIBUTION_FLOOR = 0.25;

/**
 * EFFECTIVE competing axes: not a count, a separation-weighted mass.
 *
 * A pair splitting hard on `darkness` (0.9) and barely on `comedy` (0.05) is
 * nearly a single-axis pair, and counting it as two would throw away most of a
 * good observation. Dividing each split by the strongest one expresses that:
 * the dominant axis contributes 1, a trivial one contributes almost nothing.
 */
export function effectiveAxes(separations: readonly number[]): number {
  const positive = separations.filter((s) => s > 0);
  if (positive.length === 0) return 0;
  const strongest = Math.max(...positive);
  if (!(strongest > 0)) return 0;
  return positive.reduce((sum, s) => sum + s / strongest, 0);
}

/**
 * How cleanly this matchup isolates any one axis. 1 = single-axis (a Twist).
 *
 * `1/sqrt(axes)` RATHER THAN `1/axes`, and the difference is not cosmetic. The
 * diagnostic catalogue is richly annotated — a real opening matchup separates
 * SEVEN axes — so `1/axes` pinned essentially every pair to the floor. That is
 * not discrimination, it is a uniform 3-4x tax: clean and confounded pairs came
 * out the same, profiles stopped moving enough to change the next question, and
 * the planner dealt two opposite-taste people identical sessions.
 *
 * The square root keeps the ordering that matters — a Twist is still worth
 * ~2.5x a seven-axis scramble — while leaving a broad pair enough strength to
 * actually teach something. Ambiguity grows with the number of competing
 * explanations, but it grows sublinearly: seven candidate causes is not seven
 * times less informative than one, because the leading axis is still usually
 * the reason.
 */
export function attributionConfidence(separations: readonly number[]): number {
  const axes = effectiveAxes(separations);
  if (axes <= 0) return 0;
  return Math.max(ATTRIBUTION_FLOOR, Math.min(1, 1 / Math.sqrt(axes)));
}

/**
 * Attribution for ONE axis within a matchup.
 *
 * The matchup-level number says how ambiguous the pair is overall; this says
 * how much of that ambiguity attaches to a PARTICULAR axis. The axis that split
 * hardest is the likeliest reason for the tap and keeps most of the strength;
 * an axis that barely differed is the one we are guessing about, and is damped
 * accordingly.
 *
 * This is what actually satisfies "a choice between movies that differ on four
 * axes must not create four full-confidence writes" — the matchup-level factor
 * alone would create four EQUALLY reduced writes, which is a different and
 * weaker claim.
 */
export function axisAttribution(separation: number, separations: readonly number[]): number {
  const strongest = Math.max(0, ...separations);
  if (!(strongest > 0)) return 0;
  const share = Math.max(0, Math.min(1, separation / strongest));
  /* THE FLOOR APPLIES PER AXIS, not only to the matchup.
     Without it the two damping terms compound — a trailing axis in a seven-way
     pair fell to ~8% of full strength, which is not "diluted", it is "silently
     discarded". Axes that never accumulate evidence never lose uncertainty, so
     the planner keeps re-asking the same broad questions of everybody and the
     game stops personalising. A weak observation is still an observation. */
  return Math.max(ATTRIBUTION_FLOOR, share * attributionConfidence(separations));
}

/** A matchup that isolates a single axis well enough to be a Twist. */
export const TWIST_ATTRIBUTION_MIN = 0.8;

export function isTwist(separations: readonly number[]): boolean {
  return attributionConfidence(separations) >= TWIST_ATTRIBUTION_MIN;
}

export interface WeightInput {
  /** Separation on the axis being written, 0..1. */
  separation: number;
  /** Attribution confidence for the whole matchup, 0..1. */
  attribution: number;
  /** Expected information gain when the matchup was dealt, 0..1-ish. */
  informationValue: number;
  /** Ceiling override — `NEITHER` speaks a little softer. */
  base?: number;
}

/**
 * Information value floors at this much of full strength.
 *
 * MEASURED. Gain is a PLANNER SCORE, not a probability — a perfectly good
 * matchup routinely scores 0.1 — so multiplying the weight by it raw (or by its
 * square root) shrank every observation by 3-10x, not just the confounded ones.
 * The consequence was not subtle: profiles stopped moving enough to change what
 * the planner asked next, and two simulated people with opposite taste were
 * dealt all twelve matchups identically. `intelligence.test.ts` caught it.
 *
 * The principle survives — a question barely worth asking yields a slightly
 * softer answer — but as a modest modifier rather than the dominant term. An
 * answered question is an observation regardless of how surprised we were to
 * get it; gain decides WHAT to ask, attribution decides how much to BELIEVE.
 */
export const INFO_VALUE_FLOOR = 0.7;

/** The final permanent weight for one axis of one decision. */
export function permanentWeight(input: WeightInput): number {
  const base = input.base ?? MAX_PERMANENT_WEIGHT;
  const sep = Math.max(0, Math.min(1, input.separation));
  const attr = Math.max(0, Math.min(1, input.attribution));
  const gain = Math.max(0, Math.min(1, input.informationValue));
  const info = INFO_VALUE_FLOOR + (1 - INFO_VALUE_FLOOR) * gain;
  const w = base * sep * attr * info;
  return w > 0 ? w : 0;
}

/** Separations keyed by axis — the input the session builds per matchup. */
export type SeparationMap = Partial<Record<TraitKey, number>>;
