/**
 * COVERAGE — why the planner stops harvesting one rich seam.
 *
 * Once attribution was made honest, a latent flaw in the objective surfaced.
 * `gain = disagreement x uncertainty x answerability` is a pure entropy
 * measure, and entropy is happy to be reduced anywhere. A region of the trait
 * space that is broad, well-separated and recognisable keeps scoring highest
 * round after round, so the planner keeps mining it while whole dimensions sit
 * untouched. Two players with opposite taste were dealt the same twelve
 * matchups because both were being walked through the same high-yield seam.
 *
 * The missing quantity is not more entropy. It is BALANCE: a profile that knows
 * six axes deeply and twenty barely is worse than one that knows all
 * twenty-six adequately, because a recommender consults every axis and is only
 * as good as its blind spots. So the objective gains a third factor asking
 * "relative to everything else we know about this person, how starved is the
 * dimension this matchup would actually resolve?"
 *
 * WHY `TRAIT_KEYS` AND NOT `DIMENSION_KEYS`. The canonical scoring vocabulary
 * is `DIMENSION_KEYS`, and no mapping from a quick-DNA trait to a scoring
 * dimension exists anywhere in the codebase. Inventing one here would be
 * guessing at a correspondence and then building an objective on top of the
 * guess. `TRAIT_KEYS` IS the dimension set this planner's evidence state is
 * expressed over — it is what `TraitProfile` is keyed by — so it is the honest
 * vocabulary for measuring that state's coverage. Nothing below hard-codes a
 * count: the set is read at call time and a trait added to `QUICK_TRAITS`
 * enters the calculation with no further change. Building the bridge to
 * `DIMENSION_KEYS` is real work and belongs with the server integration that
 * needs it, not smuggled in as a lookup table nobody verified.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import {
  TRAIT_KEYS,
  traitConfidence,
  type TraitKey,
  type TraitProfile,
} from '@/lib/voice/quickdna/traits';

/**
 * How far a starved axis may be lifted, and a saturated one damped.
 *
 * Deliberately bounded and symmetric around 1. Coverage is a TIE-BREAKER
 * between questions of comparable value, never a veto: an axis nobody has
 * touched is worthless if the pair testing it is unrecognisable or barely
 * disagrees, and `coverageNeed` must not be able to drag such a pair to the
 * top. At 0.6 a maximally-starved axis is worth 1.6x a perfectly-average one
 * and a fully-saturated axis 0.4x — enough to reorder neighbours, not enough
 * to outrank a genuinely better question.
 */
export const COVERAGE_SWING = 0.6;

/** Floor/ceiling on the returned multiplier, so no single factor can dominate. */
export const COVERAGE_MIN = 1 - COVERAGE_SWING;
export const COVERAGE_MAX = 1 + COVERAGE_SWING;

/**
 * Mean confidence across the whole trait vocabulary — the bar an individual
 * axis is judged against. Read from `TRAIT_KEYS` at call time.
 */
export function meanConfidence(profile: TraitProfile): number {
  if (TRAIT_KEYS.length === 0) return 0;
  let sum = 0;
  for (const k of TRAIT_KEYS) sum += traitConfidence(profile, k);
  return sum / TRAIT_KEYS.length;
}

/**
 * How under-learned ONE axis is, relative to the rest of this profile.
 *
 * RELATIVE, not absolute, and that is the whole point. An absolute
 * "1 - confidence" is highest at the start of every session for every axis and
 * for every player, so it cannot break a tie and cannot personalise — it would
 * be a constant dressed as a signal. Measuring against the profile's own mean
 * makes the term meaningful precisely when it needs to be: after some axes have
 * been learned, the ones left behind start to stand out, and they stand out
 * differently for two people who learned different things first.
 */
export function axisCoverageNeed(profile: TraitProfile, key: TraitKey): number {
  const shortfall = meanConfidence(profile) - traitConfidence(profile, key);
  const need = 1 + COVERAGE_SWING * shortfall * 2;
  return Math.max(COVERAGE_MIN, Math.min(COVERAGE_MAX, need));
}

/**
 * The coverage need of a whole matchup: an ATTRIBUTION-WEIGHTED MEAN over the
 * axes it separates.
 *
 * A weighted MEAN, never a sum, and that distinction is the guard against
 * recreating the confounding problem. A sum would rise with the number of axes
 * touched, so the planner would relearn its old habit of preferring sprawling
 * pairs — the exact behaviour attribution was introduced to stop. A mean is
 * scale-free: a pair touching seven starved axes scores no higher than one
 * touching a single starved axis, because breadth is not the virtue here.
 *
 * Weighting by attribution is what makes a Twist benefit NATURALLY rather than
 * by special case. A single-axis pair puts all its weight on the one axis it
 * actually resolves, so if that axis is starved the pair inherits the full
 * boost. A seven-axis pair spreads its weight, so one starved axis among six
 * well-known ones is diluted to near-nothing — which is correct, because such a
 * pair cannot be relied on to resolve that axis even if it moves it.
 */
export function coverageNeed(
  profile: TraitProfile,
  axes: ReadonlyArray<{ key: TraitKey; attribution: number }>,
): number {
  let weighted = 0;
  let total = 0;
  for (const a of axes) {
    if (!(a.attribution > 0)) continue;
    weighted += a.attribution * axisCoverageNeed(profile, a.key);
    total += a.attribution;
  }
  if (total <= 0) return 1;
  return weighted / total;
}
