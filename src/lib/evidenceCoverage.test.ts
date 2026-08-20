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

/**
 * DEGRADATION MUST BE A FACT, NOT A SENTENCE.
 *
 * THE DEFECT, FOUND BY THE DEPLOYED PROOF AT EXACT HEAD. The harness contract
 * is "the comparison changed the order, OR the deployment said it could not",
 * and it read the second half by matching the note against a hand-kept list of
 * phrasings. Adding an honest third disclosure — the `unavailable` case, which
 * exists precisely so the product stops asserting an absence it never measured
 * — therefore turned a working disclosure into a recorded silence. The product
 * told the truth and the contract could not hear it. `main` passed this check
 * and this branch failed it, on a change that made the product MORE honest.
 *
 * Copy is supposed to change. A contract pinned to copy fails on improvements
 * as loudly as on regressions, which is the third time that shape has cost this
 * repository a red gate in one pass. So the fact travels as a fact
 * (`diagnostics.critic.disclosed`) and the sentence stays free to be rewritten.
 *
 * These two must never disagree, which is what this file pins: every branch of
 * the degraded path pushes exactly one note, and the flag is that note's
 * existence rather than a second, independently-maintained condition.
 */
describe('a degraded comparison is observable without reading the copy', () => {
  it('the response carries the fact, derived from the note itself', () => {
    expect(route, 'diagnostics must state whether anything was disclosed').toMatch(
      /disclosed: criticNotes\.length > 0/,
    );
  });

  it('the degraded branch always says something — no silent arm', () => {
    const start = route.indexOf('if (!ranked.applied) {');
    expect(start, 'the degraded branch is gone').toBeGreaterThan(-1);
    const block = route.slice(start, route.indexOf('return NextResponse.json(', start));
    // Exactly one push, whose argument is a total ternary over the three cases.
    expect((block.match(/criticNotes\.push\(/g) ?? []).length).toBe(1);
    expect(block, 'the read-failed case').toMatch(/candidateEvidence\.status === 'unavailable'/);
    expect(block, 'the no-fingerprint case').toMatch(/fingerprinted === 0/);
    expect(block, 'the ran-but-moved-nothing case').toMatch(/didn.t separate these titles/);
    // No early return could skip the note.
    expect(block).not.toMatch(/\breturn\b/);
  });

  it('the note reaches every caller, not only a conversational one', () => {
    expect(route).toMatch(/interpretation: \[\.\.\.convInterpretation, \.\.\.criticNotes\]/);
  });
});

/**
 * THE HEALTH ENDPOINT MUST NOT SEND AN OPERATOR TO THE WRONG REMEDY.
 *
 * Measured on PRODUCTION, unauthenticated, during this pass:
 * `/api/health/showdown` reported `covered: 0, total: 113, usable: false` and
 * told the reader to run the classifier. But "the table holds nothing" and "we
 * could not read the table" arrive at that route as the same empty Map, and
 * only one of them is a coverage gap. An operator sent to the classifier for a
 * missing service-role key will run it, watch the number stay at zero, and
 * conclude the classifier is broken.
 *
 * The route's own docblock already makes this argument one level down — "'34 of
 * 46' and '0 of 46' are the same kind of broken to a boolean and very different
 * problems to an operator". This is the same sentence about the layer above it.
 */
describe('the coverage health endpoint separates an empty cache from an unreadable one', () => {
  const health = readFileSync(join(ROOT, 'src/app/api/health/showdown/route.ts'), 'utf8');

  it('reads the status, not just the rows', () => {
    expect(health).toMatch(/readCachedDimensions\(/);
    expect(health, 'the swallowing read must be gone').not.toMatch(/getCachedDimensions\(/);
    expect(health).toMatch(/evidence: evidence\.status/);
  });

  it('names a different remedy when the read never happened', () => {
    expect(health).toMatch(/couldNotLook/);
    expect(health).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(health, 'the classifier must not be offered for a read failure').toMatch(
      /the classifier will not fix it/,
    );
  });
});
