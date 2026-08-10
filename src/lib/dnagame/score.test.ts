import { describe, it, expect } from 'vitest';
import {
  BASE_POINTS,
  FAST_MS,
  MAX_STREAK_MULT,
  PASS_POINTS,
  QUICK_MS,
  awardPoints,
  nextStreak,
  speedMultiplier,
  streakMultiplier,
} from './score';
import { choose, createGame, reactToTitle, startGame, type GameState } from './game';

/**
 * WHAT THE SCORE IS ALLOWED TO MEAN.
 *
 * The number on screen is the one piece of arcade in an otherwise honest
 * product, so the tests here are mostly about what it must NOT do: it must not
 * reward a particular answer, it must not run away with itself, and it must not
 * keep paying full price for a trait the engine has already settled.
 */

describe('points reward information, not agreement', () => {
  it('pays more for a decision that resolves more uncertainty', () => {
    const thin = awardPoints(0.2, 2000, 1);
    const rich = awardPoints(2, 2000, 1);
    expect(rich).toBeGreaterThan(thin);
  });

  it('never pays zero — every tap is worth something', () => {
    expect(awardPoints(0, 10_000, 0)).toBeGreaterThanOrEqual(BASE_POINTS);
  });

  it('is bounded: no single decision can dwarf the rest of the game', () => {
    // Best possible tap vs worst possible tap. Over a thirty-decision game this
    // has to stay small enough that the score reflects the whole session rather
    // than two lucky moments.
    const most = awardPoints(99, 0, 100);
    const least = awardPoints(0, 60_000, 0);
    expect(most / least).toBeLessThanOrEqual(7.5);
  });

  it('has no notion of a right answer — the same information pays the same', () => {
    // Two opposite decisions carrying identical information earn identically;
    // there is no branch anywhere that could prefer one taste over another.
    expect(awardPoints(1.4, 1200, 3)).toBe(awardPoints(1.4, 1200, 3));
  });
});

describe('speed and streak are multipliers, and they stay bounded', () => {
  it('rewards answering without hesitating', () => {
    expect(speedMultiplier(FAST_MS - 1)).toBeGreaterThan(speedMultiplier(QUICK_MS - 1));
    expect(speedMultiplier(QUICK_MS - 1)).toBeGreaterThan(speedMultiplier(QUICK_MS + 1));
  });

  it('a stall breaks the streak; a quick answer keeps it', () => {
    expect(nextStreak(5, QUICK_MS - 1)).toBe(6);
    expect(nextStreak(5, QUICK_MS + 1)).toBe(0);
  });

  it('the first quick answer is not yet a bonus, and the multiplier caps', () => {
    expect(streakMultiplier(1)).toBe(1);
    expect(streakMultiplier(2)).toBeGreaterThan(1);
    expect(streakMultiplier(1000)).toBe(MAX_STREAK_MULT);
  });
});

describe('the running score in a real game', () => {
  /** Play the whole thing, tapping the first option quickly every time. */
  function play(responseMs: number): GameState {
    let s = startGame(createGame(0), 0);
    for (let i = 0; i < 60 && s.current; i++) {
      s = s.current.layout === 'poster'
        ? reactToTitle(s, 'yes', 1000 + i, responseMs)
        : choose(s, s.current.choices.slice(0, s.current.picks).map((c) => c.id), 1000 + i, responseMs);
    }
    return s;
  }

  it('starts at zero and only ever climbs', () => {
    let s = startGame(createGame(0), 0);
    expect(s.score).toBe(0);
    let previous = 0;
    for (let i = 0; i < 20 && s.current; i++) {
      s = s.current.layout === 'poster'
        ? reactToTitle(s, 'yes', 1000 + i, 900)
        : choose(s, s.current.choices.slice(0, s.current.picks).map((c) => c.id), 1000 + i, 900);
      expect(s.score).toBeGreaterThan(previous);
      previous = s.score;
    }
  });

  it('is exactly the sum of what each decision paid', () => {
    const s = play(900);
    expect(s.score).toBe(s.decisions.reduce((sum, d) => sum + d.points, 0));
  });

  it('pays a fast player more than a slow one for the same taps', () => {
    expect(play(800).score).toBeGreaterThan(play(9000).score);
  });

  it('pays less for the same kind of decision once the traits are settled', () => {
    const s = play(900);
    const early = s.decisions.slice(0, 5).reduce((a, d) => a + d.points, 0) / 5;
    const late = s.decisions.slice(-5).reduce((a, d) => a + d.points, 0) / 5;
    expect(late, 'a settled trait is still paying full price').toBeLessThan(early);
  });

  it('a stalled decision resets the streak mid-game', () => {
    let s = startGame(createGame(0), 0);
    for (let i = 0; i < 6 && s.current; i++) {
      s = s.current.layout === 'poster'
        ? reactToTitle(s, 'yes', 1000 + i, 500)
        : choose(s, s.current.choices.slice(0, s.current.picks).map((c) => c.id), 1000 + i, 500);
    }
    expect(s.streak).toBeGreaterThan(1);
    expect(s.current).not.toBeNull();
    s = s.current!.layout === 'poster'
      ? reactToTitle(s, 'yes', 2000, 20_000)
      : choose(s, s.current!.choices.slice(0, s.current!.picks).map((c) => c.id), 2000, 20_000);
    expect(s.streak).toBe(0);
  });

  it('scoring never touches the profile', () => {
    // The same taps produce the same beliefs whether they were fast or slow.
    const fast = play(400);
    const slow = play(20_000);
    expect(fast.score).not.toBe(slow.score);
    expect(JSON.stringify(fast.profile)).toBe(JSON.stringify(slow.profile));
  });
});

describe('a pass is acknowledged, not rewarded', () => {
  it('pays the flat acknowledgement and no information bonus', () => {
    let s = startGame(createGame(0), 0);
    // Walk to a poster round.
    for (let i = 0; i < 40 && s.current && s.current.layout !== 'poster'; i++) {
      s = choose(s, s.current.choices.slice(0, s.current.picks).map((c) => c.id), 1000 + i, 900);
    }
    expect(s.current?.layout, 'never reached a movie round').toBe('poster');
    const before = s.score;
    s = reactToTitle(s, 'pass', 5000, 900);
    expect(s.score - before).toBe(PASS_POINTS);
    expect(PASS_POINTS).toBeLessThan(BASE_POINTS);
  });
});

describe('a resumed game from before scoring existed does not break', () => {
  it('treats a missing score as zero rather than NaN', () => {
    // Exactly what a sessionStorage entry written before `score` existed
    // deserialises to: the same shape, minus the two new fields.
    const { score: _score, streak: _streak, ...rest } = startGame(createGame(0), 0);
    const legacy = rest as GameState;
    const next = choose(legacy, [legacy.current!.choices[0]!.id], 1000, 900);
    expect(Number.isFinite(next.score)).toBe(true);
    expect(next.score).toBeGreaterThan(0);
  });
});
