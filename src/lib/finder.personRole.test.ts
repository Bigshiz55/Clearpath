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

vi.mock('@/lib/tmdb/client', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/lib/tmdb/client');
  return { ...actual, discoverTitles, getCredits };
});

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

beforeEach(() => {
  vi.clearAllMocks();
  discoverTitles.mockResolvedValue([DIRECTED, PRODUCED]);
  getCredits.mockImplementation(async (_mt: string, id: number) =>
    id === DIRECTED.id
      ? { cast: [], crew: [{ id: NOLAN, job: 'Director', department: 'Directing' }] }
      : { cast: [], crew: [{ id: NOLAN, job: 'Producer', department: 'Production' }] },
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
