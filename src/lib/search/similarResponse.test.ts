import { describe, it, expect } from 'vitest';
import { classifySimilar, noCloseMatches, BROADEN_OPTIONS } from './similarResponse';
import { rankSeedSimilar } from './seedSimilarity';
import { canonicalKey, type SeedTitle } from './titleDna';

const ROCKY: SeedTitle = {
  canonicalId: 'rocky-1976', tmdbId: 1366, title: 'Rocky', year: 1976, mediaType: 'movie',
  genres: ['Drama', 'Sport'], keywords: ['boxing', 'underdog', 'training'],
  dims: { realism: 88, character: 72, emotion: 80, violence: 55 }, collectionId: 1575,
};
const mk = (o: Partial<SeedTitle> & { title: string; personalScore: number }) => ({
  canonicalId: canonicalKey({ title: o.title, year: o.year ?? 2000, mediaType: 'movie' }),
  tmdbId: Math.floor(Math.random() * 1e6) + 2, year: 2000, mediaType: 'movie' as const,
  genres: [], keywords: [], dims: {}, collectionId: null, ...o,
});

describe('no-close-matches seam', () => {
  it('classifies a zero-qualified rank output as no_close_matches (never the Finder)', () => {
    const allContradictions = [
      mk({ title: 'Edward Scissorhands', year: 1990, genres: ['Fantasy', 'Drama'], keywords: ['gothic'], dims: { realism: 12 }, personalScore: 99 }),
      mk({ title: 'La La Land', year: 2016, genres: ['Romance', 'Music'], keywords: ['musical'], dims: { realism: 40, romance: 88 }, personalScore: 88 }),
    ];
    const ranked = rankSeedSimilar(ROCKY, allContradictions, { requestedCount: 5 });
    expect(ranked.items).toHaveLength(0);
    const c = classifySimilar('Rocky', null, ranked);
    expect(c.kind).toBe('no_close_matches');
  });

  it('the no-close message does not claim any unrelated title is similar', () => {
    const ranked = rankSeedSimilar(ROCKY, [mk({ title: 'La La Land', year: 2016, genres: ['Music'], keywords: ['musical'], dims: { realism: 40 }, personalScore: 90 })], { requestedCount: 5 });
    const nc = noCloseMatches('Rocky', null, ranked);
    expect(nc.message.toLowerCase()).toContain('no close matches');
    expect(nc.message.toLowerCase()).not.toMatch(/\bsimilar to\b/);
    expect(nc.broadenOptions).toEqual(BROADEN_OPTIONS);
    expect(nc.gateBreakdown).toBeTruthy();
    expect(Object.values(nc.gateBreakdown).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it('classifies a non-empty rank output as similar', () => {
    const ranked = rankSeedSimilar(ROCKY, [mk({ title: 'Creed', year: 2015, genres: ['Drama', 'Sport'], keywords: ['boxing', 'underdog'], dims: { realism: 85 }, personalScore: 60 })], { requestedCount: 5 });
    expect(ranked.items.length).toBeGreaterThan(0);
    expect(classifySimilar('Rocky', null, ranked).kind).toBe('similar');
  });
});
