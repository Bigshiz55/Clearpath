/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE HOME BOX'S CONTRACT: A REQUEST IS ANSWERED, NEVER LEARNED FROM ALONE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The production reproduction this pins: a signed-in user typed "a boxing
 * movie" into State Your Case and got "Locked in: loves a boxing movie" plus
 * the generic Watch Now feed. Two defects in one utterance:
 *
 *   1. ROUTING — the request never reached the canonical Ask door, because
 *      the route decision knew verbs, counts and person-shapes but not the
 *      bare noun-phrase request English actually uses.
 *   2. POLLUTION — taste writes ran BEFORE the route decision, so the LLM
 *      read the request's nouns as a taste statement, returned
 *      likedTitles:["a boxing movie"], and `seedTitle` RATED A REAL TITLE
 *      9/10 on the user's behalf — a permanent, fabricated preference.
 *
 * The harness mocks the world (supabase, TMDB, the LLM fetch, the quiz
 * rating action); the route's own decision-making is real. The captured
 * writes are the evidence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbCalls: Array<{ table: string; op: string; args: unknown }> = [];
function tableStub(table: string) {
  const chain = {
    insert: async (rows: unknown) => { dbCalls.push({ table, op: 'insert', args: rows }); return { error: null }; },
    upsert: async (rows: unknown) => { dbCalls.push({ table, op: 'upsert', args: rows }); return { error: null }; },
    select: () => chain,
    eq: () => chain,
    in: async () => ({ data: [] }),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-under-test' } }, error: null }) },
    from: (table: string) => tableStub(table),
  }),
}));

const rateQuizTitle = vi.fn(async (_args: unknown) => ({ ok: true }));
vi.mock('@/lib/actions/quiz', () => ({ rateQuizTitle: (a: unknown) => rateQuizTitle(a) }));

vi.mock('@/lib/tmdb/client', () => ({
  searchTitles: vi.fn(async (q: string) => [
    { id: 42, mediaType: 'movie', title: `Top hit for ${q}`, year: 2001, posterPath: null },
  ]),
}));

vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock('@/lib/env', () => ({ serverEnv: { openaiKey: () => 'test-key' } }));

/** The LLM, behaving exactly as production showed it behaves: it extracts
 *  "taste" from whatever text it is given — request nouns included. */
const llmSeen: string[] = [];
vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: { body?: string }) => {
  if (String(url).includes('api.openai.com')) {
    const body = JSON.parse(init?.body ?? '{}') as { messages?: Array<{ role: string; content: string }> };
    const user = body.messages?.find((m) => m.role === 'user')?.content ?? '';
    llmSeen.push(user);
    const out = /boxing movie/i.test(user) && !/love/i.test(user)
      ? { axes: [{ key: 'pacing', target: 70, confidence: 0.6 }], likedTitles: ['a boxing movie'], avoidTitles: [] }
      : /slow burns|boxing movies/i.test(user)
        ? { axes: [{ key: 'pacing', target: 30, confidence: 0.7 }], likedTitles: [], avoidTitles: [] }
        : { axes: [], likedTitles: [], avoidTitles: [] };
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(out) } }] }),
    } as unknown as Response;
  }
  throw new Error(`unexpected fetch: ${String(url)}`);
}));

async function buildCase(text: string): Promise<{ redirect?: string; summary?: string; learned?: boolean; stay?: boolean }> {
  const { POST } = await import('./route');
  const res = await POST(new Request('https://local.test/api/build-case', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  }));
  return (await res.json()) as { redirect?: string; summary?: string; learned?: boolean };
}

const tasteWrites = () => dbCalls.filter((c) => c.table === 'dimension_signals');

beforeEach(() => {
  dbCalls.length = 0;
  llmSeen.length = 0;
  rateQuizTitle.mockClear();
});

describe('the production reproduction — requests route and never pollute', () => {
  for (const text of ['a boxing movie', 'another boxing movie']) {
    it(`"${text}" reaches the canonical Ask door with zero taste writes`, async () => {
      const d = await buildCase(text);
      expect(d.redirect, `"${text}" did not route — production fell to the generic feed here`).toBeDefined();
      expect(new URL(d.redirect!, 'http://x').pathname).toBe('/app/ask');
      expect(new URL(d.redirect!, 'http://x').searchParams.get('q')).toBe(text);
      expect(rateQuizTitle, 'a request fabricated a loved-title rating').not.toHaveBeenCalled();
      expect(tasteWrites(), 'a request wrote dimension signals').toEqual([]);
      expect(d.summary ?? '').not.toMatch(/locked in/i);
      expect(d.learned).toBe(false);
    });
  }

  it('the durable contrast: "I love boxing movies" LEARNS and does not route', async () => {
    const d = await buildCase('I love boxing movies');
    expect(d.redirect, 'a durable preference statement was hijacked into a search').toBeUndefined();
    expect(tasteWrites().length, 'the statement did not build DNA').toBeGreaterThan(0);
    expect(d.learned).toBe(true);
  });

  it('a mixed utterance routes AND keeps only its durable half as evidence', async () => {
    const d = await buildCase('I love slow burns but I hate gore. Give me a thriller tonight.');
    expect(d.redirect).toBeDefined();
    expect(new URL(d.redirect!, 'http://x').pathname).toBe('/app/ask');
    // The stated taste ("I love slow burns…") is durable and may write…
    expect(tasteWrites().length).toBeGreaterThan(0);
    // …but the LLM must never have seen the REQUEST clause's nouns.
    expect(llmSeen.join(' '), 'the request clause leaked into taste extraction').not.toMatch(/give me|thriller tonight/i);
  });

  it('a companion request routes and writes nothing for the user', async () => {
    const d = await buildCase('a romantic comedy for my wife');
    expect(d.redirect).toBeDefined();
    expect(new URL(d.redirect!, 'http://x').pathname).toBe('/app/ask');
    expect(tasteWrites()).toEqual([]);
    expect(rateQuizTitle).not.toHaveBeenCalled();
  });

  it("a companion statement never becomes the user's own DNA", async () => {
    const d = await buildCase('My wife likes comedies');
    expect(d.redirect).toBeUndefined();
    expect(tasteWrites(), "the wife's taste was written to the user's profile").toEqual([]);
    expect(llmSeen.join(' '), 'the companion clause reached taste extraction').not.toMatch(/wife/i);
  });
});
