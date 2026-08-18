import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * NO PAID CLASSIFICATION IN A BULK REQUEST PATH.
 *
 * `computeUserProfile` backfills missing fingerprints by calling gpt-4o-mini,
 * bounded to BACKFILL_CAP per build. That is right for /app/dna and the title
 * page, which build a profile deliberately and rarely. It is wrong for Ask,
 * which is a bulk request path where CLAUDE.md forbids an LLM call outright.
 *
 * These tests exercise the REAL module — no mock of titleDimensions itself —
 * and watch the network. The assertion is not "we intended not to classify";
 * it is "no request reached api.openai.com".
 */

const RATED = [{ tmdb_id: 501, media_type: 'movie', rating: 9 }];

/** An admin client with rated titles and an EMPTY fingerprint cache, which is
 *  exactly the state that tempts the backfill into firing. */
function adminStub() {
  return {
    from(table: string) {
      const rows =
        table === 'watchlist_items' ? RATED
        : table === 'title_dimensions' ? []
        : [];
      const result = Promise.resolve({ data: rows, error: null });
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'not', 'in', 'limit']) {
        chain[m] = () => Object.assign(result, chain);
      }
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      chain.upsert = () => Promise.resolve({ data: null, error: null });
      return Object.assign(result, chain);
    },
  };
}

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({
  // Pass-through: we are testing the computation, not Next's cache.
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminStub() }));
vi.mock('@/lib/tmdb/client', () => ({
  getTitle: async () => ({
    id: 501, mediaType: 'movie', title: 'Anything', year: 2020,
    genres: ['Drama'], keywords: [], overview: 'x',
  }),
}));
vi.mock('@/lib/env', () => ({
  // A key IS present — so if the classifier is reachable, it WILL fire.
  serverEnv: { openaiKey: () => 'sk-test-key-present' },
}));

const { getUserDimensionProfile } = await import('./titleDimensions');

let openaiCalls: string[] = [];

beforeEach(() => {
  openaiCalls = [];
  vi.stubGlobal('fetch', async (url: unknown) => {
    const u = String(url);
    if (u.includes('api.openai.com')) openaiCalls.push(u);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
  });
});

describe('getUserDimensionProfile — backfill is opt-OUT-able', () => {
  it('DEFAULT still classifies, so the deliberate surfaces keep their behaviour', async () => {
    await getUserDimensionProfile({} as never, 'user-1', 1);
    expect(openaiCalls.length).toBeGreaterThan(0);
  });

  it('backfill:false reaches api.openai.com ZERO times', async () => {
    await getUserDimensionProfile({} as never, 'user-2', 0, { backfill: false });
    expect(openaiCalls).toEqual([]);
  });

  it('backfill:false still returns a usable profile rather than throwing', async () => {
    const profile = await getUserDimensionProfile({} as never, 'user-3', 0, { backfill: false });
    expect(profile).toBeTruthy();
    expect(typeof profile.samples).toBe('number');
  });
});
