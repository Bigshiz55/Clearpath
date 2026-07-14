import { describe, it, expect } from 'vitest';
import type { TitleMetadata, ScoreAdjustment, PreferenceTrait } from '@/lib/types';
import { buildVerdict, tierFromScore, dispositionFromScore } from './verdict';
import { SCOTT_RULES } from './preferences';
import type { PersonalContext } from './personal';

function makeTitle(overrides: Partial<TitleMetadata> = {}): TitleMetadata {
  return {
    id: 1,
    mediaType: 'movie',
    title: 'Test Title',
    year: 2020,
    overview: 'A test overview that is reasonably descriptive for scoring.',
    genres: [],
    keywords: [],
    posterPath: null,
    backdropPath: null,
    runtimeMinutes: 110,
    episodeRuntimeMinutes: null,
    numberOfSeasons: null,
    numberOfEpisodes: null,
    status: 'Released',
    contentRating: null,
    voteAverage: 7.0,
    voteCount: 1500,
    popularity: 40,
    trailerUrl: null,
    originalLanguage: 'en',
    spokenLanguages: ['English'],
    originCountries: ['US'],
    imdbId: null,
    imdbRating: null,
    rottenTomatoes: null,
    metascore: null,
    ...overrides,
  };
}

function scottCtx(extra: Partial<PersonalContext> = {}): PersonalContext {
  return {
    label: 'Scott Match',
    rules: SCOTT_RULES,
    likedFranchiseIds: [],
    collectionId: null,
    ...extra,
  };
}

const byTrait = (adjustments: ScoreAdjustment[], trait: PreferenceTrait) =>
  adjustments.find((a) => a.trait === trait);

describe('WatchVerdict scoring engine', () => {
  it('1. highly rated supernatural horror gets a strong Scott penalty', () => {
    const meta = makeTitle({
      genres: ['Horror'],
      keywords: ['supernatural', 'haunting', 'ghost'],
      voteAverage: 8.2,
      voteCount: 6000,
    });
    const r = buildVerdict({ meta, providers: null, personal: scottCtx() });
    const adj = byTrait(r.personal.adjustments, 'supernatural');
    expect(adj).toBeDefined();
    expect(adj!.points).toBe(-20);
    expect(adj!.defining).toBe(true);
    // General score is high; personal is dragged well below it.
    expect(r.general.score).toBeGreaterThanOrEqual(70);
    expect(r.personal.score).toBeLessThanOrEqual(r.general.score - 20);
  });

  it('2. grounded crime thriller gets a strong positive match', () => {
    const meta = makeTitle({
      genres: ['Crime', 'Drama', 'Thriller'],
      keywords: ['detective', 'investigation', 'homicide'],
      voteAverage: 8.0,
      voteCount: 4000,
    });
    const r = buildVerdict({ meta, providers: null, personal: scottCtx() });
    const positives = r.personal.adjustments.filter((a) => a.points > 0);
    expect(positives.length).toBeGreaterThan(0);
    expect(byTrait(r.personal.adjustments, 'grounded_crime')).toBeDefined();
    expect(r.personal.score).toBeGreaterThanOrEqual(r.general.score);
    // No supernatural/scifi/fantasy penalties should be present.
    expect(byTrait(r.personal.adjustments, 'supernatural')).toBeUndefined();
  });

  it('3. a minor sci-fi keyword does NOT trigger the full penalty', () => {
    const meta = makeTitle({
      genres: ['Drama', 'Thriller'],
      keywords: ['artificial intelligence'], // single secondary sci-fi tag, no SF genre
      voteAverage: 7.5,
      voteCount: 2000,
    });
    const r = buildVerdict({ meta, providers: null, personal: scottCtx() });
    expect(byTrait(r.personal.adjustments, 'science_fiction')).toBeUndefined();
  });

  it('3b. science fiction as a PRIMARY genre DOES trigger the full penalty', () => {
    const meta = makeTitle({
      genres: ['Science Fiction', 'Action'],
      keywords: [],
      voteAverage: 8.0,
      voteCount: 5000,
    });
    const r = buildVerdict({ meta, providers: null, personal: scottCtx() });
    const adj = byTrait(r.personal.adjustments, 'science_fiction');
    expect(adj).toBeDefined();
    expect(adj!.points).toBe(-20);
  });

  it('4. a major Noir film receives the full Noir penalty', () => {
    const meta = makeTitle({
      genres: ['Crime', 'Drama'],
      keywords: ['film noir'],
      voteAverage: 8.1,
      voteCount: 3000,
    });
    const r = buildVerdict({ meta, providers: null, personal: scottCtx() });
    const adj = byTrait(r.personal.adjustments, 'noir');
    expect(adj).toBeDefined();
    expect(adj!.points).toBe(-20);
  });

  it('5. slow burn penalty fires only when slow pacing is defining', () => {
    const slow = makeTitle({
      genres: ['Drama'],
      keywords: ['meditative'],
      runtimeMinutes: 150,
    });
    const rSlow = buildVerdict({ meta: slow, providers: null, personal: scottCtx() });
    expect(byTrait(rSlow.personal.adjustments, 'slow_burn')).toBeDefined();
    expect(byTrait(rSlow.personal.adjustments, 'slow_burn')!.points).toBe(-20);

    const notSlow = makeTitle({
      genres: ['Drama'],
      keywords: ['family'],
      runtimeMinutes: 105,
    });
    const rFast = buildVerdict({ meta: notSlow, providers: null, personal: scottCtx() });
    expect(byTrait(rFast.personal.adjustments, 'slow_burn')).toBeUndefined();
  });

  it('6. an Enola Holmes-style sequel gets franchise + detective boosts', () => {
    const meta = makeTitle({
      genres: ['Adventure', 'Mystery', 'Crime'],
      keywords: ['detective', 'sherlock holmes', 'sister'],
      voteAverage: 6.8,
      voteCount: 3500,
    });
    const r = buildVerdict({
      meta,
      providers: null,
      personal: scottCtx({ collectionId: 760161, likedFranchiseIds: [760161] }),
    });
    expect(byTrait(r.personal.adjustments, 'detective_mystery')).toBeDefined();
    expect(byTrait(r.personal.adjustments, 'franchise_favorite')).toBeDefined();
    expect(r.personal.score).toBeGreaterThan(r.general.score);
  });

  it('7. a cheesy grounded Lifetime thriller gets a modest positive boost', () => {
    const meta = makeTitle({
      genres: ['Thriller', 'Drama'],
      keywords: ['stalker', 'obsession'],
      voteAverage: 5.6,
      voteCount: 220,
    });
    const r = buildVerdict({ meta, providers: null, personal: scottCtx() });
    const adj = byTrait(r.personal.adjustments, 'domestic_thriller');
    expect(adj).toBeDefined();
    expect(adj!.points).toBeGreaterThan(0);
    const delta = r.personal.score - r.personal.baseScore;
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(24); // modest, not extreme
    expect(byTrait(r.personal.adjustments, 'supernatural')).toBeUndefined();
  });
});

describe('score clamping and tiers', () => {
  it('clamps personal score to 0..100 even with stacked penalties', () => {
    const meta = makeTitle({
      genres: ['Science Fiction', 'Fantasy'],
      keywords: ['supernatural', 'ghost', 'magic', 'dragon', 'film noir', 'meditative'],
      voteAverage: 2.0,
      voteCount: 50,
      runtimeMinutes: 200,
    });
    const r = buildVerdict({ meta, providers: null, personal: scottCtx() });
    expect(r.personal.score).toBeGreaterThanOrEqual(0);
    expect(r.personal.score).toBeLessThanOrEqual(100);
    expect(r.general.score).toBeGreaterThanOrEqual(0);
    expect(r.general.score).toBeLessThanOrEqual(100);
  });

  it('clamps personal score at 100 with stacked boosts', () => {
    const meta = makeTitle({
      genres: ['Crime', 'Drama', 'Mystery', 'Thriller'],
      keywords: ['detective', 'serial killer', 'psychological thriller', 'stalker', 'investigation'],
      voteAverage: 9.5,
      voteCount: 20000,
      popularity: 400,
    });
    const r = buildVerdict({
      meta,
      providers: null,
      personal: scottCtx({ collectionId: 1, likedFranchiseIds: [1] }),
    });
    expect(r.personal.score).toBeLessThanOrEqual(100);
  });

  it('maps scores to the correct verdict tiers', () => {
    expect(tierFromScore(90)).toBe('Must Watch');
    expect(tierFromScore(78)).toBe('Strong Watch');
    expect(tierFromScore(66)).toBe('Worth Watching');
    expect(tierFromScore(55)).toBe('Possible Watch');
    expect(tierFromScore(40)).toBe('Low Priority');
    expect(tierFromScore(20)).toBe('Skip');
  });

  it('maps scores to the correct watchlist dispositions', () => {
    expect(dispositionFromScore(80)).toBe('Strict Watchlist');
    expect(dispositionFromScore(60)).toBe('Possible Watchlist');
    expect(dispositionFromScore(30)).toBe('Skip');
  });
});

describe('primary call (WATCH IT / MAYBE / SKIP IT)', () => {
  it('maps a strong personal match to WATCH IT', () => {
    const meta = makeTitle({
      genres: ['Crime', 'Drama', 'Thriller'],
      keywords: ['detective', 'serial killer', 'investigation'],
      voteAverage: 8.6, voteCount: 8000,
    });
    const r = buildVerdict({ meta, providers: null, personal: scottCtx() });
    expect(r.primaryCall).toBe('WATCH IT');
  });

  it('maps a defining-supernatural title to SKIP IT for Scott', () => {
    const meta = makeTitle({
      genres: ['Horror'],
      keywords: ['supernatural', 'ghost', 'haunting'],
      voteAverage: 5.5, voteCount: 800,
    });
    const r = buildVerdict({ meta, providers: null, personal: scottCtx() });
    expect(r.primaryCall).toBe('SKIP IT');
  });
});

describe('critic ratings (OMDb) integration', () => {
  it('surfaces IMDb / Rotten Tomatoes / Metacritic as rating sources when present', () => {
    const meta = makeTitle({
      genres: ['Crime', 'Drama'],
      voteAverage: 8.0, voteCount: 5000,
      imdbRating: 8.6, rottenTomatoes: 91, metascore: 88,
    });
    const r = buildVerdict({ meta, providers: null, personal: scottCtx() });
    const names = r.general.sources.filter((s) => s.available).map((s) => s.name);
    expect(names).toContain('IMDb');
    expect(names).toContain('Rotten Tomatoes');
    expect(names).toContain('Metacritic');
  });

  it('works honestly when no critic data is available (no fabricated sources)', () => {
    const meta = makeTitle({ voteAverage: 7.0, voteCount: 1000 });
    const r = buildVerdict({ meta, providers: null, personal: scottCtx() });
    const critics = r.general.sources.filter((s) => s.available && s.name !== 'TMDB Audience');
    expect(critics.length).toBe(0);
  });
});

describe('per-user independence', () => {
  it('another user with their own label gets their own personal score', () => {
    const meta = makeTitle({
      genres: ['Science Fiction'],
      keywords: ['space', 'alien'],
      voteAverage: 8.5,
      voteCount: 9000,
    });
    // A sci-fi lover: no penalty, small boost.
    const dana = buildVerdict({
      meta,
      providers: null,
      personal: { label: 'Dana Match', rules: [], likedFranchiseIds: [], collectionId: null },
    });
    const scott = buildVerdict({ meta, providers: null, personal: scottCtx() });
    expect(dana.personal.label).toBe('Dana Match');
    expect(scott.personal.label).toBe('Scott Match');
    // Scott is penalized for defining sci-fi; Dana is not.
    expect(scott.personal.score).toBeLessThan(dana.personal.score);
    expect(byTrait(scott.personal.adjustments, 'science_fiction')).toBeDefined();
    expect(dana.personal.adjustments.length).toBe(0);
  });
});
