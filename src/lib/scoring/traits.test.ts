import { describe, it, expect } from 'vitest';
import type { TitleMetadata } from '@/lib/types';
import { detectTrait } from './traits';
import { normalizeRule } from './preferences';

function meta(o: Partial<TitleMetadata> = {}): TitleMetadata {
  return {
    id: 1, mediaType: 'movie', title: 'X', year: 2020, overview: '',
    genres: [], keywords: [], posterPath: null, backdropPath: null,
    runtimeMinutes: 100, episodeRuntimeMinutes: null, numberOfSeasons: null,
    numberOfEpisodes: null, status: 'Released', contentRating: null,
    voteAverage: 7, voteCount: 100, popularity: 10, trailerUrl: null,
    originalLanguage: 'en', spokenLanguages: ['English'],
    originCountries: ['US'], imdbId: null, imdbRating: null,
    rottenTomatoes: null, metascore: null, episodesAired: null,
    episodesTotal: null, nextEpisodeDate: null, englishAvailability: 'native', ...o,
  };
}

describe('trait detection: defining vs secondary', () => {
  it('primary genre is defining', () => {
    const s = detectTrait('science_fiction', meta({ genres: ['Science Fiction', 'Drama'] }));
    expect(s.present).toBe(true);
    expect(s.defining).toBe(true);
  });

  it('single secondary keyword is present but NOT defining', () => {
    const s = detectTrait('science_fiction', meta({ genres: ['Drama'], keywords: ['artificial intelligence'] }));
    expect(s.present).toBe(true);
    expect(s.defining).toBe(false);
  });

  it('two keywords make a trait defining even without the genre', () => {
    const s = detectTrait('science_fiction', meta({ genres: ['Drama'], keywords: ['alien', 'spaceship'] }));
    expect(s.defining).toBe(true);
  });

  it('noir keyword is always defining', () => {
    const s = detectTrait('noir', meta({ genres: ['Crime'], keywords: ['film noir'] }));
    expect(s.defining).toBe(true);
  });

  it('slow burn is structural for long dramas with no fast genres', () => {
    const s = detectTrait('slow_burn', meta({ genres: ['Drama'], runtimeMinutes: 165 }));
    expect(s.defining).toBe(true);
    const s2 = detectTrait('slow_burn', meta({ genres: ['Drama', 'Thriller'], runtimeMinutes: 165 }));
    expect(s2.defining).toBe(false); // has a fast genre
  });

  it('franchise favorite only fires when the collection is in the liked set', () => {
    const hit = detectTrait('franchise_favorite', meta(), { collectionId: 42, likedFranchiseIds: [42] });
    expect(hit.defining).toBe(true);
    const miss = detectTrait('franchise_favorite', meta(), { collectionId: 42, likedFranchiseIds: [7] });
    expect(miss.present).toBe(false);
  });
});

describe('rule normalization', () => {
  it('clamps weights into [-40, 40]', () => {
    expect(normalizeRule({ trait: 'noir', weight: -999, requiresDefining: true })!.weight).toBe(-40);
    expect(normalizeRule({ trait: 'grounded_crime', weight: 999, requiresDefining: false })!.weight).toBe(40);
  });
  it('rejects a rule with no trait', () => {
    expect(normalizeRule({ weight: 5 })).toBeNull();
  });
});
