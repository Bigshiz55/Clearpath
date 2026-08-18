import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * THE ROLE SURVIVES RETRIEVAL *AND* QUALIFICATION — end to end through the finder.
 *
 * `personRole.test.ts` proves the parameter leaves correctly. `constraint.test.ts`
 * proves the predicate is right. Neither proves they are WIRED TOGETHER, and the
 * gap between them is exactly where a director request could still come back
 * with a film he only produced: `with_crew` retrieves it, and nothing rejects it.
 *
 * So this drives `runFinder` with the real modules and a stubbed provider, and
 * asserts what actually comes out.
 */

const discoverTitles = vi.hoisted(() => vi.fn());
const getCredits = vi.hoisted(() => vi.fn());
const getScoringData = vi.hoisted(() => vi.fn());

vi.mock('@/lib/tmdb/client', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/tmdb/client');
  return { ...actual, discoverTitles, getCredits };
});
vi.mock('@/lib/titleData', () => ({ getScoringData }));

import type { TitleCredits } from '@/lib/tmdb/client';
import type { TitleMetadata } from '@/lib/types';

/* A SUPABASE STAND-IN, NOT A MOCK OF THE THING UNDER TEST. `runFinder` reads a
   profile, the user's services and their watchlist before it reaches the
   provider; all three are empty here so the run proceeds to the part this file
   is about. Everything downstream of the query — retrieval and qualification —
   is the real module. */
const supabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null }),
        in: async () => ({ data: [] }),
        then: undefined,
      }),
    }),
  }),
} as any;

/** The one call under test, with the boilerplate the finder needs to start. */
async function run(q: Record<string, unknown>) {
  const { runFinder } = await import('./finder');
  return runFinder(supabase, 'user-1', q as any, null, 5).catch(() => null);
}

const NOLAN = 525;

/** Two candidates: one Nolan DIRECTED, one he only PRODUCED. */
const DIRECTED = { id: 27205, mediaType: 'movie' as const, title: 'Inception', year: 2010, posterPath: null, voteAverage: 8.4, overview: '' };
const PRODUCED = { id: 141052, mediaType: 'movie' as const, title: 'Man of Steel', year: 2013, posterPath: null, voteAverage: 6.6, overview: '' };

/** Enough real metadata for the finder to hydrate and score a candidate. */
const metaFor = (c: typeof DIRECTED): TitleMetadata => ({
  id: c.id,
  mediaType: 'movie',
  title: c.title,
  year: c.year,
  overview: 'A film.',
  genres: ['Action'],
  keywords: [],
  posterPath: null,
  backdropPath: null,
  runtimeMinutes: 140,
  episodeRuntimeMinutes: null,
  status: 'Released',
  contentRating: 'PG-13',
  voteAverage: c.voteAverage,
  voteCount: 30000,
  popularity: 60,
  trailerUrl: null,
  originalLanguage: 'en',
  spokenLanguages: ['English'],
  originCountries: ['US'],
  imdbId: null,
  imdbRating: null,
  rottenTomatoes: null,
  metascore: null,
  episodesAired: null,
  episodesTotal: null,
  nextEpisodeDate: null,
  englishAvailability: 'native',
});

beforeEach(() => {
  vi.clearAllMocks();
  discoverTitles.mockResolvedValue([DIRECTED, PRODUCED]);
  getScoringData.mockImplementation(async (_mt: string, id: number) => ({
    meta: metaFor(id === DIRECTED.id ? DIRECTED : PRODUCED),
    providers: null,
  }));
  /* THE MOCK MIRRORS THE REAL `TitleCredits` SHAPE, AND THE ANNOTATION IS THE
     TETHER. An earlier version of this mock answered in the verifier's own
     `CreditsView` shape — {cast, crew} — which the real getCredits DID NOT
     PRODUCE at the time (it returned {cast, directors, creators}, no crew).
     Every test here stayed green while the live product returned ZERO titles
     for "movies directed by Christopher Nolan": all 24 correctly-retrieved
     candidates failed verification against a witness with no `crew` to read.
     Typing the implementation's return as `TitleCredits` means this mock can
     never again drift from the contract it claims to stand in for. */
  getCredits.mockImplementation(async (_mt: string, id: number): Promise<TitleCredits> =>
    id === DIRECTED.id
      ? {
          cast: [],
          crew: [
            { id: NOLAN, name: 'Christopher Nolan', job: 'Director', department: 'Directing' },
            { id: NOLAN, name: 'Christopher Nolan', job: 'Writer', department: 'Writing' },
          ],
          directors: [{ id: NOLAN, name: 'Christopher Nolan' }],
          creators: [],
        }
      : {
          cast: [],
          crew: [{ id: NOLAN, name: 'Christopher Nolan', job: 'Producer', department: 'Production' }],
          directors: [],
          creators: [],
        },
  );
});

describe('a director constraint reaches the provider as a crew filter', () => {
  it('discoverTitles is called with the role, never with the id as cast', async () => {
    await run({ mediaType: 'movie', people: [{ personId: NOLAN, role: 'director' }] });

    const opts = discoverTitles.mock.calls.map((c) => c[1]).filter(Boolean);
    expect(opts.length, 'the finder actually reached the provider').toBeGreaterThan(0);
    for (const o of opts) {
      expect(o.people, 'the role travelled with the constraint').toEqual([
        { personId: NOLAN, role: 'director' },
      ]);
      expect(o.castIds ?? [], 'a director must never arrive as castIds').toEqual([]);
    }
  });
});

describe('the qualified answer, end to end', () => {
  /* Retrieval, hydration, ranking AND role qualification — through the real
     `runFinder`, with the provider and hydration stubbed and everything
     between them real. This is the assertion the wiring test was missing:
     not "did the parameter leave correctly" but "did the RIGHT FILMS come
     back". No catch(): if the finder throws, the real error is the output. */
  it('returns the film the person DIRECTED and rejects the one they only PRODUCED', async () => {
    const { runFinder } = await import('./finder');
    const res = await runFinder(
      supabase,
      'user-1',
      { mediaType: 'movie', people: [{ personId: NOLAN, role: 'director' }] } as any,
      null,
      5,
    );
    expect(
      res.items.map((i) => i.id),
      'the directed film survives qualification; the produced one dies there',
    ).toEqual([DIRECTED.id]);
    expect(res.diagnostics.finalReturnedCount).toBe(1);
  });
});

describe('actor requests pay nothing and behave exactly as before', () => {
  it('an actor-only query never fetches credits for qualification', async () => {
    /* THE COST GUARD. The director check is per-candidate network work, so it
       must not run for the requests that make up almost all traffic. */
    await run({ mediaType: 'movie', castIds: [62] });
    expect(getCredits, 'no director asked for, no per-title verification').not.toHaveBeenCalled();
  });

  it('legacy castIds still travels as castIds', async () => {
    await run({ mediaType: 'movie', castIds: [62] });
    const opts = discoverTitles.mock.calls.map((c) => c[1]).filter(Boolean);
    for (const o of opts) expect(o.castIds).toEqual([62]);
  });
});

/**
 * THE REPORTED PRODUCTION FAILURE, PINNED AT THE FINDER.
 *
 * "Looking for a good Samuel L Jackson movie I may not have seen" returned The
 * Furious (2026), Backrooms (2026) and The End of Oak Street (2026) at "100
 * match". None of them has him in it.
 *
 * Verification ran for `role === 'director'` only, on the reasoning that an
 * actor was already guaranteed by TMDB's `with_cast`. That guarantee covers
 * the discover strands and nothing else — subject search, lexical routes, the
 * vibe-keyword relaxation and the zero-result fallback all inject candidates
 * that never passed a cast-filtered query, and every one of them reached
 * ranking unchecked.
 */
describe('an ACTOR constraint is verified per candidate, not merely retrieved', () => {
  const SLJ = 2231;
  const IN_IT = { id: 111, mediaType: 'movie' as const, title: 'A Jackson Film', year: 2014, posterPath: null, voteAverage: 7.5, overview: '' };
  const NOT_IN_IT = { id: 222, mediaType: 'movie' as const, title: 'The Furious', year: 2026, posterPath: null, voteAverage: 8.9, overview: '' };

  beforeEach(() => {
    vi.clearAllMocks();
    // Both arrive as candidates — exactly as a fallback strand would deliver them.
    discoverTitles.mockResolvedValue([NOT_IN_IT, IN_IT]);
    getCredits.mockImplementation(async (_mt: string, id: number) =>
      id === IN_IT.id ? { cast: [{ id: SLJ }], crew: [] } : { cast: [{ id: 99999 }], crew: [] },
    );
  });

  it('drops the high-quality film he is NOT in, and keeps the one he is', async () => {
    const r = await run({ mediaType: 'movie', people: [{ personId: SLJ, role: 'actor' }] });
    const titles = (r?.items ?? []).map((i: { title: string }) => i.title);
    expect(titles, 'the reported failure: a 2026 film he is not in must not survive').not.toContain('The Furious');
  });

  it('an unverifiable candidate is dropped — "we could not check" is not a pass', async () => {
    getCredits.mockResolvedValue(null);
    const r = await run({ mediaType: 'movie', people: [{ personId: SLJ, role: 'actor' }] });
    expect((r?.items ?? []).length).toBe(0);
  });

  it('a request naming nobody still pays nothing', async () => {
    await run({ mediaType: 'movie' });
    expect(getCredits).not.toHaveBeenCalled();
  });
});
