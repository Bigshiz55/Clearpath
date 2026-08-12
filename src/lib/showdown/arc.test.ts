import { describe, it, expect } from 'vitest';
import { RAPID_MS, burstFor, planRound, rapidRounds } from './arc';
import { TARGET_DECISIONS } from './session';

/**
 * A SESSION NEEDS A MIDDLE.
 *
 * These pin the two properties that make the burst a pace change rather than a
 * hazard: it never lands on the rounds where the player is still learning the
 * controls, and it never lands on the rounds carrying the best questions.
 */

describe('the burst sits in the middle, deliberately', () => {
  it('never times the opening rounds', () => {
    /* A countdown over a UI the player has not used yet is stressful, not
       exciting — and "make it addictive rather than stressful" is the rule. */
    for (const i of [0, 1, 2]) {
      expect(planRound(i, TARGET_DECISIONS).phase, `round ${i} was timed`).toBe('cinematic');
    }
  });

  it('NEVER times the last two rounds', () => {
    /* They carry the highest expected information gain in the run. Spending
       them on reflex would waste the best questions the planner has. */
    for (const i of [TARGET_DECISIONS - 2, TARGET_DECISIONS - 1]) {
      expect(planRound(i, TARGET_DECISIONS).phase, `round ${i} was timed`).toBe('cinematic');
    }
  });

  it('produces a real, contiguous burst at the shipped session length', () => {
    const rounds = rapidRounds(TARGET_DECISIONS);
    expect(rounds.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < rounds.length; i++) {
      expect(rounds[i]! - rounds[i - 1]!).toBe(1);
    }
  });

  it('gives rapid rounds a clock and cinematic rounds none', () => {
    const rapid = rapidRounds(TARGET_DECISIONS)[0]!;
    expect(planRound(rapid, TARGET_DECISIONS).timeLimitMs).toBe(RAPID_MS);
    expect(planRound(0, TARGET_DECISIONS).timeLimitMs).toBeNull();
  });

  it('announces entering and exiting exactly once each', () => {
    const total = TARGET_DECISIONS;
    const entering = Array.from({ length: total }, (_, i) => planRound(i, total)).filter((p) => p.entering);
    const exiting = Array.from({ length: total }, (_, i) => planRound(i, total)).filter((p) => p.exiting);
    expect(entering).toHaveLength(1);
    expect(exiting).toHaveLength(1);
  });

  it('a session too short to have a middle has no burst at all', () => {
    expect(rapidRounds(6)).toEqual([]);
    expect(burstFor(6).start).toBe(-1);
    for (let i = 0; i < 6; i++) expect(planRound(i, 6).phase).toBe('cinematic');
  });

  it('is deterministic — the same round is always the same phase', () => {
    // So a test and an E2E can land on the burst on purpose.
    for (let i = 0; i < TARGET_DECISIONS; i++) {
      expect(planRound(i, TARGET_DECISIONS)).toEqual(planRound(i, TARGET_DECISIONS));
    }
  });

  it('most of the session is still cinematic', () => {
    // The burst is punctuation. A game that is mostly countdown is a different,
    // worse game.
    expect(rapidRounds(TARGET_DECISIONS).length).toBeLessThan(TARGET_DECISIONS / 2);
  });
});
