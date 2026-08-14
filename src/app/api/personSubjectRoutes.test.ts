/**
 * ROUTE-LEVEL PARITY — the whole chain, on BOTH routes that own it.
 *
 * `personSubject.test.ts` starts after `castIds` have already been supplied,
 * which is one assumption too many: it proves the subject layer behaves given
 * consumed evidence, and says nothing about whether the routes actually PRODUCE
 * that evidence. The collision lived in the gap between those two things, so
 * this drives the real handlers end to end:
 *
 *   raw text → the existing person resolution → consumed-entity evidence
 *            → subject application → the FinderQuery retrieval will run
 *
 * WHAT IS MOCKED IS THE WORLD, NOT THE MEANING. Supabase, TMDB and the finder
 * are stubbed at their own boundaries; `resolvePerson`, `maskConsumedEntities`,
 * `applyRequiredSubject` and `detectGeneralSubject` are the real thing. A test
 * that stubbed those would be asserting its own fixtures.
 *
 * PARITY IS THE POINT of running both. /api/ask and /api/finder resolve people
 * the same way and share one subject layer, so a fix applied to one and not the
 * other is a silent divergence in what the same sentence means. Each case below
 * runs on both handlers and asserts the same query.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Every FinderQuery retrieval was asked to run, in order. */
const RAN: Array<Record<string, unknown>> = [];

vi.mock('@/lib/finder', async (orig) => {
  const actual = await orig<typeof import('@/lib/finder')>();
  return {
    ...actual,
    runFinder: vi.fn(async (_sb: unknown, _uid: string, query: Record<string, unknown>) => {
      RAN.push(query);
      return { items: [], scoredFor: 'test', relaxed: null, total: 0, diagnostics: {
        requestedCount: null, candidateCount: 0, deterministicEligibleCount: 0,
        semanticEvaluatedCount: 0, centralSubjectEligibleCount: 0,
        qualityEligibleCount: 0, finalReturnedCount: 0,
      } };
    }),
  };
});

/* THE CATALOG. `searchPeople` is the fuzzy identity the resolver promises, and
   the misspelling is the whole point of the third case: the catalog corrects
   "Stalone" to "Sylvester Stallone", exactly as TMDB does. */
vi.mock('@/lib/tmdb/client', () => ({
  searchPeople: vi.fn(async (q: string) => {
    if (/stal+one/i.test(q)) return [{ id: 16483, name: 'Sylvester Stallone', profilePath: null, knownFor: 'Rocky' }];
    if (/hanks/i.test(q)) return [{ id: 31, name: 'Tom Hanks', profilePath: null, knownFor: 'Forrest Gump' }];
    return [];
  }),
  searchKeywords: vi.fn(async (terms: string[]) => {
    if (terms.some((t) => /box|prizefight/i.test(t))) return [1234, 5678];
    if (terms.some((t) => /courtroom|trial|legal/i.test(t))) return [4321];
    return [];
  }),
  getCredits: vi.fn(async () => ({ cast: [], crew: [] })),
  searchTitles: vi.fn(async () => []),
  getTitle: vi.fn(async () => null),
  discoverTitles: vi.fn(async () => []),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-under-test' } }, error: null }) },
  }),
}));

vi.mock('@/lib/preference/store', () => ({ loadPreferenceCached: async () => null }));
vi.mock('@/lib/titleDimensions', () => ({ getCachedDimensions: async () => new Map() }));

const post = async (
  handler: (r: Request) => Promise<Response>,
  url: string,
  text: string,
): Promise<Record<string, unknown>> => {
  RAN.length = 0;
  const res = await handler(
    new Request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    }),
  );
  await res.json().catch(() => ({}));
  // The query retrieval actually ran is the subject of every assertion here —
  // the response body reshapes it, the finder input does not.
  return (RAN[RAN.length - 1] ?? {}) as Record<string, unknown>;
};

interface Case {
  name: string;
  text: string;
  castId: number;
  subject: string | null;
  forbidden: string[];
}

const CASES: Case[] = [
  {
    name: 'a Tom Hanks courtroom movie',
    text: 'a Tom Hanks courtroom movie',
    castId: 31,
    subject: 'courtroom',
    forbidden: ['hanks', 'hanks courtroom', 'tom hanks'],
  },
  {
    name: 'a Sylvester Stallone boxing movie',
    text: 'a Sylvester Stallone boxing movie',
    castId: 16483,
    subject: 'boxing',
    forbidden: ['stallone', 'stallone boxing', 'sylvester'],
  },
  {
    // FUZZY IDENTITY MUST SURVIVE THE FIX. The easy way to stop a misspelling
    // becoming a subject is to stop resolving misspellings, which would trade
    // one defect for a worse one. The person still resolves here.
    name: 'a Sylvester Stalone boxing movie (misspelled)',
    text: 'a Sylvester Stalone boxing movie',
    castId: 16483,
    subject: 'boxing',
    forbidden: ['stalone', 'stallone', 'stalone boxing'],
  },
];

const ROUTES: Array<{ label: string; url: string; load: () => Promise<{ POST: (r: Request) => Promise<Response> }> }> = [
  { label: '/api/ask', url: 'https://local.test/api/ask', load: () => import('./ask/route') },
  { label: '/api/finder', url: 'https://local.test/api/finder', load: () => import('./finder/route') },
];

for (const route of ROUTES) {
  describe(`${route.label} — resolved people never become subjects`, () => {
    beforeEach(() => {
      vi.clearAllMocks();
      RAN.length = 0;
    });

    for (const c of CASES) {
      it(`"${c.name}" → person resolved once, subject ${c.subject ?? 'none'}`, async () => {
        const { POST } = await route.load();
        const query = await post(POST, route.url, c.text);

        // The route reached retrieval at all — otherwise every assertion below
        // would pass vacuously against an empty object.
        expect(Object.keys(query).length).toBeGreaterThan(0);

        expect(query.castIds).toEqual([c.castId]);
        expect(query.mediaType).toBe('movie');
        expect(query.subjectCanonical ?? null).toBe(c.subject);
        for (const bad of c.forbidden) {
          expect(query.subjectCanonical ?? '').not.toBe(bad);
          expect((query.subjectLexemes as string[] | undefined) ?? []).not.toContain(bad);
        }
      });
    }
  });
}
