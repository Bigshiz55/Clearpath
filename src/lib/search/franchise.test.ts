import { describe, it, expect } from 'vitest';
import { franchiseAssessment, canonicalKey, type SeedTitle } from './titleDna';
import { rankSeedSimilar } from './seedSimilarity';

const seed = (o: Partial<SeedTitle> & { title: string }): SeedTitle => ({
  canonicalId: canonicalKey({ title: o.title, year: o.year ?? 2000, mediaType: o.mediaType ?? 'movie' }),
  tmdbId: 1, year: 2000, mediaType: 'movie', genres: [], keywords: [], dims: {}, collectionId: null, ...o,
});

describe('franchise identity', () => {
  const rocky = seed({ title: 'Rocky', year: 1976, tmdbId: 1366, collectionId: 1575 });

  it('same tmdb id → same_canonical (known)', () => {
    expect(franchiseAssessment(rocky, seed({ title: 'Rocky', year: 1976, tmdbId: 1366, collectionId: 1575 })))
      .toEqual({ relation: 'same_canonical', identity: 'known' });
  });
  it('same work, different tmdb id → canonical_duplicate (known)', () => {
    expect(franchiseAssessment(rocky, seed({ title: 'Rocky', year: 1976, tmdbId: 999, collectionId: 1575 })))
      .toEqual({ relation: 'canonical_duplicate', identity: 'known' });
  });
  it('same collection id → franchise (known)', () => {
    expect(franchiseAssessment(rocky, seed({ title: 'Rocky II', year: 1979, tmdbId: 1367, collectionId: 1575 })))
      .toEqual({ relation: 'franchise', identity: 'known' });
  });
  it('different collection ids → similar (known, NOT franchise)', () => {
    expect(franchiseAssessment(rocky, seed({ title: 'The Fighter', year: 2010, tmdbId: 45317, collectionId: 99 })))
      .toEqual({ relation: 'similar', identity: 'known' });
  });
  it('missing collection id + shared title prefix → franchise INFERRED (low confidence)', () => {
    const rockyNoCol = seed({ title: 'Rocky', year: 1976, tmdbId: 1366, collectionId: null, genres: ['Drama', 'Sport'], keywords: ['boxing', 'underdog'], dims: { realism: 88 } });
    expect(franchiseAssessment(rockyNoCol, seed({ title: 'Rocky II', year: 1979, tmdbId: 1367, collectionId: null })))
      .toEqual({ relation: 'franchise', identity: 'inferred' });
  });
  it('similar NAME but unrelated (no collection) → unknown, and does NOT filter', () => {
    // "The Meg" vs "The Mechanic" share no distinctive prefix → unknown.
    const a = franchiseAssessment(seed({ title: 'The Meg', collectionId: null }), seed({ title: 'The Mechanic', collectionId: null }));
    expect(a.relation).toBe('unknown');
  });

  it('inferred franchise is NOT hard-excluded by "no sequels" (identity must be known to filter)', () => {
    const rockyNoCol = seed({ title: 'Rocky', year: 1976, tmdbId: 1366, collectionId: null, genres: ['Drama', 'Sport'], keywords: ['boxing', 'underdog'], dims: { realism: 88 } });
    const rockyII = { ...seed({ title: 'Rocky II', year: 1979, tmdbId: 1367, collectionId: null, genres: ['Drama', 'Sport'], keywords: ['boxing', 'underdog'], dims: { realism: 85 } }), personalScore: 70 };
    const out = rankSeedSimilar(rockyNoCol, [rockyII], { requestedCount: 5, excludeFranchise: true });
    // inferred-only franchise cannot trigger the exclusion → it still qualifies.
    expect(out.items.map((i) => i.title)).toContain('Rocky II');
    expect(out.traces.find((t) => t.candidateTitle === 'Rocky II')?.identitySource).toBe('inferred');
  });

  it('known franchise IS capped to 1 in the default top slice', () => {
    const s = seed({ title: 'Rocky', year: 1976, tmdbId: 1366, collectionId: 1575, genres: ['Drama', 'Sport'], keywords: ['boxing'] });
    const fr = (title: string, id: number, ps: number) => ({ ...seed({ title, year: 1980, tmdbId: id, collectionId: 1575, genres: ['Drama', 'Sport'], keywords: ['boxing', 'underdog'], dims: { realism: 85 } }), personalScore: ps });
    const out = rankSeedSimilar(s, [fr('Rocky II', 1367, 90), fr('Rocky III', 1368, 88)], { requestedCount: 5 });
    const franchiseInTop5 = out.items.filter((i) => ['Rocky II', 'Rocky III'].includes(i.title)).length;
    expect(franchiseInTop5).toBeLessThanOrEqual(1);
  });
});
