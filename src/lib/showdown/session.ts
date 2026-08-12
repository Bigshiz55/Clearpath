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

import { TITLES, type DiagnosticTitle } from '@/lib/voice/quickdna/definition';
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
import {
  chooseFollowUp,
  intensityEvidence,
  intensityLean,
  reasonEvidence,
  reasonLean,
  writtenOn,
  type FollowUp,
  type Intensity,
  type Pair,
} from './followup';
import { GUT_CALL, type ReasonChip } from './reasons';
import {
  calibrationEvidence,
  contestedAxes,
  selectCalibration,
  type AxisObservation,
  type CalibrationQuestion,
} from './calibration';
import {
  discoveriesFor,
  discoveryDue,
  discoveryEvidence,
  type Discovery,
} from './discovery';

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
  /**
   * The reason chip the player named, when they were asked and answered.
   * `'gut'` is a real answer meaning "no single axis" — distinct from absent,
   * which means the question was never put.
   */
  reason?: string;
  /** Stated appetite for the winner, when asked. Absent means never asked. */
  intensity?: Intensity;
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
  /**
   * Follow-up questions already spent — the interruption budget.
   *
   * ON THE STATE, NOT DERIVED FROM `decisions`, because a follow-up that was
   * OFFERED and dismissed costs the player the same second as one they
   * answered. Counting only the answered ones would let a player who keeps
   * tapping "gut call" be interrupted on every round.
   */
  followups: number;
  /** Decision index (1-based) of the last follow-up offered. 0 = none yet. */
  lastFollowupRound: number;
  /** Discovery ids already put to this player. A moment repeated is a screensaver. */
  shownDiscoveries: string[];
  /** Decision count when the last discovery was surfaced. */
  lastDiscoveryRound: number;
  /** Rounds spent on pairs the player did not recognise. They advance the
   *  scan clock without producing evidence, so the phases still progress. */
  unseenRounds: number;
  /**
   * How many of `seenTitleIds` were CARRIED IN rather than shown.
   *
   * Without this the two are indistinguishable, and the durable exposure
   * history would treat every carried-in id as freshly seen — re-stamping the
   * whole suppression list as brand new at the end of every run, so the oldest
   * exposures could never age out and the release policy would silently never
   * release. `exposedThisSession` is the only correct thing to write back.
   */
  carriedTitleIds: number;
  /** Confidence coverage when the session opened — the "21% → 34%" starting point. */
  openingKnown: number;
  /**
   * Axes already put to the player as a 1-10 question this run.
   *
   * On the state rather than derived, for the same reason `followups` is: an
   * axis that was ASKED and waved away must not come back three rounds later.
   */
  calibrated: TraitKey[];
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
    followups: 0,
    lastFollowupRound: 0,
    shownDiscoveries: [],
    lastDiscoveryRound: 0,
    carriedTitleIds: (seed.seenTitleIds ?? []).length,
    unseenRounds: 0,
    openingKnown: seed.openingKnown ?? 0,
    calibrated: [],
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
  /* THE PLANNER NOW SEES THE ARGUMENTS. Built from the decision list rather
     than the profile, because a fold cannot represent a contradiction — see
     `ScanContext.contested`. Same definition the 1-10 question uses. */
  const contested = new Map<TraitKey, number>();
  for (const c of contestedAxes(calibrationObservations(state))) contested.set(c.key, c.contested);

  return nextScanMatchup({
    profile: state.profile,
    seenTitleIds: [...state.seenTitleIds, ...state.unseenTitles],
    recentAxes: state.recentAxes,
    decisionIndex: state.decisions.length + state.unseenRounds,
    total: TARGET_DECISIONS,
    contested,
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

/**
 * What the evidence layer needs from a matchup: the two films and how much the
 * question was worth. Structurally narrower than `Matchup` so a decision can be
 * re-priced later from its recorded ids and gain, without inventing the
 * planner's `testing` and `attribution` to satisfy a type.
 */
export type EvidencePair = Pair & { gain: number };

/** Every axis either title asserts anything about. */
function axesOf(matchup: Pair): TraitKey[] {
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
export function separations(matchup: Pair): number[] {
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
  matchup: EvidencePair,
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
  matchup: Pair,
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
  matchup: EvidencePair,
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

/* ------------------------------------------------------------------ *
 * FOLLOW-UPS — the second and third things a round can ask.
 *
 * They act on the decision ALREADY RECORDED, which is why `answer` does not
 * wait for them: the pick stands on its own, and the follow-up refines it. A
 * player who closes the tab mid-question loses the refinement and keeps the
 * pick, which is the right way round.
 * ------------------------------------------------------------------ */

/** Rebuild the pair a recorded decision was about, or null if it cannot be. */
export function pairForDecision(decision: ShowdownDecision): EvidencePair | null {
  const left = TITLES.find((t) => t.id === decision.leftId);
  const right = TITLES.find((t) => t.id === decision.rightId);
  return left && right ? { left, right, gain: decision.gain } : null;
}

function winnerOf(pair: EvidencePair, verdict: Verdict): DiagnosticTitle | null {
  if (verdict === 'left') return pair.left;
  if (verdict === 'right') return pair.right;
  return null;
}

/**
 * The follow-up worth putting to the player right now, or null.
 *
 * Called AFTER `answer`, about the decision it just recorded. Returns null on
 * the great majority of rounds — that is the design, not a fallback.
 */
export function followUpFor(state: ShowdownState): FollowUp {
  const decision = state.decisions[state.decisions.length - 1];
  if (!decision) return null;
  if (decision.reason !== undefined || decision.intensity !== undefined) return null;
  const pair = pairForDecision(decision);
  if (!pair) return null;
  const index = state.decisions.length;
  return chooseFollowUp({
    pair,
    winner: winnerOf(pair, decision.verdict),
    attribution: attributionConfidence(separations(pair)),
    decisionIndex: index,
    spent: state.followups,
    backToBack: state.lastFollowupRound === index - 1,
    // What is already believed decides which chips are worth a second — see
    // `rankChipsByValue`. Without it the budget gets spent confirming.
    profile: state.profile,
  });
}

/**
 * Fold extra evidence into the run and re-deal.
 *
 * RE-DEALING IS THE POINT of asking mid-game rather than at the end. The next
 * matchup was chosen against the profile as it stood a moment ago; a stated
 * reason is the sharpest single observation the game collects, so the very next
 * question should already reflect it. Re-dealing cannot repeat a title — the
 * pending pair was never added to `seenTitleIds`, which only fills on `answer`.
 */
function withFollowUp(
  state: ShowdownState,
  permanent: readonly PermanentTraitEvidence[],
  session: readonly SessionContextEvidence[],
  annotate: (d: ShowdownDecision) => ShowdownDecision,
): ShowdownState {
  const last = state.decisions.length - 1;
  if (last < 0) return state;
  const decisions = state.decisions.map((d, i) => (i === last ? annotate(d) : d));
  const next: ShowdownState = {
    ...state,
    decisions,
    profile: state.mode === 'dna' ? applyPermanent(state.profile, permanent) : state.profile,
    lean: state.mode === 'tonight' ? accumulateSession(state.lean, session) : state.lean,
    followups: state.followups + 1,
    lastFollowupRound: state.decisions.length,
    current: null,
  };
  return { ...next, current: deal(next) };
}

/** "Why did you pick that one?" — answered. */
export function addReason(state: ShowdownState, chip: ReasonChip): ShowdownState {
  const decision = state.decisions[state.decisions.length - 1];
  if (!decision) return state;
  const pair = pairForDecision(decision);
  if (!pair) return state;
  /* The top-up is measured against what THIS decision already wrote on the
     named axis, recomputed from the recorded pair rather than remembered — one
     source of truth for what a pick is worth, and no stored intermediate to
     drift out of step with `permanentEvidenceFor`. */
  const already = writtenOn(permanentEvidenceFor(pair, decision.verdict), chip.key);
  return withFollowUp(
    state,
    reasonEvidence(chip, already),
    reasonLean(chip, SESSION_LEAN_STEP),
    (d) => ({ ...d, reason: chip.id }),
  );
}

/** "How much do you want it?" — answered. */
export function addIntensity(state: ShowdownState, intensity: Intensity): ShowdownState {
  const decision = state.decisions[state.decisions.length - 1];
  if (!decision) return state;
  const pair = pairForDecision(decision);
  if (!pair) return state;
  const winner = winnerOf(pair, decision.verdict);
  if (!winner) return state;
  return withFollowUp(
    state,
    intensityEvidence(pair, winner, intensity),
    intensityLean(pair, winner, intensity, SESSION_LEAN_STEP),
    (d) => ({ ...d, intensity }),
  );
}

/**
 * The follow-up was shown and waved away.
 *
 * SPENDS THE BUDGET ANYWAY. Dismissing costs the player the same beat as
 * answering, and a budget that only counts answers would interrupt a player who
 * never wants to elaborate on every single round. It records no evidence and
 * annotates nothing: not answering is not an answer.
 */
export function skipFollowUp(state: ShowdownState): ShowdownState {
  if (state.decisions.length === 0) return state;
  return {
    ...state,
    followups: state.followups + 1,
    lastFollowupRound: state.decisions.length,
  };
}

/** How many follow-ups this session actually got an answer to. */
export function answeredFollowUps(state: ShowdownState): number {
  return state.decisions.filter(
    (d) => (d.reason !== undefined && d.reason !== GUT_CALL.id) || d.intensity !== undefined,
  ).length;
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
    /* AN UNRECOGNISED PAIR IS NOT A QUESTION, SO IT DOES NOT COST ONE.
       This used to advance the scan clock on the reasoning that the round
       consumed the player's time. It does — but the alternative is worse: a
       player who has not seen four pairs finishes with sixteen answers' worth
       of profile and a results screen that has to explain why it learned less.
       The pair is retired, both titles are withheld from every future deal, and
       a fresh high-information matchup takes its place immediately. Recognition
       is a fact about the CATALOGUE, and the catalogue should pay for it. */
    unseenRounds: state.unseenRounds,
    startedAt: state.startedAt || now,
    current: null,
  };
  return { ...next, current: deal(next) };
}

/**
 * How cleanly a recorded decision isolated an axis.
 *
 * Recomputed from the pair rather than remembered, so a session restored from
 * `sessionStorage` — where the planner's transient `Matchup` did not survive —
 * prices its decisions identically to one still in memory.
 */
export function attributionOf(decision: ShowdownDecision): number {
  const pair = pairForDecision(decision);
  return pair ? attributionConfidence(separations(pair)) : 0;
}

/**
 * The discovery worth surfacing right now, or null.
 *
 * Asked between rounds, never during one. It is the only interruption in the
 * game that is not a question about films — it is the game telling the player
 * what it thinks it has worked out and inviting them to disagree.
 */
export function discoveryFor(state: ShowdownState): Discovery | null {
  if (state.mode !== 'dna') return null;
  if (!discoveryDue(state.decisions.length, state.lastDiscoveryRound, state.shownDiscoveries.length))
    return null;
  return discoveriesFor(state.profile, state.shownDiscoveries)[0] ?? null;
}

/**
 * Record the player's verdict on a discovery.
 *
 * "Not quite" is the highest-value tap in the game — a single-axis correction
 * from the person themselves, contradicting something the engine had already
 * become confident about. It is recorded as evidence, never as a dismissal.
 */
export function answerDiscovery(
  state: ShowdownState,
  discovery: Discovery,
  verdict: 'confirm' | 'correct',
): ShowdownState {
  const profile = applyPermanent(state.profile, discoveryEvidence(discovery, verdict));
  return {
    ...state,
    profile,
    shownDiscoveries: [...state.shownDiscoveries, discovery.id],
    lastDiscoveryRound: state.decisions.length,
  };
}

/** Dismissed without answering — spends the slot, records nothing. */
export function skipDiscovery(state: ShowdownState, discovery: Discovery): ShowdownState {
  return {
    ...state,
    shownDiscoveries: [...state.shownDiscoveries, discovery.id],
    lastDiscoveryRound: state.decisions.length,
  };
}

/**
 * The titles this run actually put in front of the player, oldest first.
 *
 * What the durable exposure history must be fed — never `seenTitleIds`, which
 * also contains everything the run was told to avoid.
 */
export function exposedThisSession(state: ShowdownState): string[] {
  return state.seenTitleIds.slice(state.carriedTitleIds);
}

export function isComplete(state: ShowdownState): boolean {
  return state.current === null && state.decisions.length > 0;
}

/** Decisions that produced evidence. An unseen pair is not one of them. */
export function meaningfulDecisions(state: ShowdownState): number {
  return state.decisions.length;
}

// ───────────────────────────────────────────────────────────────────────────
// THE 1-10 CALIBRATION, WIRED INTO THE RUN
//
// `calibration.ts` decides WHETHER a question is earned; this decides WHEN the
// run is willing to hear the answer, and folds it into the same profile every
// other observation goes through. Two separate jobs on purpose: the rule for
// "has the player contradicted themselves" is pure and testable without a
// session, and the rule for "may we interrupt right now" belongs with the rest
// of the interruption budget.
// ───────────────────────────────────────────────────────────────────────────

/**
 * The session's own evidence, replayed as axis observations.
 *
 * Deliberately RECOMPUTED from `decisions` rather than accumulated as the run
 * goes. The profile is a fold — beliefs, already merged — and a contradiction
 * is invisible once folded: an axis pushed to 90 and then to 10 lands near 50
 * and reads as "no opinion", which is the exact opposite of what happened.
 * Only the individual observations still carry the argument.
 */
export function calibrationObservations(state: ShowdownState): AxisObservation[] {
  if (state.mode !== 'dna') return []; // tonight writes no permanent evidence to argue about
  const out: AxisObservation[] = [];
  for (const d of state.decisions) {
    const pair = pairForDecision(d);
    if (!pair) continue;
    for (const e of evidenceFor(pair, d.verdict, state.mode).permanent) {
      out.push({ key: e.key, target: e.target, weight: e.weight });
    }
  }
  return out;
}

/**
 * Earliest round a 1-10 question may appear.
 *
 * A contradiction needs decisions on both sides of an axis before it means
 * anything, and interrupting in the first few rounds would teach the player
 * that this game is a questionnaire before they have seen it be a game.
 */
export const MIN_CALIBRATION_ROUND = 5;

/** Never twice in a run. It is a punctuation mark, not a mechanic. */
export const MAX_CALIBRATIONS = 1;

export function calibrationFor(state: ShowdownState): CalibrationQuestion | null {
  if (state.calibrated.length >= MAX_CALIBRATIONS) return null;
  if (state.decisions.length < MIN_CALIBRATION_ROUND) return null;
  // Never stack interruptions — a follow-up is already pending or just ran.
  if (followUpFor(state) !== null) return null;
  return selectCalibration(calibrationObservations(state), { asked: state.calibrated });
}

/**
 * Fold a stated 1-10 into the permanent profile.
 *
 * Goes through `applyPermanent` like everything else, so the weight cap in
 * `calibrationWeight` is the ONLY thing standing between a stated answer and a
 * profile — there is no privileged write path for it to take.
 */
export function answerCalibration(
  state: ShowdownState,
  question: CalibrationQuestion,
  value: number,
): ShowdownState {
  return {
    ...state,
    profile: state.mode === 'dna'
      ? applyPermanent(state.profile, calibrationEvidence(question, value))
      : state.profile,
    calibrated: [...state.calibrated, question.key],
  };
}

/** "Depends too much on the film" — a real answer, and it teaches nothing. */
export function skipCalibration(state: ShowdownState, question: CalibrationQuestion): ShowdownState {
  return { ...state, calibrated: [...state.calibrated, question.key] };
}

/**
 * A RAPID ROUND RAN OUT OF TIME.
 *
 * The most important function in the burst, and the one easiest to get wrong.
 * A countdown creates enormous pressure to treat silence as an answer —
 * "they didn't want either" is right there, and `neither` already exists. It
 * is wrong. A player who looked away, whose thumb was somewhere else, or who
 * simply could not decide in five seconds has told us NOTHING, and recording
 * a rejection of two films because of it is how a timed mechanic quietly
 * poisons a profile.
 *
 * So this writes no decision and folds no evidence. Structurally it cannot:
 * there is no call to `evidenceFor` or `applyPermanent` anywhere in it, so
 * "timeout contributes nothing" is a property of the code rather than a
 * promise in a comment.
 *
 * It differs from `markUnseen` in one way that matters — the titles are NOT
 * added to `unseenTitles`. Running out of time says nothing about whether the
 * player recognises a film, and claiming it does would corrupt the recognition
 * signal to save a round. Both titles still retire from the deal, because the
 * no-repeat invariant is about what has been SHOWN.
 */
export function timeoutRound(state: ShowdownState, now: number): ShowdownState {
  const matchup = state.current;
  if (!matchup) return state;
  const next: ShowdownState = {
    ...state,
    seenTitleIds: [...state.seenTitleIds, matchup.left.id, matchup.right.id],
    seenPairs: [...state.seenPairs, pairKey(matchup.left.id, matchup.right.id)],
    /* THE CLOCK ADVANCES. Unlike an unrecognised pair — which is a fact about
       the catalogue and so the catalogue pays for it — a timeout is a round the
       player genuinely spent. Not advancing would let somebody wait out the
       burst and still be asked twelve scored questions. */
    unseenRounds: state.unseenRounds + 1,
    startedAt: state.startedAt || now,
    current: null,
  };
  return { ...next, current: deal(next) };
}
