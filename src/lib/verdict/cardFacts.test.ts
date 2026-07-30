import { describe, it, expect } from 'vitest';
import { buildCardFacts, formatRuntime, MAX_GENRES, MAX_PRIMARY } from './cardFacts';

describe('runtime reads like a runtime', () => {
  it('formats hours and minutes the way a listing does', () => {
    expect(formatRuntime(105)).toBe('1h 45m');
    expect(formatRuntime(48)).toBe('48m');
    expect(formatRuntime(120)).toBe('2h');
  });

  it('never invents a length it does not have', () => {
    for (const v of [null, undefined, 0, -30, Number.NaN]) {
      expect(formatRuntime(v as number | null), String(v)).toBeNull();
    }
  });
});

describe('a film', () => {
  it('says how long it is and who it is for', () => {
    const f = buildCardFacts({ mediaType: 'movie', runtimeMinutes: 105, contentRating: 'PG-13', genres: ['Crime', 'Thriller'] });
    expect(f.primary).toEqual(['1h 45m', 'PG-13']);
    expect(f.genres).toEqual(['Crime', 'Thriller']);
    expect(f.empty).toBe(false);
  });

  it('just gets shorter when TMDB has no certificate', () => {
    const f = buildCardFacts({ mediaType: 'movie', runtimeMinutes: 105, contentRating: null });
    expect(f.primary).toEqual(['1h 45m']);
  });
});

describe('a series', () => {
  it('answers the question a series raises — how much of it there is', () => {
    const f = buildCardFacts({ mediaType: 'tv', seasons: 3, episodes: 24, episodeRuntimeMinutes: 45, contentRating: 'TV-MA' });
    expect(f.primary[0]).toBe('3 seasons');
    expect(f.primary[1]).toBe('24 eps');
  });

  it('says "1 season", not "1 seasons"', () => {
    expect(buildCardFacts({ mediaType: 'tv', seasons: 1 }).primary).toEqual(['1 season']);
  });

  it('stops before the line becomes two', () => {
    const f = buildCardFacts({ mediaType: 'tv', seasons: 8, episodes: 200, episodeRuntimeMinutes: 42, contentRating: 'TV-14' });
    expect(f.primary).toHaveLength(MAX_PRIMARY);
  });

  it('does not print a movie runtime for a show', () => {
    const f = buildCardFacts({ mediaType: 'tv', runtimeMinutes: 105, seasons: 2 });
    expect(f.primary.join(' ')).not.toContain('1h 45m');
  });
});

describe('genres', () => {
  it('keeps a scannable few, in TMDB’s own order', () => {
    const f = buildCardFacts({ genres: ['Crime', 'Thriller', 'Mystery', 'Drama', 'History'] });
    expect(f.genres).toEqual(['Crime', 'Thriller', 'Mystery']);
    expect(f.genres).toHaveLength(MAX_GENRES);
  });

  it('drops blanks rather than printing a stray separator', () => {
    expect(buildCardFacts({ genres: ['', '  ', 'Drama'] }).genres).toEqual(['Drama']);
  });
});

describe('when we hold nothing', () => {
  it('says so, so the card can render nothing rather than an empty line', () => {
    expect(buildCardFacts({}).empty).toBe(true);
    expect(buildCardFacts({ mediaType: 'movie', runtimeMinutes: null, genres: [] }).empty).toBe(true);
  });

  it('survives malformed input without throwing', () => {
    expect(() => buildCardFacts({ mediaType: 'tv', seasons: -1, episodes: 0 })).not.toThrow();
    expect(buildCardFacts({ mediaType: 'tv', seasons: -1, episodes: 0 }).empty).toBe(true);
  });
});
