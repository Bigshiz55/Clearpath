import { describe, it, expect } from 'vitest';
import { qualify, rankSeedSimilar } from './seedSimilarity';
import { canonicalKey, type SeedTitle } from './titleDna';

const ROCKY: SeedTitle = {
  canonicalId: 'rocky-1976', tmdbId: 1366, title: 'Rocky', year: 1976, mediaType: 'movie',
  genres: ['Drama', 'Sport'], keywords: ['boxing', 'underdog', 'training', 'perseverance'],
  dims: { realism: 88, character: 72, emotion: 80, warmth: 74, humor: 24, violence: 55 }, collectionId: 1575,
};
const mk = (over: Partial<SeedTitle> & { title: string; personalScore?: number }): SeedTitle & { personalScore: number } => ({
  canonicalId: canonicalKey({ title: over.title, year: over.year ?? 2000, mediaType: over.mediaType ?? 'movie' }),
  tmdbId: Math.floor(Math.random() * 1e6) + 1, year: 2000, mediaType: 'movie', genres: [], keywords: [], dims: {}, collectionId: null,
  personalScore: over.personalScore ?? 50, ...over,
});

describe('seed-similarity gate', () => {
  it('fails a grounded↔fantastical contradiction even at max personal fit', () => {
    const edward = mk({
      title: 'Edward Scissorhands', year: 1990, genres: ['Fantasy', 'Drama', 'Romance'],
      keywords: ['outsider', 'gothic', 'suburbia'], dims: { realism: 12, character: 70, emotion: 82, romance: 70 }, personalScore: 100,
    });
    const d = qualify(ROCKY, edward);
    expect(d.passed).toBe(false);
    expect(d.reason).toBe('hard_contradiction_grounded_vs_fantastical');
  });

  it('qualifies a genuine sports-drama match (shared defining genre + keywords)', () => {
    const creed = mk({
      title: 'Creed', year: 2015, genres: ['Drama', 'Sport'], keywords: ['boxing', 'underdog', 'training'],
      dims: { realism: 85, character: 74, emotion: 82, warmth: 72, humor: 28, violence: 58 },
    });
    expect(qualify(ROCKY, creed).passed).toBe(true);
  });

  it('rejects a title sharing only a generic genre (no defining anchor)', () => {
    const drama = mk({ title: 'Some Romance', genres: ['Drama', 'Romance'], keywords: ['love'], dims: { realism: 70, romance: 85 } });
    const d = qualify(ROCKY, drama);
    expect(d.passed).toBe(false);
  });

  it('degrades gracefully with no fingerprint — still gates on genre + keywords', () => {
    const creedNoDims = mk({ title: 'Creed', year: 2015, genres: ['Drama', 'Sport'], keywords: ['boxing', 'underdog'], dims: {} });
    const edwardNoDims = mk({ title: 'Edward Scissorhands', year: 1990, genres: ['Fantasy', 'Drama'], keywords: ['gothic'], dims: {} });
    expect(qualify(ROCKY, creedNoDims).passed).toBe(true);
    expect(qualify(ROCKY, edwardNoDims).passed).toBe(false); // no defining shared anchor
  });

  it('excludes the seed by canonical identity even from a different tmdb id', () => {
    const dupSeed = mk({ title: 'Rocky', year: 1976, tmdbId: 999001, genres: ['Drama', 'Sport'], keywords: ['boxing'], personalScore: 95 });
    const good = mk({ title: 'Creed', year: 2015, genres: ['Drama', 'Sport'], keywords: ['boxing', 'underdog'], dims: { realism: 85 }, personalScore: 40 });
    const out = rankSeedSimilar(ROCKY, [dupSeed, good], { requestedCount: 5 });
    expect(out.items.map((i) => i.canonicalId)).not.toContain('rocky-1976');
    expect(out.excludedSeedOrDup).toContain('Rocky');
    expect(out.items.map((i) => i.title)).toContain('Creed');
  });

  it('personalization cannot rescue a failed candidate (fewer results returned)', () => {
    const edward = mk({ title: 'Edward Scissorhands', year: 1990, genres: ['Fantasy', 'Drama'], keywords: ['gothic'], dims: { realism: 12 }, personalScore: 99 });
    const out = rankSeedSimilar(ROCKY, [edward], { requestedCount: 5 });
    expect(out.items).toHaveLength(0); // returned fewer, not padded with the weak match
  });
});
