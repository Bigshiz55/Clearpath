import { describe, it, expect } from 'vitest';
import { buildDecks, passesFilters } from './deck';
import type { CourtCandidate, CourtParticipant, DeckFilters } from './types';
import type { DimensionProfile } from '@/lib/scoring/dimensions';

const prof = (pacing: number): DimensionProfile => ({ pref: { pacing }, weight: { pacing: 12 }, samples: 5 });
const cand = (n: number, over: Partial<CourtCandidate> = {}): CourtCandidate => ({
  key: `movie-${n}`, id: n, mediaType: 'movie', title: `T${n}`, year: 2020, runtime: 100,
  genreIds: [53], dimensions: { pacing: 50 }, available: true, ...over,
});
const THRILLER: DeckFilters = { mediaType: 'movie', genreId: 53, requireAvailable: true, maxPerFranchise: 1, avoidWatched: true };

// 16 thrillers: 1–8 fast (pacing 90), 9–16 slow (pacing 10).
const POOL: CourtCandidate[] = Array.from({ length: 16 }, (_, i) =>
  cand(i + 1, { dimensions: { pacing: i < 8 ? 90 : 10 } }),
);
const FAST: CourtParticipant = { id: 'p1', name: 'Fast', profile: prof(90) };
const SLOW: CourtParticipant = { id: 'p2', name: 'Slow', profile: prof(10) };

describe('passesFilters — host filters are hard', () => {
  it('rejects wrong media, genre, over-runtime, and unavailable titles', () => {
    expect(passesFilters(cand(1, { mediaType: 'tv' }), THRILLER)).toBe(false);
    expect(passesFilters(cand(1, { genreIds: [35] }), THRILLER)).toBe(false);
    expect(passesFilters(cand(1, { runtime: 999 }), { ...THRILLER, maxRuntime: 120 })).toBe(false);
    expect(passesFilters(cand(1, { available: false }), THRILLER)).toBe(false);
    expect(passesFilters(cand(1), THRILLER)).toBe(true);
  });
});

describe('buildDecks — composition, dedup, filters, no padding', () => {
  const decks = buildDecks([FAST, SLOW], POOL, THRILLER);

  it('builds one deck per participant, each ~12 with NO duplicate titles', () => {
    expect(decks).toHaveLength(2);
    for (const d of decks) {
      expect(d.slots.length).toBe(12);
      const keys = d.slots.map((s) => s.candidate.key);
      expect(new Set(keys).size).toBe(keys.length); // no dups
    }
  });

  it('every deck title satisfies the host genre / media / availability filters', () => {
    for (const d of decks) for (const s of d.slots) expect(passesFilters(s.candidate, THRILLER)).toBe(true);
  });

  it('shows 6 shared titles identical for everyone, but personalizes the rest to Watch DNA', () => {
    const shared = decks.map((d) => d.slots.filter((s) => s.kind === 'shared').map((s) => s.candidate.key).sort());
    expect(shared[0]).toEqual(shared[1]); // same shared six for both jurors
    expect(shared[0]!.length).toBe(6);
    const personal1 = decks[0]!.slots.filter((s) => s.kind === 'personalized').map((s) => s.candidate.key);
    const personal2 = decks[1]!.slots.filter((s) => s.kind === 'personalized').map((s) => s.candidate.key);
    // The fast-lover and slow-lover do NOT get the same personalized titles.
    expect(personal1).not.toEqual(personal2);
  });

  it('includes wildcard and divisive slots in the mix', () => {
    for (const d of decks) {
      expect(d.slots.some((s) => s.kind === 'wildcard')).toBe(true);
      expect(d.slots.some((s) => s.kind === 'divisive')).toBe(true);
    }
  });
});

describe('buildDecks — franchise cap, watched exclusion, honest shortfall', () => {
  it('never stacks more than one title from the same franchise', () => {
    const franchisePool = [
      cand(1, { franchise: 'X' }), cand(2, { franchise: 'X' }), cand(3, { franchise: 'X' }),
      cand(4), cand(5), cand(6), cand(7), cand(8),
    ];
    const [d] = buildDecks([FAST], franchisePool, THRILLER);
    const fromX = d!.slots.filter((s) => s.candidate.franchise === 'X').length;
    expect(fromX).toBeLessThanOrEqual(1);
  });

  it('returns fewer than 12 (no filler) when the reliable pool is small', () => {
    const small = [cand(1), cand(2), cand(3), cand(4), cand(5)];
    const [d] = buildDecks([FAST], small, THRILLER);
    expect(d!.slots.length).toBe(5);
  });

  it('excludes titles the juror already watched when the filter is on', () => {
    const p: CourtParticipant = { ...FAST, watched: ['movie-1', 'movie-2'] };
    const [d] = buildDecks([p], POOL, THRILLER);
    const keys = d!.slots.map((s) => s.candidate.key);
    expect(keys).not.toContain('movie-1');
    expect(keys).not.toContain('movie-2');
  });
});
