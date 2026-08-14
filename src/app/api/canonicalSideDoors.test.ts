/**
 * ══════════════════════════════════════════════════════════════════════════
 * NO SIDE DOORS — background vocabulary may not reach executable fields.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Once the canonical layer owns a request, EVERY executable semantic field
 * must come from `CanonicalIntent` plus downstream world resolution. The
 * measured violation: person/subject/count were canonical-owned while genre,
 * media, dates, runtime, providers and topic keywords still flowed in from
 * whole-utterance parsers (`parseAskWithAI` / `naiveParseQuery` /
 * `augmentInternational` / `parseTopicTerms`) that read the ANECDOTE too. So
 * "I watched a horror movie yesterday. Give me a courtroom movie." executed
 * with the background's horror in `genreIds` — the burrito defect, one field
 * over.
 *
 * Each case below collides background vocabulary with exactly one executable
 * field and asserts the field the FINDER RECEIVES carries only the request.
 * The harness is personSubjectRoutes.test.ts's: the world is mocked at its
 * boundary, the meaning-making code is real, and the captured FinderQuery is
 * the evidence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const searchKeywords = vi.fn(async (terms: string[]) => {
  if (terms.some((t) => /box|prizefight/i.test(t))) return [1234, 5678];
  if (terms.some((t) => /courtroom|trial|legal/i.test(t))) return [4321];
  if (terms.some((t) => /supernatural/i.test(t))) return [777];
  return [];
});

vi.mock('@/lib/tmdb/client', () => ({
  searchPeople: vi.fn(async (q: string) => {
    if (/stal+one/i.test(q)) return [{ id: 16483, name: 'Sylvester Stallone', profilePath: null, knownFor: 'Rocky' }];
    if (/hanks/i.test(q)) return [{ id: 31, name: 'Tom Hanks', profilePath: null, knownFor: 'Forrest Gump' }];
    return [];
  }),
  searchKeywords: (terms: string[]) => searchKeywords(terms),
  getCredits: vi.fn(async () => ({ cast: [], crew: [], directors: [], creators: [] })),
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

async function ask(text: string): Promise<Record<string, unknown>> {
  const { POST } = await import('./ask/route');
  const res = await POST(new Request('https://local.test/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  }));
  const body = (await res.json()) as { kind?: string };
  expect(body.kind, `route answered ${body.kind}, not a search`).toBe('search');
  const query = RAN.at(-1);
  expect(query, 'retrieval was never reached').toBeDefined();
  expect(Object.keys(query!).length).toBeGreaterThan(0);
  return query!;
}

beforeEach(() => {
  RAN.length = 0;
  searchKeywords.mockClear();
});

describe('background vocabulary cannot leak into executable fields', () => {
  it('GENRE: background horror does not become a requested genre', async () => {
    const q = await ask('I watched a horror movie yesterday. Give me a courtroom movie.');
    expect((q.genreIds as number[] | undefined) ?? [], 'the anecdote horror leaked into genreIds').not.toContain(27);
    expect(q.subjectCanonical).toBe('courtroom');
  });

  it('MEDIA: background TV does not change the requested medium', async () => {
    const q = await ask('I watched TV yesterday. Give me a boxing movie.');
    expect(q.mediaType, 'background TV moved the requested medium').toBe('movie');
  });

  it('DATE: a background year does not constrain the request', async () => {
    const q = await ask('I watched something from 1995 yesterday. Anyway, give me a boxing movie.');
    expect(q.minYear ?? null, 'the anecdote year leaked into minYear').toBeNull();
    expect(q.maxYear ?? null).toBeNull();
  });

  it('RUNTIME: a background runtime does not constrain the request', async () => {
    const q = await ask('I watched a 90 minute movie yesterday. Anyway, give me a boxing movie.');
    expect(q.maxRuntime ?? null, 'the anecdote runtime leaked into maxRuntime').toBeNull();
  });

  it('PROVIDER: a background provider does not constrain the request', async () => {
    const q = await ask('I used Netflix yesterday. Anyway, give me a boxing movie.');
    expect((q.providerIds as number[] | undefined) ?? [], 'the anecdote provider leaked into providerIds').toEqual([]);
  });

  it('TOPICS: background food never reaches keyword resolution', async () => {
    await ask('Had a beef burrito for dinner. Anyway, give me a boxing movie.');
    for (const call of searchKeywords.mock.calls) {
      expect(call[0].join(' ')).not.toMatch(/burrito|beef|dinner/i);
    }
  });
});

describe('a veto the catalog has no genre for still executes', () => {
  it('"no supernatural stuff" survives as a keyword exclusion, never a positive', async () => {
    // TMDB has no `supernatural` genre id. Dropping the span silently would
    // ignore a veto; the canonical mapping falls it back to the subject
    // channel, where keyword resolution can still exclude it.
    const q = await ask('Give me a thriller but no supernatural stuff.');
    expect((q.genreIds as number[] | undefined) ?? []).toContain(53);
    expect((q.excludeKeywordIds as number[] | undefined) ?? [], 'the supernatural veto vanished').toContain(777);
    expect((q.genreIds as number[] | undefined) ?? []).not.toContain(777);
    const surface = [q.subjectCanonical, ...((q.subjectLexemes as string[] | undefined) ?? [])].map((s) => String(s ?? '').toLowerCase());
    expect(surface.join(' ')).not.toMatch(/supernatural/);
  });
});
