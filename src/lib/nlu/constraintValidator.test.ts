import { describe, it, expect } from 'vitest';
import { buildQueryPlan } from './queryPlan';
import { enforcePlan, validateCandidate, type Candidate } from './constraintValidator';

const plan = buildQueryPlan('Send me three movies I should watch on Lifetime');

// The exact failing result set from production, plus valid Lifetime movies.
const svu: Candidate = { id: 'tv-1', tmdbId: 1, mediaType: 'tv', title: 'Law & Order: SVU', availableNetworks: ['nbc'] };
const lo: Candidate = { id: 'tv-2', tmdbId: 2, mediaType: 'tv', title: 'Law & Order', availableNetworks: ['nbc'] };
const rm: Candidate = { id: 'tv-3', tmdbId: 3, mediaType: 'tv', title: 'Rick and Morty', availableNetworks: ['adult swim'] };
const lifeMovieA: Candidate = { id: 'movie-10', tmdbId: 10, mediaType: 'movie', title: 'A Lifetime Movie', availableNetworks: ['lifetime'], matchScore: 70 };
const lifeMovieB: Candidate = { id: 'movie-11', tmdbId: 11, mediaType: 'movie', title: 'Another Lifetime Movie', availableNetworks: ['lifetime'], matchScore: 90 };
const netflixMovie: Candidate = { id: 'movie-12', tmdbId: 12, mediaType: 'movie', title: 'A Netflix Movie', availableProviderIds: [8], matchScore: 99 };
const hallmarkMovie: Candidate = { id: 'movie-13', tmdbId: 13, mediaType: 'movie', title: 'A Hallmark Movie', availableNetworks: ['hallmark'], matchScore: 95 };

describe('constraint validator — the Lifetime failure, fixed', () => {
  it('rejects all three wrong results for the correct reasons', () => {
    expect(validateCandidate(svu, plan).failures.map((f) => f.constraint)).toEqual(['mediaType', 'source']);
    expect(validateCandidate(lo, plan).failures.map((f) => f.constraint)).toEqual(['mediaType', 'source']);
    expect(validateCandidate(rm, plan).failures.map((f) => f.constraint)).toEqual(['mediaType', 'source']);
  });

  it('a high Match score can NOT override media type or source', () => {
    // Netflix movie (match 99) and Hallmark movie (95) both fail the source; SVU is TV.
    const out = enforcePlan([svu, lo, rm, netflixMovie, hallmarkMovie, lifeMovieA, lifeMovieB], plan);
    expect(out.results.map((c) => c.title)).toEqual(['Another Lifetime Movie', 'A Lifetime Movie']); // only valid Lifetime movies, ranked by match
    expect(out.results.every((c) => c.mediaType === 'movie')).toBe(true);
    expect(out.rejected.map((r) => r.candidate.title).sort()).toEqual(['A Hallmark Movie', 'A Netflix Movie', 'Law & Order', 'Law & Order: SVU', 'Rick and Morty']);
  });

  it('honest shortfall when fewer than N valid results exist', () => {
    const out = enforcePlan([svu, lo, rm, lifeMovieA], plan); // only 1 valid
    expect(out.fulfilled).toBe(1);
    expect(out.shortfall).toBe(2);
    expect(out.message).toMatch(/only 1 verified Lifetime movie/i);
  });

  it('never fills the count with an invalid candidate (no unsafe fallback)', () => {
    const out = enforcePlan([lifeMovieA, netflixMovie, svu], plan);
    expect(out.results).toHaveLength(1); // NOT padded to 3 with Netflix/SVU
    expect(out.results[0]!.title).toBe('A Lifetime Movie');
  });

  it('dedupes before ranking', () => {
    const dup = { ...lifeMovieB };
    const out = enforcePlan([lifeMovieB, dup, lifeMovieA], plan);
    expect(out.results).toHaveLength(2);
  });

  it('validates all fulfilled results against the plan (final guard)', () => {
    const out = enforcePlan([svu, lo, rm, netflixMovie, hallmarkMovie, lifeMovieA, lifeMovieB], plan);
    for (const r of out.results) expect(validateCandidate(r, plan).valid).toBe(true);
  });
});

// ── Property-based tests: invariants hold regardless of input ────────────────
describe('constraint validator — property-based invariants', () => {
  function mulberry32(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  it('movies-only plan ⇒ every result is a movie (500 random candidate sets)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const cands: Candidate[] = Array.from({ length: Math.floor(r() * 12) }, (_, j) => {
        const isMovie = r() < 0.5;
        return { id: `${isMovie ? 'movie' : 'tv'}-${i}-${j}`, tmdbId: j, mediaType: isMovie ? 'movie' : 'tv', title: `T${j}`, availableNetworks: r() < 0.5 ? ['lifetime'] : ['nbc'], matchScore: Math.floor(r() * 100) };
      });
      const out = enforcePlan(cands, plan);
      expect(out.results.every((c) => c.mediaType === 'movie')).toBe(true);
      expect(out.results.every((c) => (c.availableNetworks ?? []).includes('lifetime'))).toBe(true);
      if (plan.count.requested != null) expect(out.results.length).toBeLessThanOrEqual(plan.count.requested);
    }
  });

  it('count invariant: result count == N or an explicit shortfall is reported', () => {
    const r = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      const cands: Candidate[] = Array.from({ length: Math.floor(r() * 8) }, (_, j) => ({ id: `movie-${i}-${j}`, tmdbId: j, mediaType: 'movie', title: `T${j}`, availableNetworks: ['lifetime'], matchScore: Math.floor(r() * 100) }));
      const out = enforcePlan(cands, plan);
      expect(out.fulfilled === 3 || out.shortfall > 0).toBe(true);
      if (out.shortfall > 0) expect(out.message).toBeTruthy();
    }
  });
});
