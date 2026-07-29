/**
 * DID WE GET IT RIGHT? — the accuracy loop, as pure logic.
 *
 * Everything else in the product predicts. Nothing until now closed the loop by
 * asking the only question that can prove a prediction: after you watched it,
 * were we right? A recommender that never checks its own answers is a recommender
 * that cannot improve and cannot honestly claim to be accurate.
 *
 * Three rules shape this module.
 *
 *   1. WE ASK ONCE. A prompt that reappears after you answered it is nagging,
 *      and a second answer for the same title would double-count in the
 *      accuracy numbers. `alreadyAnswered` reads the rating we already hold.
 *
 *   2. WE GRADE OURSELVES AGAINST WHAT WE ACTUALLY SAID. The grade compares the
 *      user's reaction to the band our score put the title in at the time —
 *      not to a moving target. If we have no score on record, we say so and
 *      grade nothing rather than inventing a comparison.
 *
 *   3. WE DO NOT PUBLISH AN ACCURACY NUMBER UNTIL IT MEANS SOMETHING. Three
 *      graded calls is not a hit rate, it's a coin-flip with a percent sign.
 *      Under `MIN_ACCURACY_SAMPLE` we report progress toward the number and
 *      never the number itself.
 *
 * No I/O. The persistence layer is `src/lib/actions/postWatch.ts`; the deeper
 * cohort/calibration analysis lives in `src/lib/reco/accuracy.ts`.
 */

import type { OutcomeKind } from '@/lib/reco/accuracy';
import { tierFromScore, primaryCallFromTier } from '@/lib/scoring/verdict';

export type Reaction = 'loved' | 'liked' | 'okay' | 'not_for_me';

/** The band our score put the title in — what we actually told the user to do. */
export type PredictedBand = 'watch' | 'maybe' | 'skip';

/** How the call turned out. `partial` = we hedged, or we were directionally off. */
export type CallResult = 'hit' | 'partial' | 'miss';

export interface ReactionOption {
  id: Reaction;
  /** Plain words. No five-point scale, no stars to decode. */
  label: string;
  /** The one-line reason a user picks this over the neighbouring option. */
  hint: string;
  /**
   * Written to `watchlist_items.rating` (1..10) — the SAME field Taste-DNA
   * already learns from, so this feedback improves recommendations instead of
   * only measuring them. `reactionFromRating` is its exact inverse.
   */
  rating: number;
  /** How `src/lib/reco/accuracy.ts` scores this reaction. */
  outcome: OutcomeKind;
}

export const REACTIONS: readonly ReactionOption[] = [
  { id: 'loved', label: 'Loved it', hint: 'More like this, please', rating: 10, outcome: 'rated_up' },
  { id: 'liked', label: 'Liked it', hint: 'Glad I watched', rating: 8, outcome: 'rated_up' },
  { id: 'okay', label: 'It was okay', hint: 'Fine, not memorable', rating: 6, outcome: 'watched' },
  { id: 'not_for_me', label: 'Not for me', hint: 'Wish I’d skipped it', rating: 3, outcome: 'rated_down' },
] as const;

export function reactionOption(id: Reaction): ReactionOption {
  const found = REACTIONS.find((r) => r.id === id);
  // Exhaustive by construction; the throw documents that rather than returning
  // a silent default that would then be written to a user's profile.
  if (!found) throw new Error(`Unknown reaction: ${id}`);
  return found;
}

/**
 * The inverse of `ReactionOption.rating`, and our DEDUPE KEY. Any rating we
 * already hold means the user has answered — whether they answered here or set
 * the rating by hand on the watchlist. Either way we don't ask again.
 */
export function reactionFromRating(rating: number | null | undefined): Reaction | null {
  if (rating == null || !Number.isFinite(rating)) return null;
  if (rating >= 9) return 'loved';
  if (rating >= 7) return 'liked';
  if (rating >= 5) return 'okay';
  return 'not_for_me';
}

/** Have we already got this user's answer for this title? */
export function alreadyAnswered(rating: number | null | undefined): boolean {
  return reactionFromRating(rating) !== null;
}

/**
 * WE GRADE OURSELVES AGAINST THE CALL WE PRINTED, not against a second set of
 * thresholds that happen to live in this file. The band is derived straight from
 * the deterministic engine's own `tierFromScore` → `primaryCallFromTier`, so if
 * those thresholds ever move, the grading moves with them and cannot silently
 * start scoring us against a call we never made. (Read-only use of the engine —
 * nothing here changes it.)
 */
export function bandFor(predicted: number): PredictedBand {
  const call = primaryCallFromTier(tierFromScore(predicted));
  return call === 'WATCH IT' ? 'watch' : call === 'MAYBE' ? 'maybe' : 'skip';
}

const BAND_PHRASE: Record<PredictedBand, string> = {
  watch: 'worth your time',
  maybe: 'a maybe',
  skip: 'one to skip',
};

/**
 * THE GRADE TABLE, written out rather than derived, because the interesting
 * cases are the asymmetric ones and a formula would hide them.
 *
 * A `maybe` cannot score a full miss in either direction — hedging is what a
 * maybe is for, and pretending otherwise would flatter our hit rate on the
 * exact calls where we were least sure. A `skip` that you liked IS a full miss:
 * we talked you out of something you'd have enjoyed, which is the costliest
 * error this product can make.
 */
const GRADE: Record<PredictedBand, Record<Reaction, CallResult>> = {
  watch: { loved: 'hit', liked: 'hit', okay: 'partial', not_for_me: 'miss' },
  maybe: { loved: 'partial', liked: 'hit', okay: 'hit', not_for_me: 'partial' },
  skip: { loved: 'miss', liked: 'miss', okay: 'partial', not_for_me: 'hit' },
};

export interface CallGrade {
  /** null when we had no score on record — nothing to grade, and we say so. */
  result: CallResult | null;
  band: PredictedBand | null;
  headline: string;
  detail: string;
}

/**
 * Grade one call. `predicted` is the score we showed at the time (0..100), or
 * null if we never had one.
 */
export function gradeCall(predicted: number | null | undefined, reaction: Reaction): CallGrade {
  const opt = reactionOption(reaction);
  if (predicted == null || !Number.isFinite(predicted)) {
    return {
      result: null,
      band: null,
      headline: 'Noted.',
      detail: 'We didn’t have a score on record for this one, so there’s nothing for us to grade — but your rating still sharpens what we show you next.',
    };
  }
  const band = bandFor(predicted);
  const result = GRADE[band][reaction];
  const said = `We said ${Math.round(predicted)} — ${BAND_PHRASE[band]}.`;
  const you = `You said “${opt.label.toLowerCase()}.”`;
  const headline = result === 'hit' ? 'We called it.' : result === 'partial' ? 'Half right.' : 'We got that one wrong.';
  const closing =
    result === 'hit'
      ? ''
      : result === 'partial'
        ? ' Logged either way.'
        : ' That goes on our record, and it moves your profile.';
  return { result, band, headline, detail: `${said} ${you}${closing}` };
}

/**
 * Below this many graded calls we show progress, never a percentage. Ten is the
 * same floor `DNA_PERSONAL_MIN` uses to start claiming personalization, so the
 * product makes one promise about thin data rather than two different ones.
 */
export const MIN_ACCURACY_SAMPLE = 10;

export interface AccuracyLine {
  /** True once there is enough data to state a rate at all. */
  shown: boolean;
  graded: number;
  hits: number;
  /** Whole percent. Meaningless — and not to be displayed — when `shown` is false. */
  percent: number;
  text: string;
}

/**
 * Our hit rate on THIS user's calls, or an honest statement of why there isn't
 * one yet. `partial` counts as half: it is neither a clean call nor a failure,
 * and putting it in either bucket would misreport us in one direction.
 */
export function accuracyLine(
  results: readonly (CallResult | null)[],
  minSample = MIN_ACCURACY_SAMPLE,
): AccuracyLine {
  const graded = results.filter((r): r is CallResult => r !== null);
  const n = graded.length;
  const credit = graded.reduce((s, r) => s + (r === 'hit' ? 1 : r === 'partial' ? 0.5 : 0), 0);
  const hits = graded.filter((r) => r === 'hit').length;
  if (n < minSample) {
    const need = minSample - n;
    return {
      shown: false,
      graded: n,
      hits,
      percent: 0,
      text:
        n === 0
          ? `Rate what you watch and we’ll start scoring ourselves — ${minSample} calls until we can show you our accuracy.`
          : `${n} of your calls graded. ${need} more and we’ll show you how often we get it right.`,
    };
  }
  const percent = Math.round((credit / n) * 100);
  return {
    shown: true,
    graded: n,
    hits,
    percent,
    text: `We’ve called ${percent}% of your ${n} rated titles right.`,
  };
}
