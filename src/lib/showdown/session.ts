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
import { type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';
import { pairKey, pull, separation, type Matchup } from './matchup';
import { SCAN_DECISIONS, SCAN_MIN_DECISIONS, nextScanMatchup } from './scanner';
import {
  MAX_PERMANENT_WEIGHT,
  attributionConfidence,
  axisAttribution,
  permanentWeight,
} from './attribution';
import {
  NO_EVIDENCE,
  accumulateSession,
  applyPermanent,
  type DecisionEvidence,
  type PermanentTraitEvidence,
  type SessionContextEvidence,
  type SessionLean,
  type ShowdownMode,
} from './evidence';

/**
 * BOTH is not a hedge, it is a distinct claim.
 *
 * Without it, someone who genuinely wants both films has only bad options:
 * pick one (inventing a preference they do not hold) or answer Neither (which
 * records the exact opposite of what they meant). Strong attraction to both
 * must never be recorded as indifference. It reinforces what the pair SHARES —
 * the mirror of Neither — and says nothing about the axes they split on,
 * because wanting both is not a statement about which side you are on.
 */
export type Verdict = 'left' | 'right' | 'neither' | 'both';

/**
 * The ceiling for a permanent write, reached only by a clean single-axis
 * comparison. See `attribution.ts` — the flat 0.34 that used to sit here paid a
 * four-axis guess the same as a one-axis certainty, and that was the defect.
 */
export const SHOWDOWN_WEIGHT = MAX_PERMANENT_WEIGHT;

/**
 * A refusal of both speaks about shared ground, and speaks a little softer.
 *
 * EXPRESSED AS A RATIO, not an absolute. It was 0.22 against a ceiling of 0.34
 * — 65% — and when the ceiling was re-anchored to the canonical attraction
 * ladder, leaving 0.22 stranded silently made "Neither" four times weaker
 * relative to a pick than it had ever been. That is not a tuning detail: in the
 * two-opposite-people simulation, `Neither` is the only answer whose evidence
 * SET differs between players (a pick moves the same axes whichever side is
 * chosen; a refusal moves only what the pair shares), so quietly demoting it
 * collapsed the divergence the planner exists to produce.
 */
export const NEITHER_RATIO = 0.65;
export const NEITHER_WEIGHT = MAX_PERMANENT_WEIGHT * NEITHER_RATIO;

/** How far one tonight-answer tilts an axis it selected for. */
export const SESSION_LEAN_STEP = 0.34;

/** Enough decisions to sharpen a profile; few enough to stay under ninety seconds. */
/* Twenty decisions, forty unique title exposures, ninety-odd seconds. Twelve
   could not sweep the universe AND branch AND resolve — it was one phase's
   worth of rounds spread over three jobs. */
export const TARGET_DECISIONS = SCAN_DECISIONS;
export const MIN_DECISIONS = SCAN_MIN_DECISIONS;

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
  /** Which question this run is asking. Decides which ledger fills. */
  mode: ShowdownMode;
  /**
   * PERMANENT identity. In `tonight` mode this is seeded from what is already
   * known (so the planner can still target open axes) and is NEVER written —
   * `answer` reassigns it by reference, and `sessionOnlyLeavesProfileIntact` in
   * the test suite pins that.
   */
  profile: TraitProfile;
  /** TONIGHT only. Empty in `dna` mode. Discarded when the session ends. */
  lean: SessionLean;
  decisions: ShowdownDecision[];
  seenPairs: string[];
  /** Titles reported unseen. Kept so we never put them up again. */
  unseenTitles: string[];
  /**
   * EVERY title shown this session — the absolute no-repeat invariant.
   * Winner, loser, refused, unrecognised: once seen, never dealt again.
   */
  seenTitleIds: string[];
  recentAxes: TraitKey[];
  current: Matchup | null;
  /** Rounds spent on pairs the player did not recognise. They advance the
   *  scan clock without producing evidence, so the phases still progress. */
  unseenRounds: number;
  /** Confidence coverage when the session opened — the "21% → 34%" starting point. */
  openingKnown: number;
  startedAt: number;
}

export interface SessionSeed {
  profile?: TraitProfile;
  seenPairs?: readonly string[];
  unseenTitles?: readonly string[];
  seenTitleIds?: readonly string[];
  openingKnown?: number;
}

export function createSession(
  seed: SessionSeed = {},
  startedAt = 0,
  mode: ShowdownMode = 'dna',
): ShowdownState {
  return {
    mode,
    profile: seed.profile ?? {},
    lean: {},
    decisions: [],
    seenPairs: [...(seed.seenPairs ?? [])],
    unseenTitles: [...(seed.unseenTitles ?? [])],
    seenTitleIds: [...(seed.seenTitleIds ?? [])],
    recentAxes: [],
    current: null,
    unseenRounds: 0,
    openingKnown: seed.openingKnown ?? 0,
    startedAt,
  };
}

/**
 * Deal the next matchup through the phase-aware scanner.
 *
 * `seenTitleIds` carries BOTH the no-repeat invariant and the unseen-title
 * retirement — a title the player did not recognise is already in the set, so
 * it cannot come back either. One exclusion list, one invariant, nothing to
 * keep in sync.
 */
function deal(state: ShowdownState): Matchup | null {
  if (state.decisions.length + state.unseenRounds >= TARGET_DECISIONS) return null;
  return nextScanMatchup({
    profile: state.profile,
    seenTitleIds: [...state.seenTitleIds, ...state.unseenTitles],
    recentAxes: state.recentAxes,
    decisionIndex: state.decisions.length + state.unseenRounds,
    total: TARGET_DECISIONS,
  });
}

export function startSession(state: ShowdownState, now = 0): ShowdownState {
  return { ...state, startedAt: now, current: deal(state) };
}


/* WHY "NEITHER" STAYS ON SHARED GROUND ONLY.
   A broader reading was tried — condemn every axis the pair asserts without
   CONFLICTING — because on a cold-start sweep pair (chosen to be maximally far
   apart) there is almost no shared ground, so Neither on the opening question
   teaches close to nothing. That looked like a bug worth fixing and is not:
   a sweep pair touches a dozen axes, so the broader rule turns one tap into
   twelve claims, which is precisely the confounding `attribution.ts` exists to
   stop. The information genuinely is thin there, and inventing structure to
   hide that is worse than reporting it. Two pre-existing cases assert this
   boundary deliberately; they were right. */

/** Every axis either title asserts anything about. */
function axesOf(matchup: Matchup): TraitKey[] {
  const axes = new Set<TraitKey>();
  for (const e of matchup.left.traits) axes.add(e.key);
  for (const e of matchup.right.traits) axes.add(e.key);
  return [...axes];
}

/**
 * How hard this pair splits on each axis it touches — the input to attribution.
 * Exported because "how confounded is this matchup" is a claim worth asserting
 * directly in tests rather than inferring from a resulting weight.
 */
export function separations(matchup: Matchup): number[] {
  return axesOf(matchup)
    .map((key) => Math.min(1, separation(matchup.left, matchup.right, key)))
    .filter((s) => s > 0);
}

/**
 * PERMANENT evidence from a verdict — `dna` mode only.
 *
 * Every axis the pair genuinely split on moves toward the chosen film, scaled
 * by that split, by how cleanly the matchup isolates anything at all, and by
 * how much the question was worth asking. Axes the two films agreed on do not
 * move: the choice said nothing about them.
 */
export function permanentEvidenceFor(
  matchup: Matchup,
  verdict: Verdict,
): PermanentTraitEvidence[] {
  const { left, right } = matchup;
  const seps = separations(matchup);
  const attribution = attributionConfidence(seps);
  const informationValue = matchup.gain;
  const out: PermanentTraitEvidence[] = [];

  if (verdict === 'both') {
    // The mirror of Neither: endorse everything the pair asserts without
    // conflict, stay silent only where they genuinely oppose.
    for (const key of axesOf(matchup)) {
      const split = separation(left, right, key);
      const shared = Math.min(Math.abs(pull(left, key)), Math.abs(pull(right, key)));
      if (shared <= 0 || split > shared) continue;
      const agreedDirection = pull(left, key) + pull(right, key) >= 0 ? 1 : -1;
      const sharedSep = Math.min(1, shared);
      const weight = permanentWeight({
        separation: sharedSep,
        attribution: axisAttribution(sharedSep, seps),
        informationValue,
        base: NEITHER_WEIGHT,
      });
      if (weight <= 0) continue;
      out.push({
        kind: 'permanent',
        key,
        target: agreedDirection > 0 ? 100 : 0,
        weight,
        attribution: axisAttribution(sharedSep, seps),
      });
    }
    return out;
  }

  if (verdict === 'neither') {
    for (const key of axesOf(matchup)) {
      // Condemn what the pair asserts WITHOUT CONFLICT. Where the two films
      // pull opposite ways, refusing both says nothing about which side they
      // would have taken, and inventing a direction there would fabricate an
      // opinion nobody expressed — that restraint is unchanged.
      const split = separation(left, right, key);
      const shared = Math.min(Math.abs(pull(left, key)), Math.abs(pull(right, key)));
      if (shared <= 0 || split > shared) continue;
      const agreedDirection = pull(left, key) + pull(right, key) >= 0 ? 1 : -1;
      const sharedSep = Math.min(1, shared);
      const weight = permanentWeight({
        separation: sharedSep,
        attribution: axisAttribution(sharedSep, seps),
        informationValue,
        base: NEITHER_WEIGHT,
      });
      if (weight <= 0) continue;
      out.push({
        kind: 'permanent',
        key,
        // Push AWAY from whatever both films were offering.
        target: agreedDirection > 0 ? 0 : 100,
        weight,
        attribution: axisAttribution(sharedSep, seps),
      });
    }
    return out;
  }

  const winner = verdict === 'left' ? left : right;
  const loser = verdict === 'left' ? right : left;

  for (const key of axesOf(matchup)) {
    const split = separation(left, right, key);
    if (split <= 0) continue; // They agreed here — the choice says nothing about it.
    const towardWinner = pull(winner, key) - pull(loser, key);
    if (towardWinner === 0) continue;
    const sep = Math.min(1, split);
    const axisAttr = axisAttribution(sep, seps);
    const weight = permanentWeight({ separation: sep, attribution: axisAttr, informationValue });
    if (weight <= 0) continue;
    out.push({ kind: 'permanent', key, target: towardWinner > 0 ? 100 : 0, weight, attribution: axisAttr });
  }
  return out;
}

/**
 * SESSION evidence from a verdict — `tonight` mode only.
 *
 * NOTE THE SIGNATURE. It does not take a `TraitProfile` and it does not return
 * one; there is no argument it could be given that would let it reach permanent
 * state. That is the enforcement — not the comment, the signature.
 *
 * A tonight answer is a tilt, not a belief, so it carries no evidence weight and
 * no confidence. Refusing both films tilts away from their shared ground for
 * tonight, on the same restraint the permanent path uses.
 */
export function sessionEvidenceFor(
  matchup: Matchup,
  verdict: Verdict,
): SessionContextEvidence[] {
  const { left, right } = matchup;
  const out: SessionContextEvidence[] = [];

  if (verdict === 'neither' || verdict === 'both') {
    const sign = verdict === 'both' ? 1 : -1;
    for (const key of axesOf(matchup)) {
      const split = separation(left, right, key);
      const shared = Math.min(Math.abs(pull(left, key)), Math.abs(pull(right, key)));
      if (shared <= 0 || split > shared) continue;
      const agreedDirection = pull(left, key) + pull(right, key) >= 0 ? 1 : -1;
      out.push({ kind: 'session', key, lean: sign * agreedDirection * SESSION_LEAN_STEP * shared });
    }
    return out;
  }

  const winner = verdict === 'left' ? left : right;
  const loser = verdict === 'left' ? right : left;
  for (const key of axesOf(matchup)) {
    const split = separation(left, right, key);
    if (split <= 0) continue;
    const towardWinner = pull(winner, key) - pull(loser, key);
    if (towardWinner === 0) continue;
    out.push({
      kind: 'session',
      key,
      lean: Math.sign(towardWinner) * SESSION_LEAN_STEP * Math.min(1, split),
    });
  }
  return out;
}

/**
 * What one decision produced, routed by MODE.
 *
 * The two ledgers are never both populated. A mode is a question, and a
 * question has one meaning: "which is better for you" is about the person,
 * "which tonight" is about the night. Producing both from one tap would be
 * asserting the player answered two questions when they answered one.
 */
export function evidenceFor(
  matchup: Matchup,
  verdict: Verdict,
  mode: ShowdownMode,
): DecisionEvidence {
  if (mode === 'tonight') {
    return { permanent: [], session: sessionEvidenceFor(matchup, verdict) };
  }
  return { permanent: permanentEvidenceFor(matchup, verdict), session: [] };
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

  /* THE ONLY PLACE EITHER LEDGER IS WRITTEN, and each is written by the
     function that owns it. In `tonight` mode `evidence.permanent` is `[]` by
     construction, so `applyPermanent` folds nothing and `profile` comes back
     the same object — not a copy that happens to be equal, the same reference. */
  const evidence = evidenceFor(matchup, verdict, state.mode);
  const profile = applyPermanent(state.profile, evidence.permanent);
  const lean = accumulateSession(state.lean, evidence.session);

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
    lean,
    decisions: [...state.decisions, decision],
    seenPairs: [...state.seenPairs, pairKey(matchup.left.id, matchup.right.id)],
    // THE INVARIANT. Both titles retire the instant they are shown, whatever
    // the answer was.
    seenTitleIds: [...state.seenTitleIds, matchup.left.id, matchup.right.id],
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
    seenTitleIds: [...state.seenTitleIds, matchup.left.id, matchup.right.id],
    seenPairs: [...state.seenPairs, pairKey(matchup.left.id, matchup.right.id)],
    // Advances the phase clock: an unrecognised pair still consumed a round of
    // the player's ninety seconds, and the scan must not silently run long.
    unseenRounds: state.unseenRounds + 1,
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
