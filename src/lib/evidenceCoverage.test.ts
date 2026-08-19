/**
 * A COUNT OF ZERO MEANS NOTHING IF WE COULD NOT LOOK.
 *
 * THE MEASUREMENT THAT EXPOSED THIS. A deployed comparative request reported
 * `43 candidate(s), 0 fingerprinted` and the product told the reader "none of
 * them has a profile on file yet". That sentence is a claim of FACT about the
 * catalog, and every read underneath it collapsed three different outcomes into
 * the same empty Map: the table holds no matching row, the table does not
 * exist, and the service-role client could not be constructed at all. A system
 * that cannot tell a miss from an outage will eventually say something false
 * with complete confidence — and it will say it in the calm voice it uses for
 * everything else.
 *
 * These tests pin the distinction at the read, at the disclosure that consumes
 * it, and at the backfill that reports it. They deliberately do NOT test that
 * coverage is high: coverage is an operational fact about a deployment, and
 * asserting a number here would be inventing evidence rather than reading it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const route = readFileSync(join(ROOT, 'src/app/api/ask/route.ts'), 'utf8');
const cron = readFileSync(join(ROOT, 'src/app/api/cron/classify/route.ts'), 'utf8');

const VALID = Object.fromEntries(
  ['pacing', 'darkness', 'warmth', 'humor', 'suspense', 'emotion', 'complexity', 'realism',
   'character', 'stakes', 'morality', 'violence', 'attention', 'serialized', 'romance'].map((k) => [k, 50]),
);

/** Build the module with a stubbed admin client, so the read is the unit. */
async function readWith(impl: unknown) {
  vi.resetModules();
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: impl }));
  const mod = await import('./titleDimensions');
  return mod.readCachedDimensions;
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.doUnmock('@/lib/supabase/admin'));

describe('the read reports whether it happened', () => {
  const KEYS = [
    { tmdb_id: 238, media_type: 'movie' as const },
    { tmdb_id: 155, media_type: 'movie' as const },
  ];

  it('an honest empty catalog is ok with zero rows — a miss, and we may say so', async () => {
    const read = await readWith(() => ({
      from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }),
    }));
    const r = await read(KEYS);
    expect(r.status).toBe('ok');
    expect(r.dims.size).toBe(0);
    expect(r.requested).toBe(2);
  });

  it('a missing table is UNAVAILABLE, not an empty catalog', async () => {
    const read = await readWith(() => ({
      from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'relation "title_dimensions" does not exist' } }) }) }),
    }));
    const r = await read(KEYS);
    expect(r.status, 'a postgrest error was read as "no title has a fingerprint"').toBe('unavailable');
    expect(r.dims.size).toBe(0);
  });

  it('a client that cannot be built at all is UNAVAILABLE', async () => {
    const read = await readWith(() => { throw new Error('missing SUPABASE_SERVICE_ROLE_KEY'); });
    const r = await read(KEYS);
    expect(r.status).toBe('unavailable');
    expect(r.requested, 'the denominator survives an outage').toBe(2);
  });

  it('a throwing query is UNAVAILABLE', async () => {
    const read = await readWith(() => ({
      from: () => ({ select: () => ({ in: async () => { throw new Error('ECONNRESET'); } }) }),
    }));
    expect((await read(KEYS)).status).toBe('unavailable');
  });

  it('real rows come back keyed media-type-first, and only valid ones', async () => {
    const read = await readWith(() => ({
      from: () => ({ select: () => ({ in: async () => ({
        data: [
          { tmdb_id: 238, media_type: 'movie', dims: VALID },
          { tmdb_id: 155, media_type: 'movie', dims: { nonsense: true } },
        ],
        error: null,
      }) }) }),
    }));
    const r = await read(KEYS);
    expect(r.status).toBe('ok');
    expect([...r.dims.keys()]).toEqual(['movie-238']);
  });

  /* THE CONTROL, AND THE REASON THE NEW SHAPE EXISTS. The Map-returning API is
     still exported and still used where absence is harmless — and it is still
     incapable of telling these three apart, which is exactly why anything that
     SPEAKS about the absence must not use it. */
  it('the old Map-only API cannot distinguish any of them — all three are just empty', async () => {
    for (const impl of [
      () => ({ from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }) }),
      () => ({ from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'missing table' } }) }) }) }),
      () => { throw new Error('no service role key'); },
    ]) {
      vi.resetModules();
      vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: impl }));
      const mod = await import('./titleDimensions');
      expect((await mod.getCachedDimensions(KEYS)).size).toBe(0);
    }
  });

  it('asking about nothing is ok, never unavailable', async () => {
    const read = await readWith(() => { throw new Error('should not be built'); });
    const r = await read([]);
    expect(r.requested).toBe(0);
  });
});

describe('the disclosure distinguishes the three cases', () => {
  it('says we could not look, when we could not look', () => {
    expect(route).toMatch(/candidateEvidence\.status === 'unavailable'/);
    expect(route).toMatch(/I couldn't check what I know about these titles just now/);
  });

  it('still says "none has a profile yet" only when the read actually happened', () => {
    const block = route.slice(route.indexOf('if (!ranked.applied)'), route.indexOf('if (!ranked.applied)') + 1400);
    const unavailableAt = block.indexOf("=== 'unavailable'");
    const noProfileAt = block.indexOf('none of them has a profile on file yet');
    expect(unavailableAt).toBeGreaterThan(-1);
    expect(noProfileAt).toBeGreaterThan(unavailableAt);
  });

  it('the diagnostics carry the read status beside the count', () => {
    expect(route).toMatch(/evidence: candidateEvidence\.status/);
  });
});

describe('the backfill can be measured without being run', () => {
  it('report mode classifies nothing and writes nothing', () => {
    expect(cron).toMatch(/searchParams\.get\('report'\) === '1'/);
    const block = cron.slice(cron.indexOf('if (reportOnly) {'), cron.indexOf('if (reportOnly) {') + 600);
    expect(block).toMatch(/mode: 'report'/);
    expect(block).toMatch(/classified: 0/);
  });

  it('measures even with no classifier key — the deployment most likely to have a gap', () => {
    expect(cron).toMatch(/if \(!reportOnly && !serverEnv\.openaiKey\(\)\)/);
  });

  it('keeps the same secret gate — no new surface', () => {
    const gate = cron.slice(0, cron.indexOf('reportOnly'));
    expect(gate).toMatch(/Unauthorized/);
    expect(gate).toMatch(/cronSecret\(\)/);
  });

  it('reports catalog coverage, not only the fixed diagnostic set', () => {
    expect(cron).toMatch(/catalogCoverage/);
    expect(cron).toMatch(/evidence: evidence\.status/);
  });
});
