import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * THE CRON ROUTE'S TWO CONTRACTS, PINNED.
 *
 *  1. AUTH — a bare public hit must never spend provider calls. With
 *     CRON_SECRET set, only the exact bearer token (or ?key=) gets through;
 *     everything else is 401 BEFORE any ingest work happens. This is the
 *     boundary the GitHub workflow's 401s proved was working — the mismatch
 *     was between the two stored secrets, not in this check.
 *
 *  2. STATUS CODES — 502 is reserved for a provider actually FAILING
 *     upstream (auth_failed / rate_limited / upstream_failed). A missing or
 *     unconfigured key is a configuration STATE that answers 200; answering
 *     502 for it every hour is what buried the one real signal this status
 *     code carries.
 */

const runGatedTvIngest = vi.fn();
vi.mock('@/lib/viewing/ingest/scheduledIngest', () => ({
  runGatedTvIngest: (...args: unknown[]) => runGatedTvIngest(...args),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({}),
}));

import { GET } from './route';

const healthyNoOp = {
  tvmaze: { ran: false, reason: 'Already ran today.' },
  tvmedia: { ok: true, ran: false, status: 'success', reason: 'Ran within the last 2h.' },
};

const req = (init?: { auth?: string; key?: string }) =>
  new Request(
    `http://localhost/api/cron/tv-ingest${init?.key ? `?key=${init.key}` : ''}`,
    init?.auth ? { headers: { authorization: init.auth } } : undefined,
  );

beforeEach(() => {
  runGatedTvIngest.mockReset().mockResolvedValue(healthyNoOp);
  process.env.CRON_SECRET = 'test-cron-secret';
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe('auth: the boundary the workflow 401s proved', () => {
  it('no credentials -> 401, and the ingest is never invoked', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(runGatedTvIngest).not.toHaveBeenCalled();
  });

  it('a WRONG bearer token -> 401 — the exact mismatch symptom', async () => {
    const res = await GET(req({ auth: 'Bearer not-the-secret' }));
    expect(res.status).toBe(401);
    expect(runGatedTvIngest).not.toHaveBeenCalled();
  });

  it('the CORRECT bearer token -> 200 and the ingest runs', async () => {
    const res = await GET(req({ auth: 'Bearer test-cron-secret' }));
    expect(res.status).toBe(200);
    expect(runGatedTvIngest).toHaveBeenCalledTimes(1);
  });

  it('the ?key= form works for schedulers that cannot set headers', async () => {
    const res = await GET(req({ key: 'test-cron-secret' }));
    expect(res.status).toBe(200);
    expect(runGatedTvIngest).toHaveBeenCalledTimes(1);
  });
});

describe('status codes: config states are 200, upstream failures are 502', () => {
  const withTvMedia = (status: string, ok = false) => ({
    ...healthyNoOp,
    tvmedia: { ok, ran: false, status, reason: status },
  });

  it('missing key answers 200 — configuration is not an upstream failure', async () => {
    runGatedTvIngest.mockResolvedValue(withTvMedia('missing_key'));
    expect((await GET(req({ key: 'test-cron-secret' }))).status).toBe(200);
  });

  it('unconfigured lineup answers 200 for the same reason', async () => {
    runGatedTvIngest.mockResolvedValue(withTvMedia('not_configured'));
    expect((await GET(req({ key: 'test-cron-secret' }))).status).toBe(200);
  });

  it.each(['auth_failed', 'rate_limited', 'upstream_failed'])(
    'a real provider failure (%s) answers 502',
    async (status) => {
      runGatedTvIngest.mockResolvedValue(withTvMedia(status));
      expect((await GET(req({ key: 'test-cron-secret' }))).status).toBe(502);
    },
  );

  it('a TVmaze failure answers 502 even when TV Media is fine', async () => {
    runGatedTvIngest.mockResolvedValue({
      ...healthyNoOp,
      tvmaze: { ran: true, ok: false, reason: 'upstream 500' },
    });
    expect((await GET(req({ key: 'test-cron-secret' }))).status).toBe(502);
  });

  it('the response body carries BOTH provider results — one failing never hides the other', async () => {
    runGatedTvIngest.mockResolvedValue(withTvMedia('auth_failed'));
    const body = await (await GET(req({ key: 'test-cron-secret' }))).json();
    expect(body.tvmaze).toBeDefined();
    expect(body.tvmedia.status).toBe('auth_failed');
  });
});
