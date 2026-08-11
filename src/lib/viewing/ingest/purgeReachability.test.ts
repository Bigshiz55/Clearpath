import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * THE PURGE MUST BE REACHABLE ON EVERY EXIT PATH.
 *
 * The station purge shipped, its own unit tests passed, and it removed nothing
 * from production for a full day — because it was written as a statement above
 * the final `return` of `runGatedTvIngest`, and TWO guard clauses return before
 * reaching it. Production sits permanently inside the second one: `DATA_MODE`
 * is `free_live`, TV Media is metered, so `mayCallUpstream` denies with
 * `paid_adapter_needs_paid_mode` and the function returns three lines later.
 * The purge was unreachable in the only environment that had rows to purge.
 *
 * Nothing in the existing suites could see that. `carriedStations.test.ts`
 * tests the DECISION (is this key still carried), `tvmazeWriter` tests the
 * DELETE, and neither can observe that the caller never calls them. The defect
 * lived entirely in control flow, so this suite tests control flow: for each
 * way `runGatedTvIngest` can return, was the purge invoked, and did its result
 * reach the caller.
 *
 * The second assertion is not redundant. `/api/tv/refresh` returning no `purge`
 * key is the signal that exposed this, and it is the signal an operator will
 * look at next time — a purge that runs but whose result is dropped on one
 * branch would be just as invisible as one that never ran.
 */

const purge = vi.fn();
const tvmazeIngest = vi.fn();
const tvmazeNationalIngest = vi.fn();
const tvMediaIngest = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin() }));

function makeAdmin() {
  const chain = {
    select: () => chain, eq: () => chain, neq: () => chain, in: () => chain,
    like: () => chain, gte: () => chain, lt: () => chain, order: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
    then: (r: (v: { data: never[]; error: null }) => unknown) => r({ data: [], error: null }),
  };
  return {
    from: () => ({ insert: () => Promise.resolve({ error: null }), ...chain }),
    rpc: () => Promise.resolve({ data: true, error: null }),
  };
}

vi.mock('./tvmazeWriter', () => ({
  runTvmazeIngest: (...a: unknown[]) => tvmazeIngest(...a),
  runTvmazeNationalIngest: (...a: unknown[]) => tvmazeNationalIngest(...a),
  purgeUncarriedNationalStations: (...a: unknown[]) => purge(...a),
}));
vi.mock('./tvMediaWriter', () => ({
  runTvMediaIngest: (...a: unknown[]) => tvMediaIngest(...a),
}));

import { runGatedTvIngest } from './scheduledIngest';
import { createAdminClient } from '@/lib/supabase/admin';

/** `NODE_ENV` is typed read-only; varying it IS the property under test here. */
const env = process.env as Record<string, string | undefined>;
const ENV_KEYS = [
  'DATA_MODE', 'VERCEL_ENV', 'NODE_ENV', 'TVMEDIA_ENABLED',
  'TVMEDIA_API_KEY', 'TVMEDIA_LINEUP_ID',
] as const;
const saved: Record<string, string | undefined> = {};

const PURGED = { ran: true as const, stationsPurged: ['tvmaze-net:nbc-com'], airingsDeleted: 7 };

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  purge.mockReset().mockResolvedValue(PURGED);
  tvmazeIngest.mockReset().mockResolvedValue({ inserted: 0, updated: 0 });
  tvmazeNationalIngest.mockReset().mockResolvedValue({ inserted: 0, updated: 0 });
  tvMediaIngest.mockReset().mockResolvedValue({ ok: true, ran: true, status: 'success' });
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else env[k] = saved[k];
  }
});

/**
 * The three ways out of `runGatedTvIngest`, named by the condition that
 * produces them rather than by line number, so the case survives a refactor.
 */
const EXITS: { name: string; setup: () => void }[] = [
  {
    // Guard clause 1: production with no DATA_MODE. Every adapter disabled.
    name: 'unconfigured production deployment (CONFIGURATION_ERROR)',
    setup: () => {
      env.VERCEL_ENV = 'production';
      delete process.env.DATA_MODE;
    },
  },
  {
    // Guard clause 2 — THE PRODUCTION CASE. Configured and free sources run,
    // but the metered adapter is refused, and the function returned there.
    name: 'TV Media egress denied (the state production is actually in)',
    setup: () => {
      env.DATA_MODE = 'free_live';
      env.TVMEDIA_API_KEY = 'test-key-not-a-real-credential';
    },
  },
  {
    // The only path that ever reached the purge before this fix.
    name: 'full run with TV Media permitted',
    setup: () => {
      env.DATA_MODE = 'paid_live';
      env.TVMEDIA_ENABLED = '1';
      env.NODE_ENV = 'production';
      env.VERCEL_ENV = 'production';
      env.TVMEDIA_API_KEY = 'test-key-not-a-real-credential';
    },
  },
];

describe('runGatedTvIngest — the purge is on every exit, not just the last one', () => {
  for (const exit of EXITS) {
    it(`runs the purge when returning via: ${exit.name}`, async () => {
      exit.setup();
      const result = await runGatedTvIngest(createAdminClient() as never);

      expect(purge, 'the purge was never called on this path').toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('purge');
      expect((result as { purge: unknown }).purge).toEqual(PURGED);
    });
  }

  it('passes the SAME admin client the ingest is using — not a second connection', async () => {
    env.DATA_MODE = 'free_live';
    const admin = createAdminClient() as never;
    await runGatedTvIngest(admin);
    expect(purge).toHaveBeenCalledWith(admin);
  });

  it('a failing purge is isolated: the ingest result still returns, marked failed', async () => {
    env.DATA_MODE = 'free_live';
    purge.mockRejectedValue(new Error('station read failed'));

    const result = await runGatedTvIngest(createAdminClient() as never);

    // Isolated, not swallowed — the reason has to be readable at /api/tv/refresh.
    expect(result).toHaveProperty('tvmaze');
    expect(result.purge).toMatchObject({ ok: false, ran: false, status: 'failed' });
    expect((result.purge as { reason: string }).reason).toContain('station read failed');
  });

  it('the denied paths still spend nothing upstream — the purge is a local delete', async () => {
    env.VERCEL_ENV = 'production';
    delete process.env.DATA_MODE;
    await runGatedTvIngest(createAdminClient() as never);

    // The whole reason it is safe to run the purge past a closed egress gate:
    // it reads the channel registry and our own rows, and calls no provider.
    expect(tvMediaIngest).not.toHaveBeenCalled();
    expect(tvmazeIngest).not.toHaveBeenCalled();
    expect(tvmazeNationalIngest).not.toHaveBeenCalled();
    expect(purge).toHaveBeenCalledTimes(1);
  });
});

describe('the shape of the defect, not just this instance of it', () => {
  it('every return in runGatedTvIngest goes through withPurge', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/lib/viewing/ingest/scheduledIngest.ts'), 'utf8');

    // Only the body of runGatedTvIngest — helpers above it return freely.
    const start = src.indexOf('export async function runGatedTvIngest');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start);

    // A `return {` inside this function is the exact shape of the bug: an exit
    // that hands back a result object without the purge attached. Adding a new
    // guard clause is fine; adding one that returns bare is what must fail.
    const bareObjectReturns = body.match(/\n\s{2}return \{/g) ?? [];
    expect(
      bareObjectReturns,
      'a guard clause returns a result object directly — route it through withPurge(admin, {...})',
    ).toEqual([]);
  });
});
