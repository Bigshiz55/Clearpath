/**
 * THE CANONICAL PATH NEVER PAYS FOR A SECOND OPINION — TASK #36.
 *
 * `parseAskWithAI` is an LLM read of the whole utterance. On a sentence the
 * canonical arm serves, its query was DISCARDED and its resolvedPeople fed a
 * list only the legacy arm reads — the call was pure cost, and a standing
 * violation of "never call an LLM in a user request path". These drive the
 * REAL route with a key configured and a spy on fetch: a canonical-served
 * sentence must produce ZERO OpenAI calls; a legacy-served one still gets
 * its LLM parse, so the fence is a gate, not an amputation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function tableStub() {
  const chain = {
    insert: async () => ({ error: null }),
    upsert: async () => ({ error: null }),
    select: () => chain,
    eq: () => chain,
    in: async () => ({ data: [] }),
    order: () => chain,
    limit: async () => ({ data: [] }),
    maybeSingle: async () => ({ data: null }),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-under-test' } }, error: null }) },
    from: () => tableStub(),
  }),
}));

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

const executed: Array<{ query: import('@/lib/finder').FinderQuery; limit: number }> = [];
vi.mock('@/lib/finder', async (orig) => {
  const actual = await orig<typeof import('@/lib/finder')>();
  return {
    ...actual,
    runFinder: vi.fn(async (_sb: unknown, _uid: string, query: import('@/lib/finder').FinderQuery, _w: unknown, limit: number) => {
      executed.push({ query, limit });
      return {
        items: [], scoredFor: 'test', relaxed: null, total: 0,
        diagnostics: { requestedCount: 0, candidateCount: 0, deterministicEligibleCount: 0, semanticEvaluatedCount: 0, centralSubjectEligibleCount: 0, qualityEligibleCount: 0, finalReturnedCount: 0, evaluations: [] },
      };
    }),
  };
});

/* A key IS configured, so parseAskWithAI would genuinely call out — the
   fence, not a missing credential, must be what stops it. */
vi.mock('@/lib/env', async (orig) => {
  const actual = await orig<typeof import('@/lib/env')>();
  return { ...actual, serverEnv: { ...actual.serverEnv, openaiKey: () => 'test-key', aiDiscoveryMode: () => 'legacy' as const } };
});

const openaiCalls: string[] = [];
vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: { body?: string }) => {
  if (String(url).includes('api.openai.com')) {
    openaiCalls.push(init?.body ?? '');
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ filters: {}, limit: 6 }) } }] }),
    } as unknown as Response;
  }
  throw new Error(`unexpected fetch: ${String(url)}`);
}));

async function post(text: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const { POST } = await import('./ask/route');
  const res = await POST(new Request('https://local.test/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  }));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  openaiCalls.length = 0;
  executed.length = 0;
});

describe('the LLM fence on /api/ask', () => {
  it('a canonical-served recommendation makes ZERO OpenAI calls', async () => {
    const { status } = await post('a chess movie');
    expect(status).toBe(200);
    expect(openaiCalls.length, 'the canonical path paid for a discarded LLM parse').toBe(0);
  });

  it('a legacy-served sentence still gets its LLM parse — the fence is a gate, not an amputation', async () => {
    /* A bare catalog word is the live legacy case: interpret() calls
       "boxing" a statement, the lexical intent rescues it from the
       statement boundary, and the LEGACY arm executes it — where the LLM
       parse is still the design. (A bare title like "Taken" never reaches
       this line at all: it exits at the title arm or statement boundary.) */
    await post('boxing');
    expect(openaiCalls.length).toBeGreaterThan(0);
  });
});

describe('route litmus — the sentence means one thing, end to end (TASK #36)', () => {
  it('"another boxing movie" is a SEARCH about boxing — never the phantom title "another boxing"', async () => {
    const { body } = await post('another boxing movie');
    expect(body.kind).toBe('search');
    expect(openaiCalls.length).toBe(0);
    expect((executed[0]!.query.subjectLexemes ?? []).join(' ')).toMatch(/box/i);
  });

  it('"movies about chess" is a SEARCH about chess — never a title lookup for "chess"', async () => {
    const { body } = await post('movies about chess');
    expect(body.kind).toBe('search');
    expect((executed[0]!.query.subjectLexemes ?? []).join(' ')).toMatch(/chess/i);
    expect(executed[0]!.query.mediaType).toBe('movie');
  });

  it('"two space movies" carries count=2 into execution', async () => {
    await post('two space movies');
    expect(executed[0]!.limit).toBe(2);
    expect((executed[0]!.query.subjectLexemes ?? []).join(' ')).toMatch(/space/i);
  });

  it('"anything except horror" executes with horror EXCLUDED, not requested', async () => {
    const { interpret } = await import('@/lib/interpret/interpret');
    const { genreIdFor } = await import('@/lib/ask/canonicalExecution');
    const c = interpret('anything except horror');
    expect(c.kind).toBe('recommendation');
    await post('anything except horror');
    const horror = genreIdFor('horror');
    if (horror != null) {
      expect(executed[0]!.query.excludeGenreIds ?? []).toContain(horror);
      expect(executed[0]!.query.genreIds).not.toContain(horror);
    }
  });

  it('"best movies on Netflix" resolves the provider WITHOUT redefining the request', async () => {
    await post('best movies on Netflix');
    expect(executed[0]!.query.mediaType).toBe('movie');
    expect((executed[0]!.query.providerIds ?? []).length).toBeGreaterThan(0);
  });
});
