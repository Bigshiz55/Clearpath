import { describe, it, expect } from 'vitest';
import {
  fastRank, deepRank, aggregate, memberFit, tonightMatch, negativePenalty,
  normCosine, normSaturating, normRating, type MemberProfile, type GroupMethod,
} from './rank';
import { FAST_WEIGHTS, RANKING_VERSION, SEVERE_MISMATCH } from './config';
import { parseIntent } from './parseIntent';
import { generateCatalog, type SynthTitle } from './synthCatalog';
import { FixtureEmbeddingProvider } from './embedding';

const emb = new FixtureEmbeddingProvider('test');
const vec = (s: string) => emb.vectorFor(s).values;

function title(over: Partial<SynthTitle> & { id: string }): SynthTitle {
  return {
    mediaType: 'movie', title: over.id, alternateTitles: [], releaseYear: 2010,
    runtimeMinutes: 100, originalLanguage: 'en', contentRating: 'PG-13',
    genres: ['drama'], subgenres: [], keywords: [], director: 'd1',
    leadPerformers: ['p1'], cast: ['p1'], franchise: null, sequenceOrder: null,
    remakeOf: null, sequelOf: null, synopsis: 'x', features: {},
    criticScore: 7, audienceScore: 7, popularity: 100, voteCount: 500,
    metadataConfidence: 0.9, availability: [], vector: emb.vectorFor(over.id),
    tags: ['normal'], ...over,
  };
}

const member = (over: Partial<MemberProfile> & { id: string }): MemberProfile => ({
  name: over.id, vector: vec(over.id), confidence: 0.8,
  watchedIds: new Set(), exclusions: [], isHost: false, ...over,
});

// ============================================================ STAGE 3 ========

describe('Stage 3 — normalisation', () => {
  it('maps cosine from -1..1 onto 0..1', () => {
    expect(normCosine(-1)).toBe(0);
    expect(normCosine(0)).toBe(0.5);
    expect(normCosine(1)).toBe(1);
  });

  it('saturates an unbounded relevance score instead of letting it dominate', () => {
    expect(normSaturating(0, 0.1)).toBe(0);
    expect(normSaturating(0.1, 0.1)).toBeCloseTo(0.5, 5);
    // A huge raw value approaches but never exceeds 1, so it cannot swamp the blend.
    expect(normSaturating(1e6, 0.1)).toBeLessThan(1);
    expect(normSaturating(1e6, 0.1)).toBeGreaterThan(0.99);
  });

  it('treats a missing rating as unknown, not as zero', () => {
    expect(normRating(null)).toBeNull();
    expect(normRating(undefined)).toBeNull();
    expect(normRating(0)).toBe(0);
  });
});

describe('Stage 3 — blending', () => {
  const req = parseIntent('a drama');

  it('renormalises over present components so missing data neither helps nor hurts', () => {
    const complete = title({ id: 'a', audienceScore: 8, features: { mainstream: 0.5 }, availability: [{ provider: 'netflix', monetization: 'flatrate', region: 'US', verifiedDaysAgo: 1, confidence: 0.9 }] });
    const sparse = title({ id: 'b', audienceScore: null, features: {}, availability: [] });
    const [ra, rb] = fastRank([complete, sparse], { request: req, queryVector: vec('q') }, 10);
    // Both land on the same 0..1 scale; the sparse one simply has fewer inputs.
    for (const r of [ra!, rb!]) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
    expect(rb!.missing).toContain('qualityConfidence');
    expect(rb!.missing).toContain('novelty');
  });

  it('is deterministic for identical inputs', () => {
    const cat = generateCatalog({ count: 200, seed: 'det' });
    const run = () => fastRank(cat, { request: req, queryVector: vec('q') }, 50).map((r) => `${r.id}:${r.score.toFixed(6)}`);
    expect(run()).toEqual(run());
  });

  it('breaks ties by id, never by input order', () => {
    const a = title({ id: 'zzz', features: {}, audienceScore: 7 });
    const b = title({ id: 'aaa', features: {}, audienceScore: 7 });
    const forward = fastRank([a, b], { request: parseIntent(''), queryVector: null }, 10);
    const reverse = fastRank([b, a], { request: parseIntent(''), queryVector: null }, 10);
    expect(forward.map((r) => r.id)).toEqual(reverse.map((r) => r.id));
  });

  it('changes the ordering when the weights change', () => {
    const popular = title({ id: 'pop', audienceScore: 9.5, features: { mainstream: 0.95 } });
    const novel = title({ id: 'nov', audienceScore: 6.0, features: { mainstream: 0.05 } });
    const qualityHeavy = fastRank([popular, novel], { request: parseIntent(''), queryVector: null, weights: { ...FAST_WEIGHTS, qualityConfidence: 0.9, novelty: 0.01 } }, 5);
    const noveltyHeavy = fastRank([popular, novel], { request: parseIntent(''), queryVector: null, weights: { ...FAST_WEIGHTS, qualityConfidence: 0.01, novelty: 0.9 } }, 5);
    expect(qualityHeavy[0]!.id).toBe('pop');
    expect(noveltyHeavy[0]!.id).toBe('nov');
  });

  it('stamps the ranking version so a config change is traceable', () => {
    const r = fastRank([title({ id: 'a' })], { request: parseIntent(''), queryVector: null }, 1);
    expect(r[0]!.rankingVersion).toBe(RANKING_VERSION);
  });

  it('handles extreme values without producing NaN or going out of range', () => {
    const extreme = title({ id: 'x', audienceScore: 10, popularity: 1e9, voteCount: 1e7, features: { mainstream: 1, gore: 1 } });
    const r = fastRank([extreme], { request: parseIntent('nothing gory'), queryVector: vec('q') }, 1);
    expect(Number.isFinite(r[0]!.score)).toBe(true);
    expect(r[0]!.score).toBeGreaterThanOrEqual(0);
    expect(r[0]!.score).toBeLessThanOrEqual(1);
  });
});

describe('Stage 3 — negative preferences', () => {
  it('penalises in proportion to the measured trait', () => {
    const req = parseIntent('a thriller but nothing gory');
    const gory = title({ id: 'g', features: { gore: 0.95 } });
    const mild = title({ id: 'm', features: { gore: 0.05 } });
    expect(negativePenalty(gory, req)).toBeGreaterThan(negativePenalty(mild, req));
  });

  it('does NOT penalise a title whose gore level is unknown', () => {
    const req = parseIntent('nothing gory');
    expect(negativePenalty(title({ id: 'u', features: {} }), req)).toBe(0);
  });

  it('penalises a repeated franchise', () => {
    const req = parseIntent('');
    const t = title({ id: 'f', franchise: 'bond' });
    const [with_, without] = [
      fastRank([t], { request: req, queryVector: null, seenFranchises: new Set(['bond']) }, 1)[0]!,
      fastRank([t], { request: req, queryVector: null, seenFranchises: new Set() }, 1)[0]!,
    ];
    expect(with_.penalties.franchiseRepeat).toBeGreaterThan(0);
    expect(with_.score).toBeLessThan(without.score);
  });
});

// ============================================================ STAGE 4 ========

describe('Stage 4 — group aggregation methods', () => {
  it('weighted mean ignores the worst-served member; min_protected does not', () => {
    const scores = [0.95, 0.15];
    expect(aggregate(scores, 'weighted_mean')).toBeCloseTo(0.55, 5);
    expect(aggregate(scores, 'min_protected')).toBeLessThan(aggregate(scores, 'weighted_mean'));
  });

  it('nash collapses when any member is near zero', () => {
    expect(aggregate([0.9, 0.9], 'nash')).toBeGreaterThan(0.85);
    expect(aggregate([0.9, 0.01], 'nash')).toBeLessThan(0.15);
  });

  it('the disagreement penalty scales with the spread', () => {
    const agree = aggregate([0.7, 0.72], 'disagreement_penalty');
    const split = aggregate([0.4, 1.0], 'disagreement_penalty');
    expect(agree).toBeGreaterThan(split);
  });

  it('every method returns 0 for an empty room rather than NaN', () => {
    for (const m of ['weighted_mean', 'min_protected', 'disagreement_penalty', 'nash'] as GroupMethod[]) {
      expect(aggregate([], m)).toBe(0);
    }
  });
});

describe('Stage 4 — member protection', () => {
  const req = parseIntent('a drama');
  const run = (members: MemberProfile[], titles: SynthTitle[], method?: GroupMethod) => {
    const fast = fastRank(titles, { request: req, queryVector: vec('q') }, 100);
    return deepRank(titles, { members, request: req, fast: new Map(fast.map((f) => [f.id, f])), method }, 100);
  };

  it('flags a member predicted to strongly dislike a title', () => {
    const t = title({ id: 'a' });
    // Give one member a vector deliberately opposed to the title's.
    const opposed = member({ id: 'x', vector: t.vector.values.map((v) => -v), confidence: 1 });
    const aligned = member({ id: 'y', vector: [...t.vector.values], confidence: 1 });
    const [d] = run([opposed, aligned], [t]);
    expect(d!.memberScores.x).toBeLessThan(SEVERE_MISMATCH);
    expect(d!.severeMismatchFor).toContain('x');
    // And the group score must not hide it.
    expect(d!.lowestMemberScore).toBeLessThan(d!.groupMean);
  });

  it('a hard personal exclusion GATES the title — it is never averaged away', () => {
    const horror = title({ id: 'h', genres: ['horror'] });
    const loves = member({ id: 'a', vector: [...horror.vector.values], confidence: 1 });
    const excludes = member({ id: 'b', exclusions: ['horror'] });
    const out = run([loves, excludes], [horror]);
    // Gated titles are removed from the ranked output entirely.
    expect(out.find((d) => d.id === 'h')).toBeUndefined();
  });

  it('a high-gore title is gated for a member who excludes gore', () => {
    const gory = title({ id: 'g', features: { gore: 0.9 } });
    const out = run([member({ id: 'a' }), member({ id: 'b', exclusions: ['graphic_gore'] })], [gory]);
    expect(out).toHaveLength(0);
  });

  it('the host gets no extra taste weight', () => {
    const t = title({ id: 'a' });
    const asHost = run([member({ id: 'x', isHost: true }), member({ id: 'y' })], [t]);
    const asGuest = run([member({ id: 'x', isHost: false }), member({ id: 'y' })], [t]);
    expect(asHost[0]!.compromiseScore).toBe(asGuest[0]!.compromiseScore);
    expect(asHost[0]!.memberScores).toEqual(asGuest[0]!.memberScores);
  });

  it('two members with similar taste agree; conflicting taste shows disagreement', () => {
    const t = title({ id: 'a' });
    const similar = run([
      member({ id: 'a', vector: [...t.vector.values], confidence: 1 }),
      member({ id: 'b', vector: [...t.vector.values], confidence: 1 }),
    ], [t]);
    const conflicting = run([
      member({ id: 'a', vector: [...t.vector.values], confidence: 1 }),
      member({ id: 'b', vector: t.vector.values.map((v) => -v), confidence: 1 }),
    ], [t]);
    expect(similar[0]!.disagreement).toBeLessThan(0.05);
    expect(conflicting[0]!.disagreement).toBeGreaterThan(0.5);
  });

  it('a new low-confidence member leans on the request instead of their empty profile', () => {
    const t = title({ id: 'a', genres: ['drama'] });
    const newbie = member({ id: 'n', vector: null, confidence: 0.05 });
    const [d] = run([newbie, member({ id: 'v' })], [t]);
    // No vector ⇒ scored from request fit, and never NaN.
    expect(Number.isFinite(d!.memberScores.n!)).toBe(true);
    expect(d!.memberScores.n).toBeGreaterThan(0);
  });

  it('handles three- and five-member courts', () => {
    const t = title({ id: 'a' });
    for (const n of [3, 5]) {
      const members = Array.from({ length: n }, (_, i) => member({ id: `m${i}` }));
      const [d] = run(members, [t]);
      expect(Object.keys(d!.memberScores)).toHaveLength(n);
      expect(d!.groupMean).toBeGreaterThan(0);
    }
  });

  it('a late-joining member changes the result, rather than being ignored', () => {
    const cat = generateCatalog({ count: 300, seed: 'late' });
    const before = run([member({ id: 'a' }), member({ id: 'b' })], cat);
    const after = run([member({ id: 'a' }), member({ id: 'b' }), member({ id: 'c', vector: vec('very-different') })], cat);
    expect(before[0]!.compromiseScore).not.toBe(after[0]!.compromiseScore);
  });

  it('a member who has seen a title scores it lower WITHOUT it counting as dislike', () => {
    const t = title({ id: 'a' });
    const fresh = run([member({ id: 'x' })], [t]);
    const seen = run([member({ id: 'x', watchedIds: new Set(['a']) })], [t]);
    expect(seen[0]!.memberScores.x!).toBeLessThan(fresh[0]!.memberScores.x!);
    // Still a positive score — "seen it" is not a negative signal.
    expect(seen[0]!.memberScores.x!).toBeGreaterThan(0);
  });
});
