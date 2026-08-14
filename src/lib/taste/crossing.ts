/**
 * ONE PAIRWISE DECISION → CANONICAL EVENTS.
 *
 * The crossing every pairwise surface uses, so Showdown, a future voice
 * interview and a "which of these two" widget all speak the same grammar
 * without each inventing its own.
 *
 * THREE KINDS OF CLAIM COME OUT OF ONE TAP, and keeping them separate is the
 * whole point:
 *
 *   ATTRACTION (title-level)  "I would watch that one." Anchored to the winner,
 *     graded on the canonical attraction ladder. This is what a recommendation
 *     engine needs to know about a TITLE.
 *
 *   COMPARATIVE (axis-level)  "Whatever separates them, I want the winner's
 *     side." Broad, confounded, and correctly weak per axis — see
 *     `comparative.ts`. This is what accumulates a taste profile slowly from
 *     ordinary play.
 *
 *   STATED REASON (axis-level, single axis)  "It was the darker one." The user
 *     said which axis, so there is no attribution left to price in and the
 *     evidence lands at full strength on exactly one axis.
 *
 * WHY THE THIRD ONE IS NOT A LUXURY — MEASURED. Comparative evidence alone
 * moves a rich axis to confidence ~0.04 after 321 events, because the planner's
 * sweep pairs separate seven axes at once and attribution correctly divides the
 * tap between them. `darkness` reaches 0.48 only because it is the dominant
 * split in most pairs; every other axis sits at the attribution floor. Broad
 * comparisons cannot, on their own, make a thinly-annotated axis rankable in any
 * realistic number of sessions.
 *
 * A stated reason resolves that in one tap, because it is the one observation
 * with no ambiguity to divide. That is the architectural reason the follow-up
 * exists, and the reason it must cross into the canonical log rather than being
 * kept in Showdown's private profile — which is where it was.
 *
 * PURE. No I/O, no clock — `at` is supplied.
 */

import type { PreferenceEvent } from '@/lib/preference/types';
import type { TraitKey } from '@/lib/voice/quickdna/traits';
import { axisForTrait } from './axes';
import { comparativeDims, sharedDims } from './comparative';
import type { TitleFingerprint } from './fingerprint';

/** A title as the canonical log identifies it. */
export interface CanonicalRef {
  /** Stable engine key, e.g. "movie:807". */
  titleId: string;
  fingerprint: TitleFingerprint;
}

export type PairVerdict = 'left' | 'right' | 'neither' | 'both';

export interface PairwiseDecision {
  left: CanonicalRef;
  right: CanonicalRef;
  verdict: PairVerdict;
  at: number;
  responseMs?: number;
  /** Which canonical axis the user NAMED, if they were asked and answered. */
  statedAxis?: { key: TraitKey; high: boolean };
  /** How the attraction was graded — decided by the caller's own ladder. */
  attractionGrade: NonNullable<PreferenceEvent['attractionGrade']>;
  /** Surface that produced it. */
  source: string;
}

/**
 * Full strength for a stated reason.
 *
 * 100/0 rather than something softer because the engine reads distance from 50
 * AS the weight, and a named axis has nothing left to discount: the person told
 * us which one it was. Anything less would be pricing in an ambiguity that no
 * longer exists.
 */
const STATED_TARGET_HIGH = 100;
const STATED_TARGET_LOW = 0;

export function pairwiseEvents(d: PairwiseDecision): PreferenceEvent[] {
  const base = {
    at: d.at,
    source: d.source,
    ...(d.responseMs !== undefined ? { dwellMs: d.responseMs } : {}),
  };
  const out: PreferenceEvent[] = [];

  if (d.verdict === 'neither' || d.verdict === 'both') {
    const direction = d.verdict === 'both' ? 1 : -1;
    const dims = sharedDims(d.left.fingerprint, d.right.fingerprint, direction);
    for (const [side, ref] of [['left', d.left], ['right', d.right]] as const) {
      out.push({
        ...base,
        id: `${d.left.titleId}-${d.right.titleId}-${d.at}-${d.verdict}-${side}`,
        titleId: ref.titleId,
        dims,
        genres: [...ref.fingerprint.genres],
        action: direction > 0 ? 'unseen_interested' : 'unseen_not_interested',
        attractionGrade: direction > 0 ? d.attractionGrade : 'not_interested',
      });
    }
    return out;
  }

  const winner = d.verdict === 'left' ? d.left : d.right;
  const loser = d.verdict === 'left' ? d.right : d.left;

  /* THE COMPARATIVE VECTOR REPLACES THE WINNER'S FINGERPRINT, it does not
     accompany it. Sending the winner's own dims would re-assert every axis the
     two films shared — the exact "meaningless title-level thumbs-up" this
     crossing exists to stop. Genres still come from the winner, because
     preferring a western over a musical IS a claim about westerns. */
  const comparative = comparativeDims(winner.fingerprint, loser.fingerprint);
  out.push({
    ...base,
    id: `${d.left.titleId}-${d.right.titleId}-${d.at}-${d.verdict}`,
    titleId: winner.titleId,
    dims: comparative.dims,
    genres: [...winner.fingerprint.genres],
    action: 'unseen_interested',
    attractionGrade: d.attractionGrade,
  });

  if (d.statedAxis) {
    const mapped = axisForTrait(d.statedAxis.key);
    if (mapped) {
      /* A SEPARATE EVENT, NOT A MERGE INTO THE ONE ABOVE. The two claims have
         different provenance and different strength — one is an inference from
         a comparison, the other is a sentence the user said — and folding them
         into a single row would make it impossible to tell later which of a
         person's beliefs they actually stated. The log is the source of truth;
         it should record what happened, not a summary of it. */
      const high = mapped.invert ? !d.statedAxis.high : d.statedAxis.high;
      out.push({
        ...base,
        id: `${d.left.titleId}-${d.right.titleId}-${d.at}-reason-${mapped.axis}`,
        titleId: winner.titleId,
        dims: { [mapped.axis]: high ? STATED_TARGET_HIGH : STATED_TARGET_LOW },
        action: 'unseen_interested',
        // The reason explains the choice; it is not a stronger wish for the
        // title. `interested` is the ordinary rung — see `canonical.ts`.
        attractionGrade: 'interested',
      });
    }
  }

  return out;
}
