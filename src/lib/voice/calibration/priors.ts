/**
 * RATINGS → TASTE DNA PRIORS.
 *
 * A calibration rating is the weakest kind of real evidence there is. Someone
 * saying "Comedy — 2" in a sixty-second warm-up has told us something true and
 * useful, but far less certain than the comedy they sat through and loved. The
 * whole point of this module is that the arithmetic makes that impossible to
 * get wrong: a rating is folded in as a small `evidence` weight, so it MOVES the
 * belief without ever being able to overrule an explicit reaction.
 *
 *   evidence ladder (from src/lib/preference/signals.ts)
 *     loved / hated             1.6
 *     liked / disliked          1.1
 *     "okay" quick review       0.35
 *     CALIBRATION RATING        0.3   ← here
 *
 * Worked example, and the reason for the number. Comedy = 2 gives the genre a
 * prior of pref 20 at evidence 0.3. One loved comedy then arrives at target 100
 * with weight 1.6, and the weighted mean lands at
 *
 *     (20 × 0.3 + 100 × 1.6) / 1.9  =  87.4
 *
 * — the loved title wins overwhelmingly, exactly as it should. With no titles
 * rated, the prior is all we have and comedy is correctly damped.
 *
 * ORDER DOES NOT MATTER. `accumulate` is a weighted mean, so applying priors to
 * an already-derived DnaState gives the identical result to seeding them before
 * any event was folded. That is what lets this live outside the engine instead
 * of inside it — the pure engine stays untouched.
 *
 * PURE. No I/O.
 */

import { accumulate } from '@/lib/preference/confidence';
import type { ChannelProfile, DnaState, TraitBelief } from '@/lib/preference/types';
import { CALIBRATION_ITEMS, RATING_MAX, RATING_MIN } from './items';

/**
 * Weight of a single calibration rating, deliberately below the weakest quick
 * review (0.35). See the ladder above.
 */
export const CALIBRATION_EVIDENCE = 0.3;

/**
 * A rating of exactly 5 is "no opinion", not "middling". Folding it in would
 * add evidence for a neutral position and make the user look decided about
 * something they shrugged at, so it is dropped.
 */
export const NEUTRAL_RATING = 5;

/** 0..10 → 0..100, the scale every belief in the engine speaks. */
export function ratingToTarget(value: number): number {
  const clamped = Math.max(RATING_MIN, Math.min(RATING_MAX, value));
  return (clamped / RATING_MAX) * 100;
}

export interface GenrePrior {
  genre: string;
  target: number;
  weight: number;
}

/**
 * Spread ratings across the genre slugs each item informs. An item mapping to
 * two genres splits its weight between them, so a compound item like
 * "ghosts / supernatural" cannot outvote a single-genre one just by touching
 * more keys.
 */
export function calibrationGenrePriors(ratings: Record<string, number>): GenrePrior[] {
  const out: GenrePrior[] = [];
  for (const item of CALIBRATION_ITEMS) {
    const value = ratings[item.id];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (value === NEUTRAL_RATING) continue;
    if (item.genres.length === 0) continue;
    const weight = CALIBRATION_EVIDENCE / item.genres.length;
    for (const genre of item.genres) {
      out.push({ genre, target: ratingToTarget(value), weight });
    }
  }
  return out;
}

function applyToGenres(genres: Record<string, TraitBelief>, priors: GenrePrior[]): Record<string, TraitBelief> {
  const next = { ...genres };
  for (const p of priors) {
    next[p.genre] = accumulate(next[p.genre] ?? { pref: 50, evidence: 0 }, p.target, p.weight);
  }
  return next;
}

/**
 * Fold priors into a derived DnaState, without destroying anything already
 * learned — `accumulate` only ever adds evidence and shifts the weighted mean.
 *
 * Applied to the ATTRACTION channel: a calibration rating is a statement about
 * what the user wants offered ("never show me this"), not a verdict on
 * something they watched, and putting it in `experience` would let a warm-up
 * question masquerade as a viewing history.
 */
export function applyCalibrationPriors(dna: DnaState, ratings: Record<string, number>): DnaState {
  const priors = calibrationGenrePriors(ratings);
  if (priors.length === 0) return dna;
  const attraction: ChannelProfile = {
    ...dna.attraction,
    genres: applyToGenres(dna.attraction.genres, priors),
  };
  return { ...dna, attraction };
}
