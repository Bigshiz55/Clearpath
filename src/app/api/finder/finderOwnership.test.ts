/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FINDER SPEAKS THE CANONICAL LANGUAGE — Phase 7 semantic ownership.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two laws, exercised through the REAL route (world mocked at its boundary):
 *
 * 1. ONE READER FOR ONE SENTENCE. A recommendation-shaped text entering
 *    /api/finder is interpreted by the canonical interpreter and executed by
 *    `resolveCanonicalExecution` — the same pair /api/ask uses — so the same
 *    sentence produces the same structured request on both routes BY
 *    CONSTRUCTION (the parity case below computes the canonical execution
 *    independently and requires the route to match it).
 *
 * 2. THE SENTENCE OUTRANKS THE CLIENT'S PARSE OF IT. `body.query` — the
 *    browser's own parse of the same words — must never override what the
 *    words mean. It stands alone only when there IS no sentence, and the
 *    `overrides` list (sliders the user physically touched — an ACTION, not
 *    a parse) remains the one sanctioned client voice over a text-derived
 *    field.
 *
 * The conflicting payloads here are built the way a hostile or version-skewed
 * client would build them — a query that contradicts its own text — because
 * that is the exact input the old order trusted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { interpret } from '@/lib/interpret/interpret';
import { resolveCanonicalExecution } from '@/lib/ask/canonicalExecution';
import type { FinderQuery } from '@/lib/finder';

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-under-test' } }, error: null }) },
    from: () => {
      const chain = {
        insert: async () => ({ error: null }),
        select: () => chain,
        eq: () => chain,
        in: async () => ({ data: [] }),
        order: () => chain,
        limit: async () => ({ data: [] }),
        maybeSingle: async () => ({ data: null }),
      };
      return chain;
    },
  }),
}));

/* The world at its boundary: keyword search resolves chess-ish terms, people
   search finds nobody, discovery returns nothing (we assert on the QUERY the
   route hands the engine, not on retrieval). */
vi.mock('@/lib/tmdb/client', () => ({
  searchPeople: vi.fn(async () => []),
  searchKeywords: vi.fn(async (terms: string[]) => (terms.some((t) => /chess/i.test(t)) ? [4522] : [])),
  getCredits: vi.fn(async () => ({ cast: [], crew: [], directors: [], creators: [] })),
  searchTitles: vi.fn(async () => []),
  getTitle: vi.fn(async () => null),
  discoverTitles: vi.fn(async () => []),
}));

vi.mock('@/lib/preference/store', () => ({ loadPreferenceCached: async () => null }));
vi.mock('@/lib/titleDimensions', () => ({ getCachedDimensions: async () => new Map() }));

/* Capture the query the route actually executes. */
const executed: FinderQuery[] = [];
vi.mock('@/lib/finder', async (orig) => {
  const actual = await orig<typeof import('@/lib/finder')>();
  return {
    ...actual,
    runFinder: vi.fn(async (_sb: unknown, _uid: string, q: FinderQuery) => {
      executed.push(q);
      return { items: [], scoredFor: 'test', relaxed: null, total: 0, diagnostics: { requestedCount: 0, candidateCount: 0, deterministicEligibleCount: 0, semanticEvaluatedCount: 0, centralSubjectEligibleCount: 0, qualityEligibleCount: 0, finalReturnedCount: 0, evaluations: [] } };
    }),
  };
});

async function post(body: Record<string, unknown>): Promise<Response> {
  const { POST } = await import('./route');
  return POST(new Request('https://local.test/api/finder', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  executed.length = 0;
});

describe('one reader for one sentence', () => {
  it('a recommendation text executes the canonical interpretation — a conflicting client parse changes nothing', async () => {
    const res = await post({
      text: 'a chess movie',
      // A hostile/skewed client: the query contradicts its own words.
      query: { mediaType: 'tv', genreIds: [27], minImdb: 9 },
    });
    expect(res.status).toBe(200);
    expect(executed.length).toBe(1);
    const q = executed[0]!;
    expect(q.mediaType).toBe('movie');
    expect(q.genreIds).not.toContain(27);
    expect(q.minImdb ?? null).toBeNull();
    expect((q.subjectLexemes ?? []).join(' ')).toMatch(/chess/i);
  });

  it('PARITY BY CONSTRUCTION: the route executes exactly what canonical execution resolves for the sentence', async () => {
    await post({ text: 'a chess movie' });
    const exec = await resolveCanonicalExecution(interpret('a chess movie'));
    const q = executed[0]!;
    expect(q.mediaType).toBe(exec.query.mediaType);
    expect(q.genreIds).toEqual(exec.query.genreIds);
    expect(q.subjectLexemes ?? []).toEqual(exec.query.subjectLexemes ?? []);
    expect(q.subjectLabel ?? null).toBe(exec.query.subjectLabel ?? null);
    expect(q.subjectKeywordIds ?? []).toEqual(exec.query.subjectKeywordIds ?? []);
  });

  it('the legacy arm (a title-shaped text) also derives from the sentence, never from the client parse', async () => {
    await post({ text: 'Taken', query: { genreIds: [27], mediaType: 'tv' } });
    const q = executed[0]!;
    // naiveParseQuery('Taken') carries no horror and no TV claim.
    expect(q.genreIds).not.toContain(27);
    expect(q.mediaType).not.toBe('tv');
  });
});

describe('the sanctioned client voices survive the fold', () => {
  it('a slider the user touched still beats the sentence (overrides are actions, not parses)', async () => {
    await post({
      text: 'a chess movie',
      query: { maxRuntime: 90 },
      overrides: ['maxRuntime'],
    });
    expect(executed[0]!.maxRuntime).toBe(90);
    // …but the untouched fields still come from the sentence.
    expect(executed[0]!.mediaType).toBe('movie');
  });

  it('a deep-linked provider floor survives (structured user navigation, not a parse)', async () => {
    await post({ text: 'a chess movie', query: { providerIds: [8] } });
    expect(executed[0]!.providerIds).toEqual([8]);
  });

  it('with NO sentence, the structured client query is the request (the Vintage one-tap contract)', async () => {
    await post({ query: { mediaType: 'tv', genreIds: [18] } });
    expect(executed[0]!.mediaType).toBe('tv');
    expect(executed[0]!.genreIds).toEqual([18]);
  });
});
