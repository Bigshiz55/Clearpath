import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * ZERO AUTOMATIC TV MEDIA REQUESTS — proved at the ingest layer.
 *
 * TV Media is a metered provider that reached production from three separate
 * triggers: an hourly GitHub workflow (POST /api/tv/refresh), the daily Vercel
 * cron (/api/cron/daily-scan), and a callable route (/api/cron/tv-ingest). All
 * three funnel through `runGatedTvIngest`, and `runGatedTvIngest` funnels
 * through `runTvMediaIngest`.
 *
 * This suite pins both halves of the defence:
 *
 *   1. `runGatedTvIngest` refuses BEFORE taking a provider lease or reading a
 *      last-run timestamp, so a denied provider costs nothing per tick, and
 *   2. `runTvMediaIngest` refuses on its own account, so any OTHER caller —
 *      a script, a future route, an admin action — hits the same wall.
 *
 * A denial is `ok: true, ran: false` on purpose. Refusing to spend is a
 * correct outcome, not a fault; `/api/cron/tv-ingest` escalates only genuine
 * provider failures (auth_failed, rate_limited, upstream_failed) and must not
 * start alerting because the kill switch is doing its job.
 */

const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const rpcCalls: Array<{ fn: string; args: unknown }> = [];
const selectedTables: string[] = [];

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeAdmin(),
}));

function makeAdmin() {
  const chain = {
    select: () => chain, eq: () => chain, in: () => chain,
    gte: () => chain, order: () => chain,
    limit: () => Promise.resolve({ data: [], error: null }),
    then: (r: (v: { data: never[]; error: null }) => unknown) => r({ data: [], error: null }),
  };
  return {
    from: (table: string) => {
      selectedTables.push(table);
      return {
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return Promise.resolve({ error: null });
        },
        ...chain,
      };
    },
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: true, error: null });
    },
  };
}

const tvmazeIngest = vi.fn();
vi.mock('./tvmazeWriter', () => ({
  runTvmazeIngest: (...a: unknown[]) => tvmazeIngest(...a),
}));

import { runTvMediaIngest } from './tvMediaWriter';
import { runGatedTvIngest } from './scheduledIngest';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * `process.env.NODE_ENV` is typed read-only, but varying it is the whole
 * point of these cases — the guard's behaviour under `test` vs `production`
 * is a property under test, not an incidental detail. One narrow alias beats
 * a cast at each assignment.
 */
const env = process.env as Record<string, string | undefined>;

const ENV_KEYS = [
  'TVMEDIA_API_KEY', 'TVMEDIA_LINEUP_ID', 'TVMEDIA_DEFAULT_ZIP',
  'DATA_MODE', 'VERCEL_ENV', 'NODE_ENV', 'TVMEDIA_ENABLED',
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  inserts.length = 0;
  rpcCalls.length = 0;
  selectedTables.length = 0;
  tvmazeIngest.mockReset().mockResolvedValue({ inserted: 0, updated: 0 });
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Fully credentialed. Every refusal below is the mode alone, never a
  // missing key — otherwise these tests would pass for the wrong reason.
  process.env.TVMEDIA_API_KEY = 'test-key-not-a-real-credential';
  process.env.TVMEDIA_LINEUP_ID = '36617';
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe('runTvMediaIngest refuses to spend unless authorised', () => {
  it('reports egress_denied with a full key set and no DATA_MODE', async () => {
    const result = await runTvMediaIngest(3);
    expect(result.status).toBe('egress_denied');
    expect(result.ran).toBe(false);
    // Not a fault: the switch working is not an incident.
    expect(result.ok).toBe(true);
    expect(result.callsUsed).toBe(0);
  });

  it('leaves a queryable skipped run row naming the reason', async () => {
    await runTvMediaIngest(3);
    const runRows = inserts.filter((i) => i.table === 'tv_ingestion_runs');
    expect(runRows).toHaveLength(1);
    expect(runRows[0]!.row.status).toBe('skipped');
    const errors = runRows[0]!.row.errors as Array<{ code: string; message: string }>;
    expect(errors[0]!.code).toBe('egress_denied');
    expect(errors[0]!.message).toContain('tv_media');
    expect(errors[0]!.message).toMatch(/DATA_MODE|paid_live|TVMEDIA_ENABLED/);
  });

  it('names the production reason when the environment is production', async () => {
    // With VERCEL_ENV cleared the mode defaults to `fixture`, so the refusal
    // is `mode_is_fixture`. In a real deployment it is the paid-mode rule
    // that holds it — assert that one explicitly rather than infer it.
    process.env.VERCEL_ENV = 'production';
    env.NODE_ENV = 'production';
    const result = await runTvMediaIngest(3);
    expect(result.status).toBe('egress_denied');
    expect(result.reason).toContain('paid_adapter_needs_paid_mode');
  });

  it('never puts the API key in the recorded reason', async () => {
    process.env.TVMEDIA_API_KEY = 'super-secret-value';
    const result = await runTvMediaIngest(3);
    expect(JSON.stringify(result)).not.toContain('super-secret-value');
    expect(JSON.stringify(inserts)).not.toContain('super-secret-value');
  });

  it('still refuses in paid_live without the enable flag', async () => {
    process.env.DATA_MODE = 'paid_live';
    expect((await runTvMediaIngest(3)).status).toBe('egress_denied');
  });

  it('still reports missing_key first when there is no key at all', async () => {
    // Ordering matters: an operator seeing egress_denied should be able to
    // conclude the credentials are fine and only the mode is holding it.
    delete process.env.TVMEDIA_API_KEY;
    expect((await runTvMediaIngest(3)).status).toBe('missing_key');
  });

  it('reports not_configured before egress_denied when no lineup is set', async () => {
    delete process.env.TVMEDIA_LINEUP_ID;
    expect((await runTvMediaIngest(3)).status).toBe('not_configured');
  });
});

describe('runGatedTvIngest short-circuits TV Media before any cost', () => {
  it('returns egress_denied without taking a provider lease', async () => {
    const { tvmedia } = await runGatedTvIngest(createAdminClient() as never);
    expect(tvmedia.status).toBe('egress_denied');
    expect(tvmedia.ran).toBe(false);
    const tvMediaLocks = rpcCalls.filter(
      (c) => c.fn === 'tv_try_acquire_ingest_lock'
        && (c.args as { p_provider_id: string }).p_provider_id === 'tv_media',
    );
    expect(tvMediaLocks).toHaveLength(0);
  });

  it('writes no tv_ingestion_runs row for TV Media on a denied tick', async () => {
    // The hourly workflow ticks 24 times a day. A skipped row per tick, for a
    // decision that has not changed, is noise that buries the real history.
    await runGatedTvIngest(createAdminClient() as never);
    const tvMediaRuns = inserts.filter(
      (i) => i.table === 'tv_ingestion_runs' && i.row.provider_id === 'tv_media',
    );
    expect(tvMediaRuns).toHaveLength(0);
  });

  it('does not stop the free TVmaze pipeline', async () => {
    const { tvmaze } = await runGatedTvIngest(createAdminClient() as never);
    expect(tvmazeIngest).toHaveBeenCalledTimes(1);
    expect((tvmaze as { ran: boolean }).ran).toBe(true);
  });

  it('carries a reason a human can act on', async () => {
    process.env.VERCEL_ENV = 'production';
    env.NODE_ENV = 'production';
    const { tvmedia } = await runGatedTvIngest(createAdminClient() as never);
    expect(tvmedia.reason).toContain('paid_adapter_needs_paid_mode');
    expect(tvmedia.reason).toMatch(/paid_live/);
  });
});
