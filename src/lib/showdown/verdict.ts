/**
 * SHOWDOWN → THE PREFERENCE ENGINE.
 *
 * The bridge is deliberately narrow, and modelled on `taste/toPreference.ts`:
 * this layer gets no scoring path of its own. It writes into the same
 * append-only `preference_events` log every other surface writes to, so there is
 * exactly ONE model of the user and it is the one the ranking engine reads.
 *
 * WHAT EACH ANSWER MEANS, AND WHAT IT IS NOT ALLOWED TO MEAN
 *
 *   PICK (left/right)
 *     A pre-watch preference between two things, so it is ATTRACTION evidence:
 *     the winner draws them in. The loser gets NOTHING. Losing a two-way race is
 *     not a dislike — a film can be excellent and still not be the one you pick
 *     tonight — and writing a negative for it manufactures aversion out of a
 *     ranking. This is the single most common way a comparison quiz poisons a
 *     taste model.
 *
 *   PICK ON A CONTROLLED PAIR (a Twist)
 *     Same event, plus a CORRECTION on the one axis that separated them.
 *     Corrections override inferred signal at full confidence, which is exactly
 *     the extra authority a controlled comparison has earned: when everything
 *     else is held constant, the choice IS a statement about that axis. A
 *     confounded pair never writes one, because six explanations fit it.
 *
 *   NEITHER
 *     They rejected what the two have in COMMON, and said nothing about where
 *     they differ. So the event carries only the shared axes — the engine reads
 *     a partial fingerprint and learns exactly those. Writing the full
 *     fingerprint of both would score their disagreement as disliked in both
 *     directions at once, which is not a preference, it is noise.
 *
 *   HAVEN'T SEEN EITHER
 *     Nothing. Not a weak negative, not a skip event, nothing. Ignorance is a
 *     fact about someone's viewing history, not their taste, and the fastest way
 *     to make a new profile worse than empty is to let it become a dislike.
 *
 * PURE. Building the rows is separate from writing them (see
 * `actions/showdown.ts`), so every rule above is unit-testable without a
 * database.
 */

import { DIMENSION_KEYS, type TitleDimensions } from '@/lib/scoring/dimensions';
import type { PreferenceEvent, PrimaryAction } from '@/lib/preference/types';
import type { MatchupKind, ShowdownTitle } from './matchup';

/** Tags every event this surface writes, so its contribution is traceable. */
export const SOURCE = 'showdown';

/** How close two axis values must be to count as common ground. */
export const SHARED_TOLERANCE = 20;

/**
 * Axes below this are too neutral to carry meaning. Mirrors the engine's own
 * `MIN_INFO_ABS`, so the bridge never writes an axis the engine would discard.
 */
export const MIN_INFO = 15;

export type Verdict = 'left' | 'right' | 'neither' | 'unseen';

export type EventDraft = Partial<PreferenceEvent> & {
  id: string;
  titleId: string;
  action: PrimaryAction;
};

export interface VerdictInput {
  left: ShowdownTitle;
  right: ShowdownTitle;
  verdict: Verdict;
  /** `twist` grants the pick an attributable correction. */
  kind: MatchupKind;
  /** The axes the planner put this pair up to resolve, strongest first. */
  testing: readonly string[];
  sessionId: string;
  /** Stable per-round identity, so a retry cannot double-count. */
  roundId: string;
  at: number;
  dwellMs?: number;
}

/**
 * The axes two titles genuinely share — both informative, and pointing the same
 * way. This is the only thing a "Neither" is allowed to teach.
 */
export function sharedGround(a: TitleDimensions, b: TitleDimensions): TitleDimensions {
  const shared: TitleDimensions = {};
  for (const k of DIMENSION_KEYS) {
    const av = a[k];
    const bv = b[k];
    if (typeof av !== 'number' || typeof bv !== 'number') continue;
    if (Math.abs(av - bv) > SHARED_TOLERANCE) continue; // they disagree here
    const mid = (av + bv) / 2;
    if (Math.abs(mid - 50) < MIN_INFO) continue; // too neutral to mean anything
    shared[k] = mid;
  }
  return shared;
}

/**
 * The correction a controlled comparison justifies, or null.
 *
 * Only on a Twist, only for the single axis that separated the pair, and only
 * toward the value the WINNER actually holds — never a rounded-off 0 or 100,
 * which would claim a more extreme taste than the evidence supports.
 */
export function twistCorrection(
  input: VerdictInput,
): { key: string; target: number } | null {
  if (input.kind !== 'twist') return null;
  if (input.verdict !== 'left' && input.verdict !== 'right') return null;
  const key = input.testing[0];
  if (!key) return null;
  const winner = input.verdict === 'left' ? input.left : input.right;
  const target = winner.dims[key];
  if (typeof target !== 'number') return null;
  return { key, target };
}

/**
 * The canonical events this verdict should write. `[]` is a real answer.
 */
export function toPreferenceEvents(input: VerdictInput): EventDraft[] {
  // Ignorance teaches nothing. There is no code path from here to an event.
  if (input.verdict === 'unseen') return [];

  const base = {
    at: input.at,
    source: SOURCE,
    roundId: input.roundId,
    ...(input.dwellMs !== undefined ? { dwellMs: input.dwellMs } : {}),
  };

  if (input.verdict === 'neither') {
    const dims = sharedGround(input.left.dims, input.right.dims);
    // Nothing in common worth naming: say nothing rather than invent a reason.
    if (Object.keys(dims).length === 0) return [];
    return [
      {
        ...base,
        id: `showdown:${input.sessionId}:${input.roundId}:neither`,
        // Anchored on the left title only so the log has a real key to point at;
        // the payload that teaches is `dims`, which carries the shared ground.
        titleId: input.left.key,
        action: 'unseen_not_interested',
        attractionGrade: 'not_interested',
        dims,
      },
    ];
  }

  const winner = input.verdict === 'left' ? input.left : input.right;
  const draft: EventDraft = {
    ...base,
    id: `showdown:${input.sessionId}:${input.roundId}:pick`,
    titleId: winner.key,
    action: 'unseen_interested',
    attractionGrade: 'interested',
    dims: winner.dims,
  };

  const correction = twistCorrection(input);
  if (correction) draft.corrections = [correction];

  return [draft];
}
