/**
 * VERD1CT RUSH — points.
 *
 * The score exists to make the game feel like a game. It is also the only
 * number on screen that is allowed to be arcade-flavoured, so it has to be
 * honest about what it rewards, or it becomes decoration that lies.
 *
 * IT REWARDS INFORMATION, NOT AGREEMENT. A decision is worth more when it
 * resolves something the engine genuinely did not know — the same quantity the
 * planner already uses to pick what to ask. There is no "right" answer to score
 * against and there must never be one: this measures how much a tap taught us,
 * not whether the player has good taste.
 *
 * SPEED AND STREAK ARE MULTIPLIERS, NOT THE POINT. They are what turns "answer
 * thirty questions" into "keep going" — bounded so that a fast player of bad
 * information cannot out-score a thoughtful one, and so the number stays
 * readable rather than exploding into confetti maths.
 *
 * PURE. Time is passed in as an elapsed duration, never read.
 */

/**
 * Every decision is worth something — nobody taps for zero.
 *
 * The floor and the ceiling are set together on purpose. With the multipliers
 * capped at ×3 (fast × a maxed streak), the best possible decision is worth
 * 7.5× the worst, which keeps a thirty-decision game from being decided by two
 * lucky taps while still making a revealing answer visibly better than a dull
 * one. `score.test.ts` holds that ratio.
 */
export const BASE_POINTS = 80;

/** The most a single decision can earn for what it taught, before multipliers. */
export const INFO_POINTS = 120;

/**
 * Information (in the planner's uncertainty × pull units) that earns the full
 * bonus. Roughly a choice that moves three wide-open traits hard.
 */
export const INFO_FULL = 2;

/** Answered without hesitating. */
export const FAST_MS = 1500;
/** Answered without drifting off. Also the streak-keeping threshold. */
export const QUICK_MS = 3000;

export const FAST_MULT = 1.5;
export const QUICK_MULT = 1.2;

/** Each unbroken decision after the first adds this much. */
export const STREAK_STEP = 0.15;
export const MAX_STREAK_MULT = 2;

/** Where the flame appears. Below this, a streak is not yet a streak. */
export const STREAK_VISIBLE = 3;

/** "Haven't seen it" is an honest answer worth acknowledging — and no evidence. */
export const PASS_POINTS = 20;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A streak survives any decision made inside {@link QUICK_MS}. */
export function nextStreak(streak: number, responseMs: number): number {
  return responseMs <= QUICK_MS ? streak + 1 : 0;
}

/** Takes the streak AFTER this decision, so the first quick answer is ×1. */
export function streakMultiplier(streak: number): number {
  return Math.min(MAX_STREAK_MULT, 1 + STREAK_STEP * Math.max(0, streak - 1));
}

export function speedMultiplier(responseMs: number): number {
  if (responseMs <= FAST_MS) return FAST_MULT;
  if (responseMs <= QUICK_MS) return QUICK_MULT;
  return 1;
}

/**
 * Points for one decision. `info` is the uncertainty it resolved, measured
 * against the profile as it stood BEFORE the decision landed — which is why the
 * same tap is worth less the second time the engine sees that trait.
 */
export function awardPoints(info: number, responseMs: number, streak: number): number {
  const base = BASE_POINTS + INFO_POINTS * clamp01(info / INFO_FULL);
  const raw = base * speedMultiplier(responseMs) * streakMultiplier(streak);
  // Round to fives: a score that ticks in units of 1 reads as a counter, and a
  // score that ticks in units of 5 reads as a reward.
  return Math.round(raw / 5) * 5;
}
