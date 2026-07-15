import { describe, it, expect } from 'vitest';
import {
  EMPTY_COUNTS,
  courtStanding,
  standingPoints,
  computeBadges,
  earnedBadgeCount,
  deriveTitle,
  unlockedDecor,
  consecutiveWeeks,
  type ChambersCounts,
} from './chambers';

function counts(over: Partial<ChambersCounts>): ChambersCounts {
  return { ...EMPTY_COUNTS, ...over };
}

describe('Court Standing', () => {
  it('starts every new user at Clerk with progress toward Bailiff', () => {
    const s = courtStanding(EMPTY_COUNTS);
    expect(s.name).toBe('Clerk');
    expect(s.level).toBe(0);
    expect(s.points).toBe(0);
    expect(s.next).toEqual({ name: 'Bailiff', at: 15 });
    expect(s.toNext).toBe(15);
    expect(s.progress).toBe(0);
  });

  it('weighs reviews more than plain ratings', () => {
    expect(standingPoints(counts({ rated: 3 }))).toBe(3);
    expect(standingPoints(counts({ reviews: 3 }))).toBe(9);
  });

  it('promotes at the threshold and reports progress within a rank', () => {
    const s = courtStanding(counts({ rated: 40 })); // exactly Juror
    expect(s.name).toBe('Juror');
    expect(s.next).toEqual({ name: 'Counsel', at: 90 });
    expect(s.toNext).toBe(50);
    expect(s.progress).toBeCloseTo(0, 5);
  });

  it('caps out at Judge with no next rank', () => {
    const s = courtStanding(counts({ rated: 500 }));
    expect(s.name).toBe('Judge');
    expect(s.next).toBeNull();
    expect(s.toNext).toBe(0);
    expect(s.progress).toBe(1);
  });
});

describe('Badges', () => {
  it('locks everything for a brand-new user but still reports progress', () => {
    const badges = computeBadges(EMPTY_COUNTS);
    expect(badges.every((b) => !b.earned)).toBe(true);
    const swornIn = badges.find((b) => b.key === 'sworn-in')!;
    expect(swornIn.have).toBe(0);
    expect(swornIn.need).toBe(10);
  });

  it('earns a badge exactly at its threshold', () => {
    expect(earnedBadgeCount(counts({ verdicts: 1 }))).toBe(1); // opening statement
    const badges = computeBadges(counts({ rated: 50 }));
    expect(badges.find((b) => b.key === 'sworn-in')!.earned).toBe(true);
    expect(badges.find((b) => b.key === 'the-jury')!.earned).toBe(true);
    expect(badges.find((b) => b.key === 'full-docket')!.earned).toBe(false);
  });
});

describe('Viewing title', () => {
  it('withholds a title until there is enough activity', () => {
    expect(deriveTitle({ rated: 2, verdicts: 1, finished: 0, reviews: 0, streakWeeks: 0, decades: 0, mix: { watch: 0, maybe: 0, skip: 0 } })).toBeNull();
  });

  it('names a heavy skipper The Tough Critic', () => {
    const t = deriveTitle({ rated: 20, verdicts: 20, finished: 0, reviews: 0, streakWeeks: 0, decades: 0, mix: { watch: 3, maybe: 3, skip: 14 } });
    expect(t).toBe('The Tough Critic');
  });

  it('prefers the reviewer title when they review a lot', () => {
    const t = deriveTitle({ rated: 20, verdicts: 20, finished: 30, reviews: 20, streakWeeks: 8, decades: 6, mix: { watch: 12, maybe: 4, skip: 2 } });
    expect(t).toBe('The Critic');
  });

  it('falls back to a loved-trait devotee, then a safe default', () => {
    const base = { rated: 12, verdicts: 0, finished: 0, reviews: 0, streakWeeks: 0, decades: 0, mix: { watch: 0, maybe: 0, skip: 0 } };
    expect(deriveTitle({ ...base, topLove: 'Slow Burn' })).toBe('The Slow Burn Devotee');
    expect(deriveTitle({ ...base, topLove: null })).toBe('The Regular Viewer');
  });
});

describe('Chambers decor', () => {
  it('shows nothing on the clean style and caps the moderate style', () => {
    const rich = counts({ verdicts: 5, rated: 60, streakWeeks: 6, decades: 5, reviews: 12, finished: 40, onDocket: 20 });
    expect(unlockedDecor(rich, 'clean')).toHaveLength(0);
    expect(unlockedDecor(rich, 'moderate')).toHaveLength(4);
    expect(unlockedDecor(rich, 'full').length).toBeGreaterThan(4);
  });

  it('only unlocks items whose real milestone is met', () => {
    const items = unlockedDecor(counts({ verdicts: 1 }), 'full');
    expect(items.map((i) => i.key)).toEqual(['gavel']);
  });
});

describe('Streak', () => {
  it('counts an unbroken run ending this week', () => {
    expect(consecutiveWeeks([100, 99, 98], 100)).toBe(3);
  });

  it('gives grace for last week but breaks if older', () => {
    expect(consecutiveWeeks([99, 98], 100)).toBe(2); // latest = last week, still alive
    expect(consecutiveWeeks([98, 97], 100)).toBe(0); // two weeks stale → broken
  });

  it('stops at the first gap and ignores duplicates', () => {
    expect(consecutiveWeeks([100, 100, 99, 97, 96], 100)).toBe(2);
  });

  it('is 0 with no activity', () => {
    expect(consecutiveWeeks([], 100)).toBe(0);
  });
});
