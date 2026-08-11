/**
 * DNA SHOWDOWN — the session, and what a tap means.
 *
 * A pairwise choice is a COMPARATIVE statement, and the commonest way to get
 * this wrong is to read it as an absolute one. "I'd watch Se7en over Knives
 * Out" does not mean "I love Se7en"; it means that on whatever separates them,
 * Se7en's side won. So evidence is applied per-axis and weighted by how hard
 * the two titles disagreed on that axis: the winner's direction is reinforced
 * in proportion to the gap, and axes the pair agreed on move barely at all.
 *
 * NEITHER IS NOT A SKIP. It is the only answer that speaks about both films at
 * once, and it is genuinely informative: shown two films chosen precisely
 * because they split an axis, someone who wants neither is telling us the axis
 * itself is unappealing, not that they are undecided. So it applies NEGATIVE
 * evidence toward whatever both titles share, and — deliberately — nothing at
 * all on the axes they disagree about, because a refusal of both says nothing
 * about which side of that split they sit on. Treating it as a skip throws away
 * the sharpest negative signal the game collects; treating it as a vote against
 * both films' every trait would invent an opinion nobody expressed.
 *
 * PROVENANCE is recorded on every decision — which axes were being tested, what
 * was shown, what was chosen, how long it took — so a later consumer can tell
 * why the system believes something and weight it accordingly.
 *
 * PURE. Time is passed in, never read.
 */

import type { DiagnosticTitle } from '@/lib/voice/quickdna/definition';
import { observeAll, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';
import { nextMatchup, pairKey, pull, separation, type Matchup } from './matchup';

export type Verdict = 'left' | 'right' | 'neither';

/**
 * How strongly an explicit head-to-head moves a belief.
 *
 * Deliberately the heaviest evidence the product collects. A person choosing
 * between two named films they can see is the least ambiguous signal available
 * — far stronger than a behavioural inference, and stronger than a scale
 * answer, which is why the ladder in the docblock at the top of `traits.ts`
 * puts it here.
 */
export const SHOWDOWN_WEIGHT = 0.34;

/** A refusal of both speaks about shared ground, and speaks a little softer. */
export const NEITHER_WEIGHT = 0.22;

/** Enough decisions to sharpen a profile; few enough to stay under ninety seconds. */
export const TARGET_DECISIONS = 12;
export const MIN_DECISIONS = 8;

/** Below this the remaining pairs are not worth a turn — end rather than pad. */
export const GAIN_FLOOR = 0.05;

export interface ShowdownDecision {
  leftId: string;
  rightId: string;
  verdict: Verdict;
  /** Axes the matchup was chosen to separate — the reason it was asked. */
  testing: TraitKey[];
  /** Information gain expected when it was dealt. */
  gain: number;
  at: number;
  responseMs: number;
}

export interface ShowdownState {
  profile: TraitProfile;
  decisions: ShowdownDecision[];
  seenPairs: string[];
  /** Titles reported unseen. Kept so we never put them up again. */
  unseenTitles: string[];
  recentAxes: TraitKey[];
  current: Matchup | null;
  /** Confidence coverage when the session opened — the "21% → 34%" starting point. */
  openingKnown: number;
  startedAt: number;
}

export interface SessionSeed {
  profile?: TraitProfile;
  seenPairs?: readonly string[];
  unseenTitles?: readonly string[];
  openingKnown?: number;
}

export function createSession(seed: SessionSeed = {}, startedAt = 0): ShowdownState {
  return {
    profile: seed.profile ?? {},
    decisions: [],
    seenPairs: [...(seed.seenPairs ?? [])],
    unseenTitles: [...(seed.unseenTitles ?? [])],
    recentAxes: [],
    current: null,
    openingKnown: seed.openingKnown ?? 0,
    startedAt,
  };
}

function deal(state: ShowdownState): Matchup | null {
  if (state.decisions.length >= TARGET_DECISIONS) return null;
  return nextMatchup(
    {
      profile: state.profile,
      seenPairs: state.seenPairs,
      unseenTitles: state.unseenTitles,
      recentAxes: state.recentAxes,
    },
    GAIN_FLOOR,
  );
}

export function startSession(state: ShowdownState, now = 0): ShowdownState {
  return { ...state, startedAt: now, current: deal(state) };
}

/**
 * The evidence a verdict produces, per axis.
 *
 * Exported because it is the claim worth testing directly: given two titles and
 * an answer, exactly which beliefs move and in which direction.
 */
export function evidenceFor(
  matchup: Matchup,
  verdict: Verdict,
): Array<{ key: TraitKey; target: number; weight: number }> {
  const { left, right } = matchup;
  const axes = new Set<TraitKey>();
  for (const e of left.traits) axes.add(e.key);
  for (const e of right.traits) axes.add(e.key);

  const out: Array<{ key: TraitKey; target: number; weight: number }> = [];

  if (verdict === 'neither') {
    for (const key of axes) {
      const split = separation(left, right, key);
      // Only SHARED ground is condemned. Where the pair disagreed, refusing
      // both says nothing about which side they would have taken, so nothing
      // is recorded — inventing a direction here would be fabricating an
      // opinion the player did not express.
      const shared = Math.min(Math.abs(pull(left, key)), Math.abs(pull(right, key)));
      if (shared <= 0 || split > shared) continue;
      const agreedDirection = pull(left, key) + pull(right, key) >= 0 ? 1 : -1;
      out.push({
        key,
        // Push AWAY from whatever both films were offering.
        target: agreedDirection > 0 ? 0 : 100,
        weight: NEITHER_WEIGHT * shared,
      });
    }
    return out;
  }

  const winner = verdict === 'left' ? left : right;
  const loser = verdict === 'left' ? right : left;

  for (const key of axes) {
    const split = separation(left, right, key);
    if (split <= 0) continue; // They agreed here — the choice says nothing about it.
    const towardWinner = pull(winner, key) - pull(loser, key);
    if (towardWinner === 0) continue;
    out.push({
      key,
      target: towardWinner > 0 ? 100 : 0,
      // Proportional to how hard they disagreed: a decisive split is decisive
      // evidence, a marginal one is marginal.
      weight: SHOWDOWN_WEIGHT * Math.min(1, split),
    });
  }
  return out;
}

/** Record a verdict, update the profile, deal the next matchup. */
export function answer(
  state: ShowdownState,
  verdict: Verdict,
  now: number,
  responseMs: number,
): ShowdownState {
  const matchup = state.current;
  if (!matchup) return state;

  const profile = observeAll(state.profile, evidenceFor(matchup, verdict));

  const decision: ShowdownDecision = {
    leftId: matchup.left.id,
    rightId: matchup.right.id,
    verdict,
    testing: matchup.testing,
    gain: matchup.gain,
    at: now,
    responseMs,
  };

  const next: ShowdownState = {
    ...state,
    profile,
    decisions: [...state.decisions, decision],
    seenPairs: [...state.seenPairs, pairKey(matchup.left.id, matchup.right.id)],
    recentAxes: [...state.recentAxes, ...matchup.testing.slice(0, 1)].slice(-4),
    current: null,
  };
  return { ...next, current: deal(next) };
}

/**
 * "I haven't seen either of these."
 *
 * Distinct from `neither`: it is a statement about recognition, not taste, and
 * must not move a single belief. Both titles are retired so the pool stops
 * offering films this person cannot judge.
 */
export function markUnseen(state: ShowdownState, now: number): ShowdownState {
  const matchup = state.current;
  if (!matchup) return state;
  const next: ShowdownState = {
    ...state,
    unseenTitles: [...state.unseenTitles, matchup.left.id, matchup.right.id],
    seenPairs: [...state.seenPairs, pairKey(matchup.left.id, matchup.right.id)],
    startedAt: state.startedAt || now,
    current: null,
  };
  return { ...next, current: deal(next) };
}

export function isComplete(state: ShowdownState): boolean {
  return state.current === null && state.decisions.length > 0;
}

/** Decisions that produced evidence. An unseen pair is not one of them. */
export function meaningfulDecisions(state: ShowdownState): number {
  return state.decisions.length;
}
