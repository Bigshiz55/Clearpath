/**
 * WHAT THE TONIGHT MACHINE REPORTS ABOUT ITSELF.
 *
 * The questions this exists to answer are specific, and they are all about
 * whether the engine is actually working:
 *
 *   Are sessions finishing, or are people leaving mid-reel?
 *   Which act loses them?
 *   How many answers does it take before the session has enough to choose?
 *   Do players reject the shortlist — i.e. is the recommendation wrong?
 *   How often does a session end having learned nothing, and why?
 *
 * TWO RULES, BOTH LOAD-BEARING.
 *
 * NOTHING IS INVENTED. Every field is copied from state the engine already
 * computed for its own purposes. There is no field here whose value had to be
 * guessed, estimated, or filled in with a plausible default — an analytics
 * pipeline that fabricates is worse than none, because it is believed.
 *
 * NOTHING GOES ANYWHERE BY DEFAULT. The sink is a no-op until something
 * installs one. Choosing a destination is a decision about where a person's
 * viewing taste is stored and how long it is kept, and that is not a decision a
 * module makes on its own by quietly defaulting to an endpoint.
 *
 * PURE apart from the sink call. No clock is read here; timestamps are passed
 * in, so a test can assert on exact values.
 */

import type { TonightState } from './orchestrator';
import { evidencedCount, learnedNothing } from './orchestrator';
import { dnaKnown } from '@/lib/tastedna/families';

export type TonightEventName =
  | 'tonight_started'
  | 'tonight_move_shown'
  | 'tonight_move_answered'
  | 'tonight_shortlist_rejected'
  | 'tonight_completed'
  | 'tonight_left';

/** The act a move belongs to. Mirrors `Move['kind']` exactly. */
export type MoveKind = 'context' | 'stimulus' | 'twist' | 'finalcut' | 'done';

export interface TonightEvent {
  name: TonightEventName;
  /** Stable per session, so a stream can be reassembled without a user id. */
  sessionId: string;
  /** Interactions answered before this event. The session's clock. */
  step: number;
  /** Which act, where the event has one. */
  move?: MoveKind;
  /**
   * What was shown: a title id, a twist id, or a context field. Catalogue
   * identifiers, never anything the player typed — there is no free text in
   * this product to leak.
   */
  subject?: string;
  /** What they answered. One of the fixed answer vocabularies. */
  answer?: string;
  /** Axes the move was chosen to resolve. */
  testing?: string[];
  /** Whether the answer changed permanent DNA or only tonight. */
  scope?: 'permanent' | 'session';
  /** DNA completeness, 0-100, as the Reveal reports it. */
  known?: number;
  /** Completeness when the session opened, so movement is computable. */
  opening?: number;
  /** Interactions that produced real permanent evidence. */
  evidenced?: number;
  /** Session wall time, milliseconds. Passed in, never read from a clock. */
  elapsedMs?: number;
  /** True when the session ended having learned nothing permanent. */
  learnedNothing?: boolean;
}

export type TonightSink = (event: TonightEvent) => void;

/** No destination until someone chooses one. See the header. */
let sink: TonightSink | null = null;

export function setTonightSink(next: TonightSink | null): void {
  sink = next;
}

export function emitTonight(event: TonightEvent): void {
  if (!sink) return;
  try {
    sink(event);
  } catch {
    // Analytics must never be able to break a session in front of a player.
  }
}

/** Fields shared by every event, read straight off the state. */
function base(state: TonightState, sessionId: string): Pick<TonightEvent, 'sessionId' | 'step' | 'known' | 'opening' | 'evidenced'> {
  return {
    sessionId,
    step: state.interactions.length,
    known: Math.round(dnaKnown(state.profile) * 100),
    opening: Math.round(state.openingKnown * 100),
    evidenced: evidencedCount(state),
  };
}

export function sessionStarted(state: TonightState, sessionId: string): TonightEvent {
  return { name: 'tonight_started', ...base(state, sessionId), move: state.current?.kind };
}

export function moveShown(state: TonightState, sessionId: string): TonightEvent {
  const move = state.current;
  return {
    name: 'tonight_move_shown',
    ...base(state, sessionId),
    move: move?.kind,
    subject:
      move?.kind === 'stimulus' ? move.stimulus.title.id
      : move?.kind === 'twist' ? move.twist.id
      : move?.kind === 'context' ? move.field
      : undefined,
    testing:
      move?.kind === 'stimulus' ? move.stimulus.testing
      : move?.kind === 'twist' ? [move.twist.axis]
      : undefined,
  };
}

/**
 * Reports the interaction the engine actually recorded, not the tap.
 *
 * A tap that was ignored — a retry, a double tap past the guard — records no
 * interaction, so no event is produced for it. Emitting on the tap instead
 * would inflate every answer count by however often players are impatient,
 * which is exactly the sort of number that then gets treated as engagement.
 */
export function moveAnswered(
  before: TonightState,
  after: TonightState,
  sessionId: string,
  elapsedMs?: number,
): TonightEvent | null {
  if (after.interactions.length === before.interactions.length) return null;
  const recorded = after.interactions[after.interactions.length - 1]!;
  return {
    name: recorded.kind === 'finalcut' && recorded.answer === 'reject-all'
      ? 'tonight_shortlist_rejected'
      : 'tonight_move_answered',
    ...base(after, sessionId),
    move: recorded.kind,
    subject: recorded.subject,
    answer: recorded.answer,
    testing: recorded.testing,
    scope: recorded.scope,
    elapsedMs,
  };
}

export function sessionEnded(
  state: TonightState,
  sessionId: string,
  reason: 'completed' | 'left',
  elapsedMs?: number,
): TonightEvent {
  return {
    name: reason === 'completed' ? 'tonight_completed' : 'tonight_left',
    ...base(state, sessionId),
    move: state.current?.kind,
    elapsedMs,
    learnedNothing: learnedNothing(state),
  };
}
