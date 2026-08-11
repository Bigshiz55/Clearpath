/**
 * THE ORCHESTRATOR — the session has no script.
 *
 * "Five acts" is how the experience READS, not how it is sequenced. There is no
 * step counter and no fixed round count: on every turn the orchestrator scores
 * the available moves and takes the best one, so a mature profile that needs
 * one twist and a Final Cut gets exactly that, while a blank profile gets a
 * long reel first. Mechanically executing one of each would be a questionnaire
 * with cinematic styling, which is the thing this replaced.
 *
 * THE MOVES, and what each is for:
 *
 *   CONTEXT   — ask about the evening. Only while the answer could still change
 *               the outcome, and only for a field not yet known.
 *   STIMULUS  — react to a title. The workhorse: cheap, fast, broad.
 *   TWIST     — isolate a cause. Expensive to earn (needs an anchor the player
 *               kept) but the highest-value evidence available.
 *   FINALCUT  — three finalists. Offered once there is enough to choose well.
 *   DONE      — stop. A real move, not a fallback.
 *
 * STOPPING IS A FIRST-CLASS DECISION. Sessions end when the best remaining move
 * is worth less than the cost of asking, when the budget is spent, or when the
 * recommendation has stopped moving. Padding to a round number is how a
 * 60-second game becomes a three-minute chore.
 *
 * PURE. Time is passed in, never read. Same state always yields the same move,
 * which is what makes the A–E simulations meaningful.
 */

import { TITLES, type DiagnosticTitle } from '@/lib/voice/quickdna/definition';
import { observeAll, traitBelief, traitConfidence, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';
import { dnaKnown } from '@/lib/tastedna/families';
import {
  EMPTY_CONTEXT,
  INTENTS,
  applyContextAnswer,
  type ContextAnswer,
  type Intent,
  type SessionContext,
} from './context';
import {
  nextStimulus,
  reactionEvidence,
  tonightFit,
  type Reaction,
  type Stimulus,
} from './stimulus';
import { nextTwist, twistEvidence, type Twist } from './twist';

/** Hard ceiling. A session that reaches this has failed to learn efficiently. */
export const MAX_INTERACTIONS = 18;
/** Below this the reel is not worth another turn. */
export const STIMULUS_FLOOR = 0.05;
/** Enough evidence to choose three finalists honestly. */
export const MIN_FOR_FINAL = 4;

export type Move =
  | { kind: 'context'; field: ContextAnswer['field']; intents?: Intent[] }
  | { kind: 'stimulus'; stimulus: Stimulus }
  | { kind: 'twist'; twist: Twist; anchor: DiagnosticTitle }
  | { kind: 'finalcut'; finalists: Finalist[] }
  | { kind: 'done' };

/** A finalist, with the reason it survived — shown to the player verbatim. */
export interface Finalist {
  title: DiagnosticTitle;
  fit: number;
  /** Why THIS one, in the player's own evidence. */
  because: string;
}

/** One recorded interaction. Provenance for everything the session did. */
export interface Interaction {
  id: string;
  kind: 'context' | 'stimulus' | 'twist' | 'finalcut';
  /** What was shown. */
  subject: string;
  /** What they answered. */
  answer: string;
  /** Axes this interaction was chosen to resolve. */
  testing: TraitKey[];
  /** Evidence actually applied to PERMANENT DNA. Empty for context/unseen. */
  applied: Array<{ key: TraitKey; target: number; weight: number }>;
  /** Whether it touched permanent DNA or only tonight. */
  scope: 'permanent' | 'session';
  at: number;
}

export interface TonightState {
  /** Permanent Taste DNA. */
  profile: TraitProfile;
  /** Tonight only. Never merged into `profile`. */
  context: SessionContext;
  interactions: Interaction[];
  shownTitles: string[];
  unseenTitles: string[];
  /** Titles the player pulled or kept — candidate anchors for a twist. */
  kept: string[];
  usedTwists: string[];
  recentAxes: TraitKey[];
  contextAsked: Array<ContextAnswer['field']>;
  current: Move | null;
  openingKnown: number;
  startedAt: number;
  /** Set when the player rejects all finalists; drives one recovery move. */
  rejectedAll: boolean;
}

export function createTonight(seed: { profile?: TraitProfile } = {}, startedAt = 0): TonightState {
  const profile = seed.profile ?? {};
  return {
    profile,
    context: EMPTY_CONTEXT,
    interactions: [],
    shownTitles: [],
    unseenTitles: [],
    kept: [],
    usedTwists: [],
    recentAxes: [],
    contextAsked: [],
    current: null,
    openingKnown: dnaKnown(profile),
    startedAt,
    rejectedAll: false,
  };
}

const byId = (id: string) => TITLES.find((t) => t.id === id);

/**
 * Which context field is still worth asking about.
 *
 * The intent question always comes first — it is the five-second opening. The
 * rest are asked only when the answer could change tonight's ranking AND the
 * session is young enough for it to matter. `attention` is skipped entirely for
 * someone who has already told us they cannot read subtitles, because knowing
 * it twice changes nothing.
 */
function contextMove(state: TonightState): Move | null {
  const asked = state.contextAsked;
  if (!asked.includes('intent')) {
    return { kind: 'context', field: 'intent', intents: adaptiveIntents(state.profile) };
  }
  // One follow-up at most, and only while it can still steer the outcome.
  if (state.interactions.length > 6) return null;
  if (!asked.includes('company')) return { kind: 'context', field: 'company' };
  if (!asked.includes('attention') && state.context.lean.subtitles === undefined) {
    return { kind: 'context', field: 'attention' };
  }
  if (!asked.includes('commitment') && state.context.lean.patience === undefined) {
    return { kind: 'context', field: 'commitment' };
  }
  return null;
}

/**
 * The opening six, chosen for THIS player.
 *
 * Ranked by how much the intent's axes are still open, so someone whose comedy
 * is settled is not led with "make me laugh". The two deferrals ("Surprise me",
 * "You figure it out") are always available, because refusing to choose is a
 * legitimate answer and a useful signal in itself.
 */
export function adaptiveIntents(profile: TraitProfile, count = 6): Intent[] {
  const open = INTENTS.filter((i) => i.resolves.length > 0)
    .map((i) => ({
      intent: i,
      value: i.resolves.reduce((s, k) => s + (1 - traitConfidence(profile, k)), 0) / i.resolves.length,
    }))
    .sort((a, b) => b.value - a.value)
    .map((x) => x.intent);
  const deferrals = INTENTS.filter((i) => i.resolves.length === 0);
  return [...open.slice(0, Math.max(1, count - deferrals.length)), ...deferrals];
}

/**
 * Three finalists that survived for DIFFERENT reasons.
 *
 * Ranked on tonight's bent preference, then filtered so the three do not all
 * lead on the same axis — three variations of one recommendation is not a
 * choice, and it is what makes a "personalised" shortlist feel generic.
 */
export function finalists(state: TonightState, count = 3): Finalist[] {
  const belief = (k: TraitKey) => traitBelief(state.profile, k).pref;
  const ranked = TITLES.filter((t) => !state.unseenTitles.includes(t.id))
    .map((t) => ({ title: t, fit: tonightFit(t, state.profile, state.context, belief) }))
    .sort((a, b) => b.fit - a.fit);

  const out: Finalist[] = [];
  const leads = new Set<TraitKey>();
  for (const cand of ranked) {
    if (out.length >= count) break;
    // Lead axis = the confident trait this title most rests on.
    const lead = [...cand.title.traits]
      .sort((a, b) => b.strength * traitConfidence(state.profile, b.key) - a.strength * traitConfidence(state.profile, a.key))[0];
    const key = lead?.key;
    if (key && leads.has(key)) continue;
    if (key) leads.add(key);
    out.push({ title: cand.title, fit: cand.fit, because: reasonFor(cand.title, state, key) });
  }
  // Top up if diversity filtering was too strict to fill three.
  for (const cand of ranked) {
    if (out.length >= count) break;
    if (out.some((f) => f.title.id === cand.title.id)) continue;
    out.push({ title: cand.title, fit: cand.fit, because: reasonFor(cand.title, state, undefined) });
  }
  return out;
}

/**
 * Why this title, stated only where the evidence supports it.
 *
 * Falls back to an honest hedge rather than inventing a rationale — a confident
 * explanation built on a trait we barely know is exactly the fabricated
 * personalisation this product must not ship.
 */
function reasonFor(title: DiagnosticTitle, state: TonightState, lead: TraitKey | undefined): string {
  if (!lead) return 'A broad match while we are still learning';
  const conf = traitConfidence(state.profile, lead);
  const pref = traitBelief(state.profile, lead).pref;
  if (conf < 0.25) return 'A broad match while we are still learning';
  const leaning = pref >= 50 ? 'you lean toward' : 'you lean away from';
  const axis = lead.replace(/([A-Z])/g, ' $1').toLowerCase();
  return `Because ${leaning} ${axis.trim()}`;
}

/**
 * The single highest-value next move.
 *
 * Order is by VALUE, not by act. A twist outranks the reel whenever a kept
 * anchor exists and an axis is open, because a controlled counterfactual is
 * worth more per answer than another confounded reaction.
 */
export function nextMove(state: TonightState): Move {
  if (state.interactions.length >= MAX_INTERACTIONS) return { kind: 'finalcut', finalists: finalists(state) };

  const ctx = contextMove(state);
  if (ctx) return ctx;

  // A twist needs something they kept, and an axis still worth isolating.
  const anchorId = [...state.kept].reverse()[0];
  const anchor = anchorId ? byId(anchorId) : undefined;
  if (anchor) {
    const twist = nextTwist({ profile: state.profile, used: state.usedTwists, anchor });
    // Earned rather than automatic: only after the reel has produced something
    // to hold constant, and never twice in a row.
    const lastWasTwist = state.interactions[state.interactions.length - 1]?.kind === 'twist';
    if (twist && !lastWasTwist && state.interactions.length >= 3) {
      return { kind: 'twist', twist, anchor };
    }
  }

  const stimulus = nextStimulus(
    {
      profile: state.profile,
      context: state.context,
      shown: state.shownTitles,
      unseen: state.unseenTitles,
      recentAxes: state.recentAxes,
    },
    STIMULUS_FLOOR,
  );

  const evidenced = state.interactions.filter((i) => i.scope === 'permanent' && i.applied.length > 0).length;
  // Nothing left worth asking, or enough to choose well: go to the Final Cut.
  if (!stimulus) return { kind: 'finalcut', finalists: finalists(state) };
  if (evidenced >= MIN_FOR_FINAL && stimulus.gain < STIMULUS_FLOOR * 2.5) {
    return { kind: 'finalcut', finalists: finalists(state) };
  }
  return { kind: 'stimulus', stimulus };
}

export function startTonight(state: TonightState, now = 0): TonightState {
  return { ...state, startedAt: now, current: nextMove(state) };
}

/**
 * Stable id so the same answer can never be recorded twice.
 *
 * Derived from WHAT was asked, never from how many interactions have happened.
 * Keying on `interactions.length` looked stable and was not: recording an
 * answer changes the length, so a retried write produced a different id and
 * sailed straight past the duplicate check — the exact double-count this
 * function exists to prevent. Subjects are unique within a session by
 * construction (a stimulus, twist or context field is offered once), so
 * kind+subject is both stable across retries and unique within the session.
 */
export function interactionId(kind: Interaction['kind'], subject: string): string {
  return `${kind}:${subject}`;
}

/**
 * Record an answer and choose the next move.
 *
 * IDEMPOTENT: an answer whose id has already been recorded is ignored, so a
 * retried write or a double tap that slips past the UI guard cannot double-count
 * evidence.
 */
export function answerMove(
  state: TonightState,
  answer: { subject: string; value: string },
  now: number,
): TonightState {
  const move = state.current;
  if (!move || move.kind === 'done') return state;

  const kindOf: Interaction['kind'] =
    move.kind === 'context' ? 'context'
    : move.kind === 'twist' ? 'twist'
    : move.kind === 'finalcut' ? 'finalcut'
    : 'stimulus';
  const id = interactionId(kindOf, answer.subject);
  if (state.interactions.some((i) => i.id === id)) return state;

  let profile = state.profile;
  let context = state.context;
  let applied: Interaction['applied'] = [];
  let scope: Interaction['scope'] = 'permanent';
  let testing: TraitKey[] = [];
  let kind: Interaction['kind'] = 'stimulus';
  const shownTitles = [...state.shownTitles];
  const unseenTitles = [...state.unseenTitles];
  const kept = [...state.kept];
  const usedTwists = [...state.usedTwists];
  const contextAsked = [...state.contextAsked];
  let recentAxes = [...state.recentAxes];

  if (move.kind === 'context') {
    kind = 'context';
    scope = 'session';
    const out = applyContextAnswer(context, { field: move.field, value: answer.value });
    context = out.context;
    applied = out.permanent; // always []
    contextAsked.push(move.field);
  } else if (move.kind === 'stimulus') {
    kind = 'stimulus';
    const reaction = answer.value as Reaction;
    testing = move.stimulus.testing;
    shownTitles.push(move.stimulus.title.id);
    if (reaction === 'unseen') {
      unseenTitles.push(move.stimulus.title.id);
      scope = 'session'; // recognition, not taste
    } else if (reaction === 'seen') {
      scope = 'session'; // familiarity, not taste
    } else {
      applied = reactionEvidence(move.stimulus, reaction);
      profile = observeAll(profile, applied);
      if (reaction === 'pull' || reaction === 'keep') kept.push(move.stimulus.title.id);
    }
    recentAxes = [...recentAxes, ...testing.slice(0, 1)].slice(-4);
  } else if (move.kind === 'twist') {
    kind = 'twist';
    testing = [move.twist.axis];
    applied = twistEvidence(move.twist, answer.value === 'stayed');
    profile = observeAll(profile, applied);
    usedTwists.push(move.twist.id);
    recentAxes = [...recentAxes, move.twist.axis].slice(-4);
  } else if (move.kind === 'finalcut') {
    kind = 'finalcut';
    if (answer.value === 'reject-all') {
      // Not a restart: one targeted recovery, then regenerate.
      const next: TonightState = {
        ...state,
        rejectedAll: true,
        interactions: [
          ...state.interactions,
          { id, kind, subject: answer.subject, answer: answer.value, testing: [], applied: [], scope: 'session', at: now },
        ],
        current: null,
      };
      return { ...next, current: nextMove(next) };
    }
    // Choosing a finalist is revealed preference: real, but it must not
    // overpower a whole history, so it is weighted like a reaction, not a twist.
    const chosen = byId(answer.value);
    if (chosen) {
      applied = chosen.traits.map((e) => ({
        key: e.key,
        target: e.invert ? 0 : 100,
        weight: 0.24 * e.strength,
      }));
      profile = observeAll(profile, applied);
    }
  }

  const next: TonightState = {
    ...state,
    profile,
    context,
    interactions: [
      ...state.interactions,
      { id, kind, subject: answer.subject, answer: answer.value, testing, applied, scope, at: now },
    ],
    shownTitles,
    unseenTitles,
    kept,
    usedTwists,
    recentAxes,
    contextAsked,
    current: null,
  };

  // A chosen finalist ends the session; everything else continues.
  if (move.kind === 'finalcut' && answer.value !== 'reject-all') {
    return { ...next, current: { kind: 'done' } };
  }
  return { ...next, current: nextMove(next) };
}

/** Interactions that produced real permanent evidence. */
export function evidencedCount(state: TonightState): number {
  return state.interactions.filter((i) => i.scope === 'permanent' && i.applied.length > 0).length;
}

/** True when the session taught us nothing permanent — the Reveal must say so. */
export function learnedNothing(state: TonightState): boolean {
  return evidencedCount(state) === 0;
}
