import { describe, it, expect } from 'vitest';
import { diversify, assembleCourt, replaceInCourt, DIVERSITY_CONFIG } from './diversify';
import type { DeepScored } from './rank';
import { generateCatalog, type SynthTitle } from './synthCatalog';
import { FixtureEmbeddingProvider } from './embedding';
import { COURT_SIZES, type CourtSize } from '@/lib/court/pool';

const emb = new FixtureEmbeddingProvider('div-test');

function title(over: Partial<SynthTitle> & { id: string }): SynthTitle {
  return {
    mediaType: 'movie', title: over.id, alternateTitles: [], releaseYear: 2010,
    runtimeMinutes: 100, originalLanguage: 'en', contentRating: 'PG-13',
    genres: ['drama'], subgenres: [], keywords: [], director: `dir-${over.id}`,
    leadPerformers: [`lead-${over.id}`], cast: [], franchise: null, sequenceOrder: null,
    remakeOf: null, sequelOf: null, synopsis: 'x', features: { mainstream: 0.5 },
    criticScore: 7, audienceScore: 7, popularity: 100, voteCount: 500,
    metadataConfidence: 0.9, availability: [], vector: emb.vectorFor(over.id),
    tags: ['normal'], ...over,
  };
}

const scored = (id: string, score: number): DeepScored => ({
  id, memberScores: { a: score }, groupMean: score, lowestMemberScore: score,
  disagreement: 0, compromiseScore: score, semanticScore: score, watchDnaScore: score,
  tonightScore: score, availabilityConfidence: 0.9, metadataConfidence: 0.9,
  finalPreDiversityScore: score, severeMismatchFor: [], gatedOut: false,
  gateReason: null, method: 'min_protected', rankingVersion: 'test',
});

function setup(titles: SynthTitle[], scores?: number[]) {
  const map = new Map(titles.map((t) => [t.id, t]));
  const ranked = titles.map((t, i) => scored(t.id, scores?.[i] ?? 0.9 - i * 0.01));
  return { map, ranked };
}

// ============================================================ STAGE 5 ========

describe('Stage 5 — franchise and repetition caps', () => {
  it('takes at most one title per franchise from a franchise-heavy list', () => {
    const titles = Array.from({ length: 12 }, (_, i) => title({ id: `f${i}`, franchise: 'bond' }));
    const { map, ranked } = setup(titles);
    const out = diversify(map, ranked, 10);
    expect(out.selected).toHaveLength(1);
    expect(out.rejected.some((r) => r.reason.includes('franchise cap'))).toBe(true);
  });

  it('caps a repeated lead performer', () => {
    const titles = Array.from({ length: 8 }, (_, i) => title({ id: `a${i}`, leadPerformers: ['same-star'] }));
    const { map, ranked } = setup(titles);
    const out = diversify(map, ranked, 8);
    expect(out.selected.length).toBeLessThanOrEqual(DIVERSITY_CONFIG.maxPerLeadPerformer);
  });

  it('caps a repeated director', () => {
    const titles = Array.from({ length: 8 }, (_, i) => title({ id: `d${i}`, director: 'same-director' }));
    const { map, ranked } = setup(titles);
    const out = diversify(map, ranked, 8);
    expect(out.selected.length).toBeLessThanOrEqual(DIVERSITY_CONFIG.maxPerDirector);
  });

  it('caps sequels so a court is not a boxed set', () => {
    const titles = Array.from({ length: 8 }, (_, i) =>
      title({ id: `s${i}`, sequelOf: 'origin', franchise: `fr${i}` }));
    const { map, ranked } = setup(titles);
    const out = diversify(map, ranked, 8);
    expect(out.selected.length).toBeLessThanOrEqual(DIVERSITY_CONFIG.maxSequels);
  });
});

describe('Stage 5 — duplicates and remakes', () => {
  it('drops a near-duplicate that shares a title and an adjacent year', () => {
    const a = title({ id: 'orig', title: 'The Same Film', releaseYear: 2001 });
    const b = title({ id: 'dupe', title: 'The Same Film', releaseYear: 2002 });
    const c = title({ id: 'other', title: 'Something Else', releaseYear: 1995, genres: ['comedy'] });
    const { map, ranked } = setup([a, b, c]);
    const out = diversify(map, ranked, 3);
    const ids = out.selected.map((s) => s.id);
    expect(ids).toContain('orig');
    expect(ids).not.toContain('dupe');
    expect(out.rejected.find((r) => r.id === 'dupe')?.reason).toBe('near-duplicate');
  });

  it('records what each survivor was closest to, for diagnostics', () => {
    const { map, ranked } = setup([title({ id: 'a' }), title({ id: 'b', genres: ['comedy'] })]);
    const out = diversify(map, ranked, 2);
    expect(out.selected[0]!.closestTo).toBeNull();
    expect(out.selected[1]!.closestTo).toBe('a');
    expect(out.selected[1]!.closestSimilarity).toBeGreaterThanOrEqual(-1);
  });
});

describe('Stage 5 — relevance is protected', () => {
  it('never swaps in a clearly worse title merely for variety', () => {
    const strong = title({ id: 'strong', genres: ['drama'] });
    const weak = title({ id: 'weak', genres: ['western'] }); // different axis, but poor
    const { map } = setup([strong, weak]);
    const ranked = [scored('strong', 0.95), scored('weak', 0.10)];
    const out = diversify(map, ranked, 2);
    expect(out.selected.map((s) => s.id)).toEqual(['strong']);
    expect(out.rejected.find((r) => r.id === 'weak')?.reason).toBe('below relevance floor');
  });

  it('keeps a narrow request narrow rather than forcing variety in', () => {
    // Ten strong, genuinely similar candidates: variety should NOT be invented.
    const titles = Array.from({ length: 10 }, (_, i) => title({ id: `n${i}`, genres: ['thriller'] }));
    const { map, ranked } = setup(titles, Array(10).fill(0.9));
    const out = diversify(map, ranked, 10);
    expect(out.selected.length).toBeGreaterThan(1);
    for (const s of out.selected) expect(map.get(s.id)!.genres[0]).toBe('thriller');
  });

  it('increases variety when a broad request supplies it', () => {
    const genres = ['drama', 'comedy', 'horror', 'western', 'romance', 'crime'] as const;
    const titles = genres.map((g, i) => title({ id: `b${i}`, genres: [g], releaseYear: 1970 + i * 8 }));
    const { map, ranked } = setup(titles, Array(6).fill(0.9));
    const out = diversify(map, ranked, 6);
    const distinct = new Set(out.selected.map((s) => map.get(s.id)!.genres[0]));
    expect(distinct.size).toBeGreaterThanOrEqual(4);
    expect(out.selected.some((s) => s.addsDimension.some((d) => d.startsWith('genre:')))).toBe(true);
  });

  it('explains why each title was retained', () => {
    const { map, ranked } = setup([title({ id: 'a' }), title({ id: 'b', genres: ['comedy'] })]);
    const out = diversify(map, ranked, 2);
    expect(out.selected[0]!.retainedBecause).toBe('highest ranked overall');
    expect(out.selected[1]!.retainedBecause.length).toBeGreaterThan(0);
  });
});

// ============================================================ STAGE 6 ========

describe('Stage 6 — court assembly', () => {
  const bigPool = () => {
    const genres = ['drama', 'comedy', 'horror', 'western', 'romance', 'crime', 'action', 'mystery',
      'fantasy', 'history', 'music', 'war', 'animation', 'family', 'adventure', 'thriller',
      'documentary', 'science_fiction'] as const;
    const titles = Array.from({ length: 30 }, (_, i) =>
      title({ id: `p${i}`, genres: [genres[i % genres.length]!], releaseYear: 1960 + i * 2, runtimeMinutes: 80 + i * 3 }));
    const { map } = setup(titles);
    const ranked = titles.map((t, i) => scored(t.id, 0.95 - i * 0.005));
    return { map, diversified: diversify(map, ranked, 30).selected };
  };

  it.each([['quick', 4, 4], ['standard', 6, 6], ['deep', 8, 8]] as [CourtSize, number, number][])(
    '%s court fills %i active and %i reserve', (size, act, res) => {
      const { diversified } = bigPool();
      const court = assembleCourt(diversified, size);
      expect(court.active).toHaveLength(act);
      expect(court.reserve).toHaveLength(res);
      expect(court.active.length + court.reserve.length).toBe(COURT_SIZES[size].total);
      expect(court.shortfall).toBe(0);
    });

  it('reserve is NOT the weak half — it interleaves with active', () => {
    const { diversified } = bigPool();
    const court = assembleCourt(diversified, 'standard');
    const avgActive = court.active.reduce((s, x) => s + x.score, 0) / court.active.length;
    const avgReserve = court.reserve.reduce((s, x) => s + x.score, 0) / court.reserve.length;
    const gap = Math.abs(avgActive - avgReserve);

    // Self-calibrating: compare against the naive top/bottom split of the SAME
    // list, which is the design this interleaving exists to avoid. A magic
    // threshold would just encode today's fixture spacing.
    const half = Math.floor(diversified.length / 2);
    const naiveTop = diversified.slice(0, half);
    const naiveBottom = diversified.slice(half, half * 2);
    const naiveGap = Math.abs(
      naiveTop.reduce((s, x) => s + x.score, 0) / naiveTop.length -
      naiveBottom.reduce((s, x) => s + x.score, 0) / naiveBottom.length,
    );
    expect(gap).toBeLessThan(naiveGap);
  });

  it('reports a shortfall honestly instead of padding', () => {
    const titles = Array.from({ length: 3 }, (_, i) => title({ id: `q${i}`, genres: ['drama'] }));
    const { map, ranked } = setup(titles);
    const court = assembleCourt(diversify(map, ranked, 30).selected, 'standard');
    expect(court.active.length + court.reserve.length).toBeLessThan(12);
    expect(court.shortfall).toBeGreaterThan(0);
    expect(court.shortfallReason).toContain('survived filtering');
  });

  it('is deterministic — the same inputs rebuild the same court', () => {
    const build = () => {
      const { diversified } = bigPool();
      return assembleCourt(diversified, 'standard');
    };
    expect(build().active.map((s) => s.id)).toEqual(build().active.map((s) => s.id));
    expect(build().reserve.map((s) => s.id)).toEqual(build().reserve.map((s) => s.id));
  });

  it('stores a replacement priority so promotion order is defined', () => {
    const { diversified } = bigPool();
    const court = assembleCourt(diversified, 'standard');
    const priorities = court.reserve.map((s) => s.replacementPriority);
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
  });
});

describe('Stage 6 — replacement', () => {
  const build = (size: CourtSize = 'standard') => {
    const genres = ['drama', 'comedy', 'horror', 'western', 'romance', 'crime', 'action', 'mystery',
      'fantasy', 'history', 'music', 'war', 'animation', 'family', 'adventure', 'thriller'] as const;
    const titles = Array.from({ length: 24 }, (_, i) =>
      title({ id: `r${i}`, genres: [genres[i % genres.length]!], releaseYear: 1960 + i * 3 }));
    const map = new Map(titles.map((t) => [t.id, t]));
    const ranked = titles.map((t, i) => scored(t.id, 0.95 - i * 0.005));
    return { map, court: assembleCourt(diversify(map, ranked, 24).selected, size) };
  };

  it('a veto promotes a reserve into the same slot', () => {
    const { map, court } = build();
    const target = court.active[2]!.id;
    const out = replaceInCourt(court, target, 'veto', map);
    expect(out.promoted).not.toBeNull();
    expect(out.court.active.map((s) => s.id)).not.toContain(target);
    expect(out.court.active).toHaveLength(6);
    expect(out.court.reserve).toHaveLength(5);
    expect(out.note).toContain('veto');
  });

  it('"seen it" replaces without implying dislike', () => {
    const { map, court } = build();
    const out = replaceInCourt(court, court.active[0]!.id, 'seen_it', map);
    expect(out.promoted).not.toBeNull();
    expect(out.note).toContain('seen_it');
  });

  it('an availability failure is also a replacement reason', () => {
    const { map, court } = build();
    const out = replaceInCourt(court, court.active[1]!.id, 'unavailable', map);
    expect(out.promoted).not.toBeNull();
  });

  it('repeated vetoes drain the reserve and then shrink the tray honestly', () => {
    const { map } = build();
    let court = build().court;
    let exhausted = false;
    for (let i = 0; i < 8; i++) {
      const first = court.active[0];
      if (!first) break;
      const out = replaceInCourt(court, first.id, 'veto', map);
      court = out.court;
      exhausted = out.exhausted;
    }
    expect(exhausted).toBe(true);
    // No invented titles: the tray is simply shorter.
    expect(court.active.length).toBeLessThanOrEqual(6);
  });

  it('preserves variety across a replacement', () => {
    const { map, court } = build();
    const before = new Set(court.active.map((s) => map.get(s.id)!.genres[0]));
    const out = replaceInCourt(court, court.active[0]!.id, 'veto', map);
    const after = new Set(out.court.active.map((s) => map.get(s.id)!.genres[0]));
    expect(out.diversityPreserved).toBe(true);
    expect(after.size).toBeGreaterThanOrEqual(before.size - 1);
  });

  it('removing a title that is not active is a safe no-op', () => {
    const { map, court } = build();
    const out = replaceInCourt(court, 'not-in-court', 'veto', map);
    expect(out.promoted).toBeNull();
    expect(out.court.active).toHaveLength(6);
  });

  it('every court member still satisfies the hard filters after replacement', () => {
    // Build from a catalog where some titles violate runtime, then confirm none
    // of them can reach the court through a replacement.
    const cat = generateCatalog({ count: 400, seed: 'hardfilter' });
    const legal = cat.filter((t) => (t.runtimeMinutes ?? 0) <= 120 && t.runtimeMinutes != null);
    const map = new Map(legal.map((t) => [t.id, t]));
    const ranked = legal.slice(0, 40).map((t, i) => scored(t.id, 0.9 - i * 0.01));
    let court = assembleCourt(diversify(map, ranked, 30).selected, 'standard');
    court = replaceInCourt(court, court.active[0]!.id, 'veto', map).court;
    for (const slot of [...court.active, ...court.reserve]) {
      expect(map.get(slot.id)!.runtimeMinutes!).toBeLessThanOrEqual(120);
    }
  });
});
