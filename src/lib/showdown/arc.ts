/**
 * THE SHAPE OF A SESSION — why round 6 does not feel like round 2.
 *
 * Twelve identical screens is what makes a calibration feel like a survey, and
 * it is the single loudest complaint about the shipped game. Rhythm is not
 * decoration on top of that problem; it IS the fix. A session needs a middle
 * that speeds up and an end that slows down, and the player has to feel the
 * gear change without being told about it.
 *
 * ── RAPID FIRE IS A PHASE, NOT A DESTINATION ──────────────────────────────
 * It shipped as its own route (`/app/rapid-fire`) competing with Showdown for
 * the same player and the same evidence. As a BAND OF ROUNDS inside one
 * session it becomes what it was always meant to be: a pace change. The player
 * has settled into deliberating by round four, so the burst lands as a jolt,
 * and coming out of it the cinematic rounds feel weightier than they did going
 * in.
 *
 * ── WHERE THE BAND SITS, AND WHY ──────────────────────────────────────────
 * Not at the start: the first rounds are the player learning the controls, and
 * a countdown over an unfamiliar UI is stressful rather than exciting.
 * Not at the end: the last decisions are the highest-information ones the
 * planner has, and rushing them wastes the best questions in the run.
 * So it is a contiguous band across the middle, scaled to the session length.
 *
 * ── A TIMEOUT IS NOT A DISLIKE ────────────────────────────────────────────
 * Stated here because it is a property of the phase design, and enforced where
 * the evidence is written: a round that expires produces NO observation at all.
 * A player who looked away must not be recorded as having rejected two films.
 * "No punitive UX" is the rule, and the cheapest way to break it would be to
 * treat silence as a signal.
 *
 * PURE. No clock, no randomness — the phase of round N is a function of N, so
 * a test can land on the burst deterministically and so can an E2E.
 */

export type Phase =
  /** Full-bleed, deliberate, no clock. The default. */
  | 'cinematic'
  /** The burst: cards deal in, a short countdown runs, instinct answers. */
  | 'rapid';

export interface RoundPlan {
  phase: Phase;
  /** Milliseconds on the clock, or null when the round is untimed. */
  timeLimitMs: number | null;
  /** True on the first round of the burst — the screen announces the change. */
  entering: boolean;
  /** True on the round immediately after it ends. */
  exiting: boolean;
}

/**
 * How long a rapid round gives you.
 *
 * Long enough to look at two posters and know, short enough that deliberating
 * is not an option — which is the entire point, since the burst is collecting
 * instinct rather than judgement.
 */
export const RAPID_MS = 5000;

/** Fraction of the run that is rapid, and where the band starts. */
const BURST_START = 0.35;
const BURST_LENGTH = 0.3;

/** Below this a session is too short to have a middle at all. */
const MIN_TOTAL_FOR_BURST = 8;

export interface Burst {
  start: number;
  /** Exclusive. */
  end: number;
}

/** The rounds that are rapid, as a half-open interval. Empty when too short. */
export function burstFor(total: number): Burst {
  if (total < MIN_TOTAL_FOR_BURST) return { start: -1, end: -1 };
  const start = Math.round(total * BURST_START);
  const end = Math.min(total - 2, start + Math.max(2, Math.round(total * BURST_LENGTH)));
  // NEVER THE LAST TWO ROUNDS. They carry the highest expected information
  // gain in the run and a countdown would spend them on reflex.
  return end > start ? { start, end } : { start: -1, end: -1 };
}

export function planRound(index: number, total: number): RoundPlan {
  const burst = burstFor(total);
  const inBurst = index >= burst.start && index < burst.end && burst.start >= 0;
  return {
    phase: inBurst ? 'rapid' : 'cinematic',
    timeLimitMs: inBurst ? RAPID_MS : null,
    entering: inBurst && index === burst.start,
    exiting: !inBurst && burst.start >= 0 && index === burst.end,
  };
}

/** Every rapid round index, for tests and for the E2E to aim at. */
export function rapidRounds(total: number): number[] {
  const { start, end } = burstFor(total);
  if (start < 0) return [];
  return Array.from({ length: end - start }, (_, i) => start + i);
}
