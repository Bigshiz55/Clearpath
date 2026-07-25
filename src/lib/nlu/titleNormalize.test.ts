import { describe, it, expect } from 'vitest';
import { normalizeTitle, titleMatchTier, isExactTitle, rankByTitleIdentity } from './titleNormalize';

describe('titleNormalize', () => {
  it('normalizes safely', () => {
    expect(normalizeTitle('Gone Girl')).toBe('gone girl');
    expect(normalizeTitle("It's a Wonderful Life")).toBe('its a wonderful life');
    expect(normalizeTitle('Amélie')).toBe('amelie');
    expect(normalizeTitle('Spider-Man: No Way Home')).toBe('spider man no way home');
    expect(normalizeTitle('  Gone   ')).toBe('gone');
  });

  it('THE bug: "Gone" is NOT an exact match for "Gone Girl"', () => {
    expect(titleMatchTier('Gone', 'Gone Girl')).toBe('contains');
    expect(isExactTitle('Gone', 'Gone Girl')).toBe(false);
    expect(isExactTitle('Gone', 'Gone Baby Gone')).toBe(false);
    expect(isExactTitle('Gone', 'Gone')).toBe(true);
  });

  it('article-insensitive exact (alt) match', () => {
    expect(titleMatchTier('The Gone', 'Gone')).toBe('alt');
    expect(isExactTitle('The Office', 'Office')).toBe(true);
    expect(isExactTitle('Gone', 'The Gone')).toBe(true);
  });

  it('exact ranks above a more-popular contains match', () => {
    const cands = [
      { title: 'Gone Girl', pop: 100 },
      { title: 'Gone', pop: 5 },
      { title: 'Gone Baby Gone', pop: 40 },
    ];
    const ranked = rankByTitleIdentity('Gone', cands, (c) => c.title, (c) => c.pop);
    expect(ranked[0]!.title).toBe('Gone'); // exact beats popular
  });

  it('fuzzy only for genuine near-spellings, never for a different title', () => {
    expect(titleMatchTier('Sherlock', 'Sherlok')).toBe('fuzzy');
    expect(titleMatchTier('Gone', 'Girl')).toBe('none');
  });
});
