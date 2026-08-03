import { describe, it, expect } from 'vitest';
import { selectDailyBatch, titleKey, DAILY_FETCH_CAP, REFRESH_INTERVAL_MS, type PriorityCandidate } from './priority';

const NOW = Date.parse('2026-08-03T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const c = (over: Partial<PriorityCandidate>): PriorityCandidate => ({
  tmdbId: 1, tmdbMediaType: 'movie', watchmodeId: 100, tier: 'catalog', ...over,
});

describe('selectDailyBatch — tier ordering', () => {
  it('orders watchlist before pack before catalog', () => {
    const out = selectDailyBatch(
      [c({ tmdbId: 3, tier: 'catalog' }), c({ tmdbId: 1, tier: 'watchlist' }), c({ tmdbId: 2, tier: 'pack' })],
      new Map(), NOW,
    );
    expect(out.map((x) => x.tmdbId)).toEqual([1, 2, 3]);
  });

  it('the docket tier is a real ordering slot but is never fabricated — passing none through is honest, not a bug', () => {
    const out = selectDailyBatch(
      [c({ tmdbId: 1, tier: 'watchlist' }), c({ tmdbId: 2, tier: 'pack' })],
      new Map(), NOW,
    );
    expect(out.map((x) => x.tmdbId)).toEqual([1, 2]);
  });

  it('preserves each tier\'s incoming order (e.g. most-recently-added-first)', () => {
    const out = selectDailyBatch(
      [c({ tmdbId: 10, tier: 'watchlist' }), c({ tmdbId: 20, tier: 'watchlist' }), c({ tmdbId: 30, tier: 'watchlist' })],
      new Map(), NOW,
    );
    expect(out.map((x) => x.tmdbId)).toEqual([10, 20, 30]);
  });
});

describe('selectDailyBatch — dedupe across tiers', () => {
  it('a title in both watchlist and pack tiers is kept once, at its higher priority', () => {
    const out = selectDailyBatch(
      [c({ tmdbId: 1, tier: 'catalog' }), c({ tmdbId: 1, tier: 'watchlist' })],
      new Map(), NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.tier).toBe('watchlist');
  });

  it('movie and tv with the same numeric tmdbId are distinct titles', () => {
    const out = selectDailyBatch(
      [c({ tmdbId: 5, tmdbMediaType: 'movie' }), c({ tmdbId: 5, tmdbMediaType: 'tv' })],
      new Map(), NOW,
    );
    expect(out).toHaveLength(2);
  });
});

describe('selectDailyBatch — 14-day cache', () => {
  it('a title fetched today is not selected again today (same-day resync guard)', () => {
    const key = titleKey(1, 'movie');
    const out = selectDailyBatch([c({ tmdbId: 1 })], new Map([[key, NOW]]), NOW);
    expect(out).toHaveLength(0);
  });

  it('a title fetched 13 days ago is still within the cache window — excluded', () => {
    const key = titleKey(1, 'movie');
    const out = selectDailyBatch([c({ tmdbId: 1 })], new Map([[key, NOW - 13 * DAY]]), NOW);
    expect(out).toHaveLength(0);
  });

  it('a title fetched exactly 14 days ago is due again', () => {
    const key = titleKey(1, 'movie');
    const out = selectDailyBatch([c({ tmdbId: 1 })], new Map([[key, NOW - REFRESH_INTERVAL_MS]]), NOW);
    expect(out).toHaveLength(1);
  });

  it('a never-fetched title is always due', () => {
    const out = selectDailyBatch([c({ tmdbId: 1 })], new Map(), NOW);
    expect(out).toHaveLength(1);
  });
});

describe('selectDailyBatch — the daily cap', () => {
  it('caps at 50 by default, even with far more candidates', () => {
    const many = Array.from({ length: 500 }, (_, i) => c({ tmdbId: i + 1, tier: 'catalog' }));
    const out = selectDailyBatch(many, new Map(), NOW);
    expect(out).toHaveLength(DAILY_FETCH_CAP);
  });

  it('higher-priority tiers fill the cap before lower ones', () => {
    const watchlist = Array.from({ length: 30 }, (_, i) => c({ tmdbId: i + 1, tier: 'watchlist' }));
    const catalog = Array.from({ length: 100 }, (_, i) => c({ tmdbId: i + 1000, tier: 'catalog' }));
    const out = selectDailyBatch([...catalog, ...watchlist], new Map(), NOW, 50);
    expect(out.filter((x) => x.tier === 'watchlist')).toHaveLength(30);
    expect(out.filter((x) => x.tier === 'catalog')).toHaveLength(20);
  });

  it('an explicit smaller cap is honoured', () => {
    const out = selectDailyBatch(
      [c({ tmdbId: 1 }), c({ tmdbId: 2 }), c({ tmdbId: 3 })],
      new Map(), NOW, 2,
    );
    expect(out).toHaveLength(2);
  });
});

describe('selectDailyBatch — edge cases', () => {
  it('empty candidates produce an empty batch', () => {
    expect(selectDailyBatch([], new Map(), NOW)).toEqual([]);
  });
});
