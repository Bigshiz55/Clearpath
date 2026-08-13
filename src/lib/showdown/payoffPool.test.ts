import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PreferenceEvent } from '@/lib/preference/types';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { mediaTypeFor } from './mediaType';

/**
 * THE PAYOFF IS WIRED, AND IT IS ALLOWED TO SAY "NO" IN TWO DIFFERENT WAYS.
 *
 * `payoff.ts` already proves the arithmetic reorders a candidate set. What it
 * cannot prove is that the product ever asks it — and it did not. `payoff.ts`
 * shipped on the branch with no caller outside its own test file, while the
 * results screen went on ranking the 113 diagnostic titles. A module that is
 * only exercised by its test is a claim in a PR description, not a feature.
 *
 * So this pins the half that decides WHICH CANDIDATES, and the three outcomes
 * the screen has to be able to tell apart:
 *
 *   null          we could not measure — no pool, or nothing fingerprinted.
 *   movement 0    we measured, and the session did not cross MIN_RANK_CONF.
 *   movement > 0  we measured, and the real ranker reordered.
 *
 * Collapsing the first two is how a screen starts lying: "nothing moved" when
 * TMDB was down is a fabricated reassurance about a measurement nobody took.
 */

const discoverTitles = vi.hoisted(() => vi.fn());
const getCachedDimensions = vi.hoisted(() => vi.fn());

vi.mock('@/lib/tmdb/client', () => ({ discoverTitles }));
vi.mock('@/lib/titleDimensions', () => ({ getCachedDimensions }));

const { measurePayoff, PAYOFF_TOP } = await import('./payoffPool');

/** A pool item in the shape `discoverTitles` returns. */
function item(id: number, title: string) {
  return { id, mediaType: 'movie' as const, title, year: 2020, posterPath: null };
}

/**
 * A fingerprint that is extreme on `darkness` and neutral elsewhere, so a
 * darkness-leaning profile has exactly one thing to act on.
 */
function dims(darkness: number) {
  return { darkness, pacing: 50, warmth: 50, humor: 50, complexity: 50 };
}

/**
 * Events strong enough to clear `MIN_RANK_CONF` on one axis.
 *
 * Built as ordinary attraction events rather than through the Showdown crossing
 * on purpose: this test is about the POOL and the counterfactual, and a
 * hand-built log is the only way to be certain the belief under test is the one
 * that moved.
 */
function darknessEvents(count: number, at: number): PreferenceEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ev-${i}`,
    titleId: `movie:${9000 + i}`,
    action: 'unseen_interested' as const,
    attractionGrade: 'must_watch' as const,
    at: at - i * 1000,
    source: 'showdown' as const,
    dims: dims(100),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getCachedDimensions.mockResolvedValue(new Map());
  discoverTitles.mockResolvedValue([]);
});

describe('the candidate pool is the real one, and never the instrument', () => {
  it('excludes every diagnostic title by tmdb identity', async () => {
    /* THE CLOSED LOOP THIS PREVENTS. A player answers twenty questions about a
       pool and is then "recommended" something out of that same pool. It is
       true that they might like it and it is worthless as evidence that the
       product learned anything. */
    const diagnostic = TITLES.filter((t) => mediaTypeFor(t.id) === 'movie').slice(0, 3);
    const pool = [
      ...diagnostic.map((t) => item(t.tmdbId, t.title)),
      item(555001, 'Not A Diagnostic Title'),
    ];
    discoverTitles.mockResolvedValue(pool);
    getCachedDimensions.mockResolvedValue(
      new Map(pool.map((p) => [`movie-${p.id}`, dims(70)])),
    );

    const out = await measurePayoff({ events: [], writtenIds: [], now: 1_700_000_000_000 });
    expect(out).not.toBeNull();
    const ids = out!.after.map((c) => c.id);
    for (const t of diagnostic) {
      expect(ids, `${t.title} was played in the game and must not be its own reward`).not.toContain(
        `movie-${t.tmdbId}`,
      );
    }
    expect(ids).toContain('movie-555001');
  });

  it('de-duplicates the pages it stitches together', async () => {
    const pool = [item(1, 'One'), item(1, 'One'), item(2, 'Two')];
    discoverTitles.mockResolvedValue(pool);
    getCachedDimensions.mockResolvedValue(new Map(pool.map((p) => [`movie-${p.id}`, dims(70)])));
    const out = await measurePayoff({ events: [], writtenIds: [], now: 1 });
    expect(out!.after.filter((c) => c.id === 'movie-1')).toHaveLength(1);
  });
});

describe('"we could not measure" is not "nothing moved"', () => {
  it('returns null when the pool is empty', async () => {
    discoverTitles.mockResolvedValue([]);
    expect(await measurePayoff({ events: [], writtenIds: [], now: 1 })).toBeNull();
  });

  it('returns null when the discover call fails outright', async () => {
    discoverTitles.mockRejectedValue(new Error('no TMDB key'));
    expect(await measurePayoff({ events: [], writtenIds: [], now: 1 })).toBeNull();
  });

  it('returns null when NOT ONE candidate carries a fingerprint', async () => {
    /* A pool of unfingerprinted titles cannot move whatever the player did, so
       reporting `movement: 0` would blame the session for a gap in the
       catalogue. */
    discoverTitles.mockResolvedValue([item(1, 'One'), item(2, 'Two')]);
    getCachedDimensions.mockResolvedValue(new Map());
    expect(await measurePayoff({ events: [], writtenIds: [], now: 1 })).toBeNull();
  });

  it('but measures when even one candidate is fingerprinted', async () => {
    discoverTitles.mockResolvedValue([item(1, 'One'), item(2, 'Two')]);
    getCachedDimensions.mockResolvedValue(new Map([['movie-1', dims(90)]]));
    expect(await measurePayoff({ events: [], writtenIds: [], now: 1 })).not.toBeNull();
  });
});

describe('the counterfactual is this log minus this session', () => {
  const now = 1_700_000_000_000;

  /**
   * A twenty-title pool, which is what two discover pages actually deliver, with
   * the DARK title placed LAST.
   *
   * Both of those details matter and the first draft of this test got them
   * wrong. A three-item pool spaces the baseline ten points apart, which a
   * bounded ±10 nudge cannot cross in one move — so the test would have been
   * measuring the fixture. And putting the dark title FIRST asks it to climb
   * from a position it already holds, which reports "nothing moved" for a
   * session that in fact moved the belief by six points. Both failures look
   * identical to a genuine below-threshold result, which is exactly why the
   * fixture has to be realistic.
   */
  function pool() {
    const p = Array.from({ length: 20 }, (_, i) => item(i + 1, `Title ${i + 1}`));
    discoverTitles.mockResolvedValue(p);
    getCachedDimensions.mockResolvedValue(
      new Map([
        ['movie-20', dims(95)],
        ['movie-1', dims(5)],
      ]),
    );
    return p;
  }

  it('a session that wrote nothing leaves the order exactly as it was', async () => {
    pool();
    const events = darknessEvents(12, now);
    const out = await measurePayoff({ events, writtenIds: [], now });
    expect(out!.movement, 'before and after fold the identical event set').toBe(0);
  });

  it('and removing the written ids is what produces the "before"', async () => {
    pool();
    const events = darknessEvents(12, now);
    /* Every event attributed to this session. `before` therefore folds an empty
       log — no belief at all — and `after` folds a confident darkness lean, so
       the dark title must climb over the light one. */
    const out = await measurePayoff({ events, writtenIds: events.map((e) => e.id), now });
    expect(out!.movement).toBeGreaterThan(0);
    const dark = out!.after.find((c) => c.id === 'movie-20')!;
    const light = out!.after.find((c) => c.id === 'movie-1')!;
    expect(dark.moved, 'the dark title climbs').toBeGreaterThan(0);
    expect(light.moved, 'the light title falls').toBeLessThan(0);
    /* AND THEY DO NOT CROSS, which is the correct result and worth pinning.
       Measured: the dark title goes 20th → 15th and the light one 1st → 4th.
       They start nineteen places apart and a bounded ±10 nudge on each is
       roughly eight places of travel between them. A recommender in which one
       taste signal could invert a twenty-title pool would be one where the
       deterministic score had stopped meaning anything. */
    expect(dark.now).toBeGreaterThan(light.now);
  });

  it('an id that is not on the log cannot invent a difference', async () => {
    pool();
    const events = darknessEvents(12, now);
    const out = await measurePayoff({ events, writtenIds: ['not-a-real-event'], now });
    expect(out!.movement).toBe(0);
  });
});

describe('the baseline spacing lets a bounded nudge actually reorder', () => {
  const now = 1_700_000_000_000;

  it('a full-strength nudge moves a title several places, not zero and not the whole pool', async () => {
    /* THE FAILURE THIS CATCHES IS SILENT AND IT CUTS BOTH WAYS.
       Space the baseline 100/90/80… and a ±10 nudge can never overtake
       anything: the payoff reports 0 forever and looks exactly like an honest
       below-threshold result. Compress it to nothing and the nudge decides the
       whole order, which would mean the deterministic side had stopped
       mattering. The 30-point spread is production-shaped — a real Watchability
       spread across a popularity-sorted pool — and this pins that a
       full-strength belief buys a real but bounded number of places. */
    const p = Array.from({ length: 40 }, (_, i) => item(i + 1, `Title ${i + 1}`));
    discoverTitles.mockResolvedValue(p);
    getCachedDimensions.mockResolvedValue(
      new Map([[`movie-40`, dims(100)], [`movie-1`, dims(0)]]),
    );
    const events = darknessEvents(30, now);
    const out = await measurePayoff({ events, writtenIds: events.map((e) => e.id), now });
    const dark = out!.after.find((c) => c.id === 'movie-40')!;
    expect(dark.moved, 'a bounded nudge must be able to cross several positions').toBeGreaterThanOrEqual(5);
    expect(dark.now, 'and must NOT be able to buy the whole pool').toBeGreaterThan(PAYOFF_TOP);
  });

  it('an unfingerprinted title in a moving pool simply does not move', async () => {
    const p = Array.from({ length: 20 }, (_, i) => item(i + 1, `Title ${i + 1}`));
    discoverTitles.mockResolvedValue(p);
    getCachedDimensions.mockResolvedValue(new Map([[`movie-20`, dims(100)]]));
    const events = darknessEvents(30, now);
    const out = await measurePayoff({ events, writtenIds: events.map((e) => e.id), now });
    // Nothing was asserted about movie-10, so it can only be displaced by
    // others — never nudged itself.
    const untouched = out!.after.find((c) => c.id === 'movie-10')!;
    expect(untouched.nudge).toBe(0);
  });
});
