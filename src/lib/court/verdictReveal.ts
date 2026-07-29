/**
 * VERD1CT REVEAL SEQUENCING — pure timing, no DOM, no timers.
 *
 * The Verd1ct screen used to render everything at once: winner, every juror's
 * score and every veto, all on first paint — a page load, not an
 * announcement. This computes WHEN each piece should become visible so it
 * reads as a sequence instead: jurors' scores flip in one by one, then the
 * vetoed titles cross out with who struck them, then the winner resolves
 * last. Nothing here changes what the data IS (§ do-not-touch: scoring, veto
 * rules, room state) — only when the client shows it, and it is data the
 * client already holds in full before the first frame.
 *
 * `reducedMotion` collapses every offset to 0: the same order, no wait.
 */

export const JUROR_STEP_MS = 220;
export const JUROR_BASE_MS = 200;
export const VETO_STEP_MS = 260;
/** Pause after the last juror before the vetoed titles start appearing. */
export const VETO_GAP_MS = 260;
/** Pause after the last veto (or the last juror, if there are no vetoes)
 *  before the winner resolves. */
export const WINNER_GAP_MS = 420;

export interface RevealTimeline {
  /** One offset (ms from mount) per juror, in reveal order. */
  jurorAt: number[];
  /** One offset (ms from mount) per vetoed line, in reveal order. */
  vetoAt: number[];
  /** When the winner block (poster, title, group match, actions) resolves. */
  winnerAt: number;
  /** Total time until everything is revealed. */
  totalMs: number;
}

/**
 * Build the timeline. Every array is strictly non-decreasing and `winnerAt`
 * is always the last moment in the sequence — the winner never resolves
 * before the evidence that led to it.
 */
export function revealTimeline(jurorCount: number, vetoCount: number, reducedMotion = false): RevealTimeline {
  const jurors = Math.max(0, jurorCount);
  const vetoes = Math.max(0, vetoCount);

  if (reducedMotion) {
    return { jurorAt: Array(jurors).fill(0), vetoAt: Array(vetoes).fill(0), winnerAt: 0, totalMs: 0 };
  }

  const jurorAt = Array.from({ length: jurors }, (_, i) => JUROR_BASE_MS + i * JUROR_STEP_MS);
  const jurorsEnd = jurors > 0 ? jurorAt[jurorAt.length - 1]! + JUROR_STEP_MS : JUROR_BASE_MS;

  const vetoStart = jurorsEnd + VETO_GAP_MS;
  const vetoAt = Array.from({ length: vetoes }, (_, i) => vetoStart + i * VETO_STEP_MS);
  const vetoEnd = vetoes > 0 ? vetoAt[vetoAt.length - 1]! + VETO_STEP_MS : vetoStart;

  const winnerAt = vetoEnd + WINNER_GAP_MS;
  return { jurorAt, vetoAt, winnerAt, totalMs: winnerAt };
}
