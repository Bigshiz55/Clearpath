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
  if (terms.some((t) => /dark/i.test(t))) return [999];
  if (terms.some((t) => /gor/i.test(t))) return [888];
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

async function askFull(text: string): Promise<{ query: Record<string, unknown>; body: { kind?: string; interpretation?: string[] } }> {
  const { POST } = await import('./ask/route');
  const res = await POST(new Request('https://local.test/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  }));
  const body = (await res.json()) as { kind?: string; interpretation?: string[] };
  expect(body.kind, `route answered ${body.kind}, not a search`).toBe('search');
  const query = RAN.at(-1);
  expect(query, 'retrieval was never reached').toBeDefined();
  expect(Object.keys(query!).length).toBeGreaterThan(0);
  return { query: query!, body };
}

async function ask(text: string): Promise<Record<string, unknown>> {
  return (await askFull(text)).query;
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

describe('origin and audio are canonical fields, never a raw reparse', () => {
  it('ORIGIN: a background French anecdote does not constrain the request', async () => {
    const q = await ask('I watched a French movie yesterday. Give me a boxing movie.');
    expect((q.originCountries as string[] | undefined) ?? [], 'the anecdote origin leaked').toEqual([]);
    expect((q.originalLanguages as string[] | undefined) ?? []).toEqual([]);
  });

  it('ORIGIN: a background Korean anecdote does not constrain the request', async () => {
    const q = await ask('I watched a Korean movie yesterday. Give me a courtroom movie.');
    expect((q.originCountries as string[] | undefined) ?? []).toEqual([]);
    expect((q.originalLanguages as string[] | undefined) ?? []).toEqual([]);
  });

  it('AUDIO: background subtitles talk does not constrain the request', async () => {
    const q = await ask('I used English subtitles yesterday. Anyway, give me a boxing movie.');
    expect(Boolean(q.englishAudioOnly)).toBe(false);
    expect(Boolean(q.englishDubOnly)).toBe(false);
  });

  it('POSITIVE: "Give me a French thriller." keeps the origin AND the genre', async () => {
    const q = await ask('Give me a French thriller.');
    expect((q.originCountries as string[] | undefined) ?? []).toContain('FR');
    expect((q.genreIds as number[] | undefined) ?? []).toContain(53);
  });

  it('POSITIVE: "Give me a Korean movie dubbed in English." — origin, language, dub, and no Korean person', async () => {
    const { query: q, body } = await askFull('Give me a Korean movie dubbed in English.');
    expect((q.originCountries as string[] | undefined) ?? []).toContain('KR');
    expect((q.originalLanguages as string[] | undefined) ?? []).toContain('ko');
    expect(Boolean(q.englishDubOnly), 'dub strictness lost').toBe(true);
    expect((q.castIds as number[] | undefined) ?? [], '"Korean" was read as a person').toEqual([]);
    expect((body.interpretation ?? []).join(' ')).not.toMatch(/couldn.t find anyone/i);
    expect(q.mediaType).toBe('movie');
  });

  it('POSITIVE: "Give me a foreign movie with English audio." keeps the audio requirement', async () => {
    const q = await ask('Give me a foreign movie with English audio.');
    expect(Boolean(q.englishAudioOnly)).toBe(true);
    expect(Boolean(q.englishDubOnly)).toBe(false);
  });
});

describe('a veto the catalog has no canonical genre for still executes', () => {
  it('"no supernatural stuff" excludes through the shared alias map, never a positive', async () => {
    // `supernatural` is not a TMDB genre, but the shared PARSING alias map
    // (finderParse) already reads it as fantasy — the same reading the legacy
    // parser executed. The canonical mapping consumes that map, so the veto
    // lands in excludeGenreIds instead of vanishing.
    const q = await ask('Give me a thriller but no supernatural stuff.');
    expect((q.genreIds as number[] | undefined) ?? []).toContain(53);
    expect((q.excludeGenreIds as number[] | undefined) ?? [], 'the supernatural veto vanished').toContain(14);
    expect((q.genreIds as number[] | undefined) ?? []).not.toContain(14);
    const surface = [q.subjectCanonical, ...((q.subjectLexemes as string[] | undefined) ?? [])].map((s) => String(s ?? '').toLowerCase());
    expect(surface.join(' ')).not.toMatch(/supernatural/);
  });
});

describe('tones execute on the primitives the product already owns', () => {
  it('funny → the comedy genre, exactly as legacy executed it', async () => {
    const q = await ask('Give me a funny movie');
    expect((q.genreIds as number[] | undefined) ?? []).toContain(35);
  });

  it('scary → the horror genre', async () => {
    const q = await ask('Give me a scary movie');
    expect((q.genreIds as number[] | undefined) ?? []).toContain(27);
  });

  it('fast-paced → the pace primitive at 90', async () => {
    const q = await ask('Give me a fast-paced movie');
    expect(q.pace).toBe(90);
  });

  it('slow-burn → the pace primitive at 15', async () => {
    const q = await ask('Give me a slow-burn movie');
    expect(q.pace).toBe(15);
  });

  it('a tone with no executable owner is DISCLOSED, never silently dropped', async () => {
    const { query: q, body } = await askFull('Give me a dark movie');
    expect((q.genreIds as number[] | undefined) ?? []).toEqual([]);
    expect((body.interpretation ?? []).join(' ')).toMatch(/dark/i);
  });

  it('feel-good is disclosed the same way', async () => {
    const { body } = await askFull('Give me a feel-good movie');
    expect((body.interpretation ?? []).join(' ')).toMatch(/feel-?good/i);
  });

  it('NEGATED: "not too dark" becomes an exclusion, never a positive', async () => {
    const q = await ask('Give me something not too dark');
    expect((q.genreIds as number[] | undefined) ?? []).toEqual([]);
    expect((q.excludeKeywordIds as number[] | undefined) ?? [], 'the dark veto vanished').toContain(999);
  });

  it('NEGATED: "nothing gory" becomes an exclusion, never a positive', async () => {
    const q = await ask('Give me nothing gory');
    expect((q.genreIds as number[] | undefined) ?? []).toEqual([]);
    expect((q.excludeKeywordIds as number[] | undefined) ?? [], 'the gory veto vanished').toContain(888);
  });

  it('NEGATED non-tone: "without gore" keeps its keyword exclusion', async () => {
    const q = await ask('Give me a boxing movie without gore');
    expect((q.excludeKeywordIds as number[] | undefined) ?? []).toContain(888);
    expect(q.subjectCanonical).toBe('boxing');
  });
});
