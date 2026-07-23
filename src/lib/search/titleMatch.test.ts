import { describe, it, expect } from 'vitest';
import { titleMatches, normTitle, titleTokens, isTokenWindow } from './titleMatch';

describe('normTitle / titleTokens', () => {
  it('folds diacritics and strips punctuation', () => {
    expect(normTitle('Amélie')).toBe('amelie');
    expect(normTitle('Amelie')).toBe('amelie');
    expect(normTitle('Y Tu Mamá También')).toBe('ytumamatambien');
    expect(normTitle('Spider-Man')).toBe('spiderman');
    expect(normTitle("Ferris Bueller's Day Off")).toBe('ferrisbuellersdayoff');
  });
  it('tokenizes on any non-alphanumeric boundary', () => {
    expect(titleTokens('Mad Max: Fury Road')).toEqual(['mad', 'max', 'fury', 'road']);
    expect(titleTokens('WALL·E')).toEqual(['wall', 'e']);
  });
  it('isTokenWindow finds contiguous whole-token runs only', () => {
    expect(isTokenWindow(['mad', 'max'], ['mad', 'max', 'fury', 'road'])).toBe(true);
    expect(isTokenWindow(['fury', 'road'], ['mad', 'max', 'fury', 'road'])).toBe(true);
    expect(isTokenWindow(['ring'], ['ringer'])).toBe(false);
  });
});

describe('titleMatches — accepts genuine variants', () => {
  it('exact, case, punctuation, spacing insensitive', () => {
    expect(titleMatches('the godfather', 'The Godfather')).toBe(true);
    expect(titleMatches('Spiderman', 'Spider-Man')).toBe(true);
    expect(titleMatches('Catch 22', 'Catch-22')).toBe(true);
    expect(titleMatches('Wall E', 'WALL·E')).toBe(true);
  });
  it('diacritic-insensitive both directions (international titles)', () => {
    expect(titleMatches('Amelie', 'Amélie')).toBe(true);
    expect(titleMatches('Amélie', 'Amelie')).toBe(true);
    expect(titleMatches('Y Tu Mama Tambien', 'Y Tu Mamá También')).toBe(true);
  });
  it('boundary-aware subtitle prefixes/suffixes', () => {
    expect(titleMatches('Mad Max', 'Mad Max: Fury Road')).toBe(true);
    expect(titleMatches('Fury Road', 'Mad Max: Fury Road')).toBe(true);
    expect(titleMatches('Star Wars', 'Star Wars: The Force Awakens')).toBe(true);
  });
});

describe('titleMatches — rejects dangerous mid-word false positives', () => {
  // These are the regressions the raw-substring matcher produced.
  it('does NOT match a query that is only a mid-word substring', () => {
    expect(titleMatches('Saw', 'Warsaw')).toBe(false);
    expect(titleMatches('Ted', 'Wanted')).toBe(false);
    expect(titleMatches('Her', 'The Butcher')).toBe(false);
    expect(titleMatches('The Ring', 'The Ringer')).toBe(false);
    expect(titleMatches('Cars', 'Carsington Water')).toBe(false);
  });
  it('abstains on sub-3-char normalized queries (cannot resolve by title alone)', () => {
    expect(titleMatches('Up', 'Up')).toBe(false);
    expect(titleMatches('It', 'It')).toBe(false);
  });
  it('still matches a real leading-token title even when longer titles exist', () => {
    // "Alien" is a whole leading token of "Alien Nation" (prod disambiguates via
    // TMDB relevance ordering); this is an accepted, non-dangerous match.
    expect(titleMatches('Alien', 'Alien Nation')).toBe(true);
    expect(titleMatches('Alien', 'Warsaw Aliens')).toBe(false);
  });
});
