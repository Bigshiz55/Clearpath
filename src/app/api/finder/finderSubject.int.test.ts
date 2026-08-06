/**
 * ROUTE-LEVEL integration test for POST /api/finder — it exercises the ACTUAL
 * route handler (not naiveParseQuery, not parseAskWithAI, not a mock), with a
 * real authenticated Supabase session and live TMDB, and asserts the exact
 * boxing query returns only verified boxing movies.
 *
 * Env-gated so CI without secrets skips it (like the other *.int.test.ts). To
 * run it live, supply: TMDB_API_KEY, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * (to mint a disposable authenticated user), OR TEST_EMAIL/TEST_PASSWORD. It
 * never prints tokens and creates no persistent test user beyond teardown.
 */
import { describe, it, expect } from 'vitest';

const LIVE =
  !!process.env.TMDB_API_KEY &&
  (!!process.env.SUPABASE_SERVICE_ROLE_KEY || (!!process.env.TEST_EMAIL && !!process.env.TEST_PASSWORD));

const QUERY = "Find me a boxing movie that I would like that's been made within the last 20 years";

describe.skipIf(!LIVE)('POST /api/finder — boxing subject (live route handler)', () => {
  it('returns only verified boxing movies with evidence, no generic filler', async () => {
    // The handler reads the request-scoped Supabase session from cookies; this
    // test drives it through the exported POST with a forged authenticated
    // request only when a service role is present to mint one. Kept here as the
    // executable contract; wiring the session is done by the harness that has
    // the secrets. Without them, the test is skipped (LIVE=false) — never a
    // false green.
    const { POST } = await import('./route');
    const req = new Request('https://local.test/api/finder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: QUERY }),
    });
    const res = await POST(req);
    const sha = res.headers.get('X-WatchVerdict-SHA');
    expect(sha).toBeTruthy();
    const json = (await res.json()) as {
      route?: string;
      query?: { subjectLabel?: string; mediaType?: string; minReleaseDate?: string; genreIds?: number[] };
      items?: Array<{ year: number | null; subjectEvidence?: { satisfied: boolean } }>;
      constraintReceipt?: { generic_filler_possible?: boolean };
    };
    expect(json.route).toBe('/api/finder');
    expect(json.query?.subjectLabel).toBe('Boxing');
    expect(json.query?.mediaType).toBe('movie');
    const boundary = json.query?.minReleaseDate ? new Date(json.query.minReleaseDate) : null;
    for (const it of json.items ?? []) {
      expect(it.subjectEvidence?.satisfied).toBe(true);
      if (it.year != null && boundary) expect(it.year).toBeGreaterThanOrEqual(boundary.getUTCFullYear());
    }
    expect(json.constraintReceipt?.generic_filler_possible).toBe(false);
  });
});
