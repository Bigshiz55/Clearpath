import { describe, it, expect } from 'vitest';
import {
  candidateTarget,
  discoverPages,
  enoughSurvivors,
  isKeywordStarved,
  isPaceStarved,
  mapPool,
  waves,
  MAX_CANDIDATES,
  MIN_CANDIDATES,
  OVERSHOOT,
  PAGE_SIZE,
} from './finderPool';
import { DEFAULT_RESULT_COUNT } from './nlu/count';

/**
 * THE OTHER CEILING.
 *
 * `runFinder` pulled two discover pages, deduped, and took the first SIXTEEN —
 * a constant unrelated to how many results the caller asked for. Sixteen was
 * therefore the maximum the whole product could return, and once the hard
 * filters had run it returned about eight. Raising the result limit did
 * nothing; the pool was the wall.
 */
describe('the candidate pool is sized by the ask, not by a constant', () => {
  it('a full page of results needs a pool several times larger', () => {
    // The old cap. A 24-result request cannot be served from 16 candidates
    // even if every single one survives every filter.
    expect(candidateTarget(DEFAULT_RESULT_COUNT)).toBeGreaterThan(16);
    expect(candidateTarget(DEFAULT_RESULT_COUNT)).toBeGreaterThanOrEqual(DEFAULT_RESULT_COUNT * OVERSHOOT);
  });

  it('grows with the request', () => {
    expect(candidateTarget(48)).toBeGreaterThan(candidateTarget(24));
  });

  it('is bounded at both ends — a tiny ask still gets ranking choice, a huge one cannot flood upstream', () => {
    expect(candidateTarget(1)).toBe(MIN_CANDIDATES);
    expect(candidateTarget(1000)).toBe(MAX_CANDIDATES);
    for (const n of [1, 3, 8, 24, 60, 500]) {
      expect(candidateTarget(n)).toBeGreaterThanOrEqual(MIN_CANDIDATES);
      expect(candidateTarget(n)).toBeLessThanOrEqual(MAX_CANDIDATES);
    }
  });

  it('pulls enough discover pages to actually contain that pool', () => {
    for (const [limit, types] of [[24, 1], [24, 2], [60, 1], [60, 2]] as const) {
      const pages = discoverPages(limit, types);
      const rows = pages.length * PAGE_SIZE * types;
      expect(rows, `limit=${limit} types=${types}`).toBeGreaterThanOrEqual(candidateTarget(limit));
    }
  });

  it('never asks for fewer pages than the two it used to', () => {
    expect(discoverPages(1, 2).length).toBeGreaterThanOrEqual(2);
    expect(discoverPages(24, 1)).toEqual([1, 2, 3, 4]);
  });

  it('goes deeper for a single media type than for two — same total fan-out', () => {
    expect(discoverPages(24, 1).length).toBeGreaterThan(discoverPages(24, 2).length);
  });

  it('stops hydrating with ranking headroom, not at exactly the number shown', () => {
    // Stopping at exactly `limit` would mean the last result shown was also the
    // last one looked at — there would be nothing for the sort to choose from.
    expect(enoughSurvivors(24)).toBeGreaterThan(24);
    expect(enoughSurvivors(8)).toBeGreaterThan(8);
  });
});

/**
 * THE TWO-RESULT "FEEL-GOOD" BUG.
 *
 * A vibe keyword ("feel-good") resolves to one sparsely-tagged TMDB keyword
 * id and, used as a hard `with_keywords` filter, starves an otherwise-broad
 * request down to a couple of survivors — never exactly zero, so the
 * pre-existing zero-result fallback never fired and the shortfall went
 * unexplained. `isKeywordStarved` is the trigger for the relax-and-retry
 * fallback that replaces it.
 */
describe('isKeywordStarved — detects a vibe keyword that starved the pool', () => {
  it('is starved when a keyword search yields under half the ask', () => {
    expect(isKeywordStarved(2, 24, true)).toBe(true);
    expect(isKeywordStarved(0, 24, true)).toBe(true);
  });

  it('is not starved once survivors clear half the ask', () => {
    expect(isKeywordStarved(12, 24, true)).toBe(false);
    expect(isKeywordStarved(24, 24, true)).toBe(false);
  });

  it('never fires when the query had no keyword filter at all', () => {
    expect(isKeywordStarved(0, 24, false)).toBe(false);
    expect(isKeywordStarved(2, 24, false)).toBe(false);
  });

  it('a tiny ask (limit=1) still requires at least one survivor', () => {
    expect(isKeywordStarved(0, 1, true)).toBe(true);
    expect(isKeywordStarved(1, 1, true)).toBe(false);
  });
});

/**
 * THE ONE-RESULT "THRILLER THAT DRAGS" BUG — the pace twin of the above.
 *
 * Measured on the deployed proof (2026-08-20): "I want a thriller that drags"
 * executed as genre 53 + a hard pace band, and the band kept ONE of forty
 * candidates. The pool is drawn by popularity with no knowledge of pace, and
 * `paceScore` is a genre+runtime heuristic that scores nearly every popular
 * thriller fast — so a stated slow-burn over a fast genre starves the field
 * without ever hitting zero, and no existing fallback saw it.
 *
 * The remedy is NOT the keyword twin's refill. That was tried, and the same
 * proof failed it twice over: off-pace titles padded behind the strict match
 * handed back the exact head "nothing that drags" returns (the two asks are
 * required to differ), and the spliced order had no evidence channel claiming
 * responsibility. The remedy is a deeper pool (`candidateTarget` below) plus
 * an honest shortfall label — never padding.
 */
describe('isPaceStarved — detects a pace band that starved the pool', () => {
  it('is starved when the band keeps under half the ask', () => {
    expect(isPaceStarved(1, 24, true)).toBe(true); // the deployed reproduction
    expect(isPaceStarved(0, 24, true)).toBe(true);
  });

  it('is not starved once survivors clear half the ask', () => {
    expect(isPaceStarved(12, 24, true)).toBe(false);
    expect(isPaceStarved(24, 24, true)).toBe(false);
  });

  it('never fires when the query had no pace band at all', () => {
    expect(isPaceStarved(0, 24, false)).toBe(false);
    expect(isPaceStarved(1, 24, false)).toBe(false);
  });
});

describe('a pace-banded ask gets the ceiling pool', () => {
  it('pace bands hydrate the maximum pool — discovery cannot pre-filter on pace', () => {
    // 39-of-40 measured attrition: OVERSHOOT is not sized for a band that does
    // all its killing after hydration. The ceiling is the same MAX_CANDIDATES
    // every large ask already lives under — bounded, not unbounded.
    expect(candidateTarget(24, { paceBanded: true })).toBe(MAX_CANDIDATES);
    expect(candidateTarget(1, { paceBanded: true })).toBe(MAX_CANDIDATES);
  });

  it('without a pace band the sizing is exactly what it was', () => {
    for (const n of [1, 3, 8, 24, 60, 500]) {
      expect(candidateTarget(n, {})).toBe(candidateTarget(n));
      expect(candidateTarget(n, { paceBanded: false })).toBe(candidateTarget(n));
    }
  });

  it('discover pages actually contain the deepened pool', () => {
    for (const types of [1, 2] as const) {
      const rows = discoverPages(24, types, { paceBanded: true }).length * PAGE_SIZE * types;
      expect(rows, `types=${types}`).toBeGreaterThanOrEqual(candidateTarget(24, { paceBanded: true }));
    }
  });
});

describe('mapPool — bounded concurrency, order preserved', () => {
  it('returns results in input order', async () => {
    const out = await mapPool([5, 1, 4, 2, 3], 2, async (n) => {
      await new Promise((r) => setTimeout(r, n));
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
  });

  it('never exceeds the concurrency limit', async () => {
    let live = 0;
    let peak = 0;
    await mapPool(Array.from({ length: 40 }, (_, i) => i), 4, async (n) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 1));
      live--;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('handles an empty pool without hanging', async () => {
    expect(await mapPool([], 8, async (x) => x)).toEqual([]);
  });
});

describe('waves', () => {
  it('splits into fixed-size chunks with a short tail', () => {
    expect(waves([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(waves([], 3)).toEqual([]);
  });

  it('covers every item exactly once', () => {
    const items = Array.from({ length: 97 }, (_, i) => i);
    expect(waves(items, 24).flat()).toEqual(items);
  });
});
