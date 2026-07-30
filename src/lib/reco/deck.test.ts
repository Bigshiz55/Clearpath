import { describe, it, expect } from 'vitest';
import {
  START,
  BATCH,
  PREFETCH_WITHIN,
  EMPTY_STREAK_LIMIT,
  advance,
  applyDeal,
  dealtKey,
  isSpent,
  mergeDealt,
  minScoreFor,
  shouldPrefetch,
  tierNote,
  type DeckCursor,
} from './deck';

const t = (id: number, mediaType = 'movie') => ({ id, mediaType });
const ids = (xs: { id: number }[]) => xs.map((x) => x.id);
const batchOf = (from: number) => Array.from({ length: BATCH }, (_, i) => t(from + i));

describe('nothing on screen ever moves', () => {
  it('appends, in the order the recommender gave', () => {
    expect(ids(mergeDealt([t(1), t(2)], [t(3), t(4)], dealtKey))).toEqual([1, 2, 3, 4]);
  });

  it('NEVER re-deals a title', () => {
    // The recommender has no cursor: it rebuilds a ranked list every call, so
    // deal two legitimately re-contains deal one. "A few may show up again."
    const shown = [t(1), t(2), t(3)];
    const again = [t(1), t(2), t(3), t(4), t(5)];
    expect(ids(mergeDealt(shown, again, dealtKey))).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not reorder what is already there, even when the server does', () => {
    // Every FOR/AGAINST rewrites the profile, which moves `personalScore`,
    // which re-sorts the server's list. That must not reach the screen.
    const shown = [t(9), t(4), t(7)];
    const resorted = [t(4), t(7), t(9), t(1)];
    expect(ids(mergeDealt(shown, resorted, dealtKey))).toEqual([9, 4, 7, 1]);
  });

  it('dedupes within one deal too', () => {
    expect(ids(mergeDealt([], [t(5), t(5), t(6)], dealtKey))).toEqual([5, 6]);
  });

  it('keys on media type as well as id — a film and a series can share one', () => {
    expect(mergeDealt([t(1, 'movie')], [t(1, 'tv')], dealtKey)).toHaveLength(2);
    expect(dealtKey(t(1, 'tv'))).toBe('tv-1');
  });
});

describe('walking the supply outwards', () => {
  it('starts on the strongest matches', () => {
    expect(START).toEqual({ tier: 1, page: 1 });
    expect(minScoreFor(1)).toBe(55);
  });

  it('falls through tier 1 in one step — it is genuinely finite', () => {
    // Six seeds times twenty neighbours is not a feed you can keep ruling.
    expect(advance({ tier: 1, page: 1 })).toEqual({ tier: 2, page: 1 });
  });

  it('pages through the deep tiers before widening again', () => {
    expect(advance({ tier: 2, page: 1 })).toEqual({ tier: 2, page: 2 });
    expect(advance({ tier: 2, page: 8 })).toEqual({ tier: 3, page: 1 });
    expect(advance({ tier: 3, page: 1 })).toEqual({ tier: 3, page: 2 });
  });

  it('ends — and only at the actual end', () => {
    expect(advance({ tier: 3, page: 12 })).toBeNull();
    expect(advance({ tier: 3, page: 11 })).not.toBeNull();
  });

  it('lowers the bar as the pool widens, and never raises it', () => {
    expect(minScoreFor(2)).toBeLessThan(minScoreFor(1));
    expect(minScoreFor(3)).toBeLessThan(minScoreFor(2));
  });

  it('says so when it does — a lowered bar nobody is told about is a worse recommendation in the same clothes', () => {
    expect(tierNote(1), 'a note on every batch is noise').toBeNull();
    expect(tierNote(2)).toMatch(/widening/i);
    expect(tierNote(3)).toMatch(/strongest matches/i);
  });
});

describe('the feed does not visibly stop', () => {
  it('asks for more before the last card is reached', () => {
    expect(shouldPrefetch(BATCH - PREFETCH_WITHIN, BATCH)).toBe(true);
    expect(shouldPrefetch(1, BATCH)).toBe(false);
  });

  it('does not fire on an empty feed', () => {
    expect(shouldPrefetch(0, 0)).toBe(false);
  });
});

describe('knowing when it is really over', () => {
  it('one thin deal is NOT an ending', () => {
    // The engine's fit threshold can empty one page and fill the next.
    expect(isSpent({ tier: 2, page: 3 }, 1)).toBe(false);
    expect(isSpent({ tier: 2, page: 3 }, EMPTY_STREAK_LIMIT - 1)).toBe(false);
  });

  it('several in a row is', () => {
    expect(isSpent({ tier: 2, page: 3 }, EMPTY_STREAK_LIMIT)).toBe(true);
  });

  it('so is walking off the end of the last tier', () => {
    expect(isSpent(null, 0)).toBe(true);
  });
});

describe('one deal, end to end', () => {
  const key = dealtKey;

  it('a full batch stays in the same tier and takes the next page', () => {
    const r = applyDeal(batchOf(1), batchOf(100), { tier: 2, page: 3 }, 0, key);
    expect(r.items).toHaveLength(BATCH * 2);
    expect(r.cursor).toEqual({ tier: 2, page: 4 });
    expect(r.emptyStreak).toBe(0);
    expect(r.spent).toBe(false);
    expect(r.note, 'same tier — nothing to announce').toBeNull();
  });

  it('a thin batch moves on to the next place to look', () => {
    const r = applyDeal(batchOf(1), [t(100), t(101)], { tier: 1, page: 1 }, 0, key);
    expect(r.items).toHaveLength(BATCH + 2);
    expect(r.cursor).toEqual({ tier: 2, page: 1 });
    expect(r.note, 'crossing into a broader tier is announced').toMatch(/widening/i);
  });

  it('an empty batch counts toward the end without claiming it', () => {
    const r = applyDeal(batchOf(1), [], { tier: 2, page: 1 }, 0, key);
    expect(r.items).toHaveLength(BATCH);
    expect(r.emptyStreak).toBe(1);
    expect(r.spent).toBe(false);
  });

  it('a deal that is entirely titles we already have counts as empty', () => {
    // The server can legitimately return a re-ranked copy of what is on screen.
    const shown = batchOf(1);
    const r = applyDeal(shown, [...shown].reverse(), { tier: 2, page: 1 }, 1, key);
    expect(r.items).toEqual(shown);
    expect(r.emptyStreak).toBe(2);
  });

  it('and enough of those in a row ends it', () => {
    const r = applyDeal(batchOf(1), [], { tier: 2, page: 1 }, EMPTY_STREAK_LIMIT - 1, key);
    expect(r.spent).toBe(true);
  });

  it('a good batch resets the streak — one bad page must not end a session', () => {
    const r = applyDeal(batchOf(1), batchOf(50), { tier: 2, page: 1 }, EMPTY_STREAK_LIMIT - 1, key);
    expect(r.emptyStreak).toBe(0);
    expect(r.spent).toBe(false);
  });

  it('the last page of the last tier is the end', () => {
    const r = applyDeal(batchOf(1), [t(999)], { tier: 3, page: 12 }, 0, key);
    expect(r.cursor).toBeNull();
    expect(r.spent).toBe(true);
  });

  it('walks the whole supply without ever repeating a title', () => {
    // Drive the machine the way the component does, with a server that always
    // has more but keeps re-sending everything it has sent before.
    let items: { id: number; mediaType: string }[] = [];
    let cursor: DeckCursor | null = START;
    let streak = 0;
    let n = 0;
    let deals = 0;
    while (cursor && deals < 40) {
      const fresh = batchOf(n);
      n += BATCH;
      const r: ReturnType<typeof applyDeal<{ id: number; mediaType: string }>> = applyDeal(items, [...items, ...fresh], cursor, streak, key);
      items = r.items;
      cursor = r.cursor;
      streak = r.emptyStreak;
      deals++;
      if (r.spent) break;
    }
    expect(new Set(items.map(key)).size, 'a title was dealt twice').toBe(items.length);
    expect(items.length).toBeGreaterThan(200);
  });
});
