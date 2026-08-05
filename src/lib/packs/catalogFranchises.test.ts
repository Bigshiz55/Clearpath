import { describe, it, expect } from 'vitest';
import {
  normalizeForMatch,
  isFranchiseMember,
  buildFranchise,
  FRANCHISE_SEEDS,
  type FranchiseSeed,
} from './catalogFranchises';
import type { SearchResultItem } from '@/lib/tmdb/client';

const r = (id: number, title: string, year: number | null, mediaType: 'movie' | 'tv' = 'movie'): SearchResultItem => ({
  id, mediaType, title, year, overview: '', posterPath: null, voteAverage: null, popularity: null,
});

/**
 * Franchise order must come from the CATALOG, not from today's listings feed —
 * and must never invent membership. These tests pin both directions.
 */

describe('membership matching', () => {
  const aurora: FranchiseSeed = {
    name: 'Aurora Teagarden Mysteries', query: 'Aurora Teagarden', prefixes: ['aurora teagarden'], kind: 'movies',
  };

  it('punctuation and case never break a franchise apart', () => {
    expect(normalizeForMatch('Murder, She Baked: A Plum Pudding Mystery')).toBe('murder she baked a plum pudding mystery');
    expect(isFranchiseMember(aurora, 'Aurora Teagarden Mysteries: A Bone to Pick')).toBe(true);
    expect(isFranchiseMember(aurora, 'AURORA TEAGARDEN MYSTERIES: TIL DEATH DO US PART')).toBe(true);
  });

  it('a lookalike that merely contains the name is not a member', () => {
    expect(isFranchiseMember(aurora, 'The Real Aurora Teagarden Story')).toBe(false);
    expect(isFranchiseMember(aurora, 'Aurora')).toBe(false);
  });
});

describe('order comes from the catalog, not from us', () => {
  const seed: FranchiseSeed = { name: 'Test', query: 'Test', prefixes: ['test film'], kind: 'movies' };

  it('movies sort by release year ascending; unknown years go last, never guessed into the middle', () => {
    const out = buildFranchise(seed, [
      r(3, 'Test Film: Third', 2021),
      r(1, 'Test Film', 2017),
      r(9, 'Test Film: Unknown', null),
      r(2, 'Test Film: Second', 2019),
      r(99, 'Unrelated Movie', 2018),
    ]);
    expect(out.entries.map((e) => e.tmdbId)).toEqual([1, 2, 3, 9]);
  });

  it('duplicate catalog rows collapse to one entry', () => {
    const out = buildFranchise(seed, [r(1, 'Test Film', 2017), r(1, 'Test Film', 2017)]);
    expect(out.entries).toHaveLength(1);
  });

  it('a flagship SERIES keeps one entry — spinoffs are not an "order"', () => {
    const series: FranchiseSeed = { name: '48 Hours', query: '48 Hours', prefixes: ['48 hours'], kind: 'series' };
    const out = buildFranchise(series, [
      r(10, '48 Hours', 1988, 'tv'),
      r(11, '48 Hours: Hard Evidence', 2008, 'tv'),
    ]);
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0]!.tmdbId).toBe(10);
  });

  it('a seed with no catalog matches renders nothing — never an invented list', () => {
    const out = buildFranchise(seed, [r(99, 'Unrelated', 2020)]);
    expect(out.entries).toHaveLength(0);
  });
});

describe('the seeds hold names, never titles or ordering', () => {
  it('every required Hallmark franchise is seeded', () => {
    const names = FRANCHISE_SEEDS['hallmark-universe'].map((s) => s.name.toLowerCase()).join(' | ');
    for (const required of [
      'aurora teagarden', 'mystery 101', 'hannah swensen', 'signed, sealed, delivered',
      'crossword mysteries', 'curious caterer', 'chronicle mysteries',
    ]) {
      expect(names, required).toContain(required);
    }
  });

  it('lifetime and crime have catalog-backed seeds of their own', () => {
    expect(FRANCHISE_SEEDS['lifetime-vault'].length).toBeGreaterThan(0);
    expect(FRANCHISE_SEEDS['crime-case-files'].length).toBeGreaterThan(0);
  });

  it('no seed carries a hard-coded title list or sequence — only a name and a match rule', () => {
    for (const seeds of Object.values(FRANCHISE_SEEDS)) {
      for (const seed of seeds) {
        expect(Object.keys(seed).sort()).toEqual(['kind', 'name', 'prefixes', 'query']);
      }
    }
  });
});
