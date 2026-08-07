/**
 * THE PHASE STATE MACHINE.
 *
 * Pure phase transitions for the interview, driven by turn count, overall
 * confidence, a pending follow-up, and any unraised contradiction:
 *
 *   warmup → exploring → probing → (challenging detour) → confirming → wrapping → complete
 *
 * The challenge detour jumps the queue whenever an unraised contradiction is on
 * the table (a good interviewer reconciles a clash the moment it appears), and a
 * hard turn cap guarantees the machine always reaches `complete`.
 *
 * Pure. `nextPhase` is a total function of the state.
 */
import type { InterviewState, InterviewPhase } from './types';
import { COMPLETION_CONFIDENCE } from './types';

/** After this many turns the interview ends no matter what — termination guarantee. */
export const HARD_TURN_CAP = 25;

/** Overall confidence at which we start reading theories back before the reveal. */
export const CONFIRM_THRESHOLD = 0.8;
/** Overall confidence at which we move to the final "one more for you" wrap. */
export const WRAP_THRESHOLD = 0.9;

/** True when a contradiction is on the table that has not been raised or resolved. */
export function hasUnraisedContradiction(state: InterviewState): boolean {
  return state.contradictions.some((c) => !c.raised && !c.resolved);
}

/**
 * The phase the interview should be in given its current state. Total and
 * deterministic — the same state always yields the same phase.
 */
export function nextPhase(state: InterviewState): InterviewPhase {
  // Termination first: the cap always wins so the interview cannot run forever.
  if (state.turn >= HARD_TURN_CAP) return 'complete';
  if (state.turn <= 0) return 'warmup';

  // A live contradiction detours everything short of the hard cap.
  if (hasUnraisedContradiction(state)) return 'challenging';

  if (state.overallConfidence >= COMPLETION_CONFIDENCE) return 'complete';
  if (state.overallConfidence >= WRAP_THRESHOLD) return 'wrapping';
  if (state.overallConfidence >= CONFIRM_THRESHOLD) return 'confirming';
  if (state.pendingFollowUp) return 'probing';
  return 'exploring';
}

/** True when the interview has reached a terminal state. */
export function isComplete(state: InterviewState): boolean {
  return state.turn >= HARD_TURN_CAP || state.overallConfidence >= COMPLETION_CONFIDENCE;
}
