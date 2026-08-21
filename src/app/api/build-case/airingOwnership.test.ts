/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE AIRING ARM'S SIBLINGS BELONG TO THE CANONICAL CLAUSE — TASK #36.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "AMC boxing movies tonight" reaches the guide with subject=boxing since
 * Task #34 — but the GENRE and the MEDIA TYPE riding beside that subject in
 * the same URL were still read from the whole raw sentence by two
 * independent readers. One URL, three parsers:
 *
 *   - `\b(movies?|films?)\b` word-test → type=movie even for
 *     "movies AND SHOWS", even for an anecdote's "movie";
 *   - detectGenre(raw text) → an anecdote's "funny" became the guide's
 *     Comedy filter over the request's own "thrillers".
 *
 * Now the media type IS the canonical reading and detectGenre keeps its one
 * TVmaze vocabulary but reads the REQUEST CLAUSE the canonical layer
 * isolated (raw-text fallback only when no clause was isolated). The world
 * is mocked at its boundary; the route's own decisions are real, and the
 * REDIRECT URL is the evidence.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function tableStub(table: string) {
  const chain = {
    insert: async () => ({ error: null }),
    upsert: async () => ({ error: null }),
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

vi.mock('@/lib/actions/quiz', () => ({ rateQuizTitle: async () => ({ ok: true }) }));
vi.mock('@/lib/tmdb/client', () => ({ searchTitles: vi.fn(async () => []) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock('@/lib/env', () => ({ serverEnv: { openaiKey: () => null } }));

async function post(text: string): Promise<{ redirect?: string; summary?: string }> {
  const { POST } = await import('./route');
  const res = await POST(new Request('https://local.test/api/build-case', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  }));
  return (await res.json()) as { redirect?: string; summary?: string };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the canonical clause owns the airing siblings', () => {
  it('"AMC boxing movies tonight" → guide with network, movie type AND the boxing subject', async () => {
    const { redirect } = await post('AMC boxing movies tonight');
    expect(redirect).toBeTruthy();
    const params = new URL(`https://x${redirect}`).searchParams;
    expect(params.get('network')).toBe('amc');
    expect(params.get('type')).toBe('movie');
    expect(params.get('q')).toBe('boxing');
  });

  it('"AMC movies and shows tonight" is BOTH media — the old word-test forced type=movie', async () => {
    /* The `\b(movies?|films?)\b` regex saw the word "movies" and filtered a
       both-media request down to movies. The canonical reading is 'either'.
       Eligibility correction: the guide now shows what was actually asked. */
    const { redirect } = await post('AMC movies and shows tonight');
    expect(redirect).toBeTruthy();
    const params = new URL(`https://x${redirect}`).searchParams;
    expect(params.get('network')).toBe('amc');
    expect(params.get('type')).toBeNull();
  });

  it("an anecdote's genre cannot become the guide's filter over the request's own", async () => {
    /* detectGenre(raw) matched the anecdote's "funny" (Comedy sits above
       Thriller in the table) and the request's "thrillers" lost. Scoped to
       the canonical request clause, the anecdote is not readable. */
    const { redirect } = await post('I watched a funny movie yesterday. AMC thrillers tonight');
    expect(redirect).toBeTruthy();
    const params = new URL(`https://x${redirect}`).searchParams;
    expect(params.get('genre')).toBe('Thriller');
  });

  it('a sentence the interpreter reads as a statement still routes on the raw-text fallback', async () => {
    /* "what is on AMC tonight" has no request clause to isolate
       (requestClause: ''); the fallback keeps the airing route working
       exactly as before — no genre invented, network preserved. */
    const { redirect } = await post('what is on AMC tonight');
    expect(redirect).toBeTruthy();
    const params = new URL(`https://x${redirect}`).searchParams;
    expect(params.get('network')).toBe('amc');
    expect(params.get('genre')).toBeNull();
  });
});
