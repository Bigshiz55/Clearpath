import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "NEVER SILENTLY NO-OP" — the TV Media diagnosability contract.
 *
 * TV Media stopped refreshing on August 3 and left NO trace: the old writer
 * returned `{ ok: false, ran: false }` with zero database writes when the key
 * was missing, so there was nothing for an operator to query. This suite pins
 * the replacement contract:
 *
 *  - every decision NOT to run writes a 'skipped' tv_ingestion_runs row with
 *    a machine-readable code;
 *  - failures are CLASSIFIED (auth vs rate-limit vs generic) so the operator
 *    knows what to fix;
 *  - a failed run never erases the record of the last real success, and
 *    coverage never advances without data — the two lies that made staleness
 *    unfalsifiable.
 */

const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

import { runTvMediaIngest, classifyFailure } from './tvMediaWriter';

const ENV_KEYS = ['TVMEDIA_API_KEY', 'TVMEDIA_LINEUP_ID', 'TVMEDIA_DEFAULT_ZIP'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  inserts.length = 0;
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('a decision not to run is a queryable fact, not an absence', () => {
  it('missing key: status=missing_key AND a skipped run row with that code', async () => {
    const result = await runTvMediaIngest(3);
    expect(result.ran).toBe(false);
    expect(result.status).toBe('missing_key');

    const runRows = inserts.filter((i) => i.table === 'tv_ingestion_runs');
    expect(runRows).toHaveLength(1);
    expect(runRows[0]!.row.status).toBe('skipped');
    expect(runRows[0]!.row.provider_id).toBe('tv_media');
    const errors = runRows[0]!.row.errors as Array<{ code: string; message: string }>;
    expect(errors[0]!.code).toBe('missing_key');
  });

  it('key set but no lineup/ZIP: status=not_configured, its own skipped row', async () => {
    process.env.TVMEDIA_API_KEY = 'test-key-value';
    const result = await runTvMediaIngest(3);
    expect(result.ran).toBe(false);
    expect(result.status).toBe('not_configured');
    const runRows = inserts.filter((i) => i.table === 'tv_ingestion_runs');
    expect(runRows).toHaveLength(1);
    expect((runRows[0]!.row.errors as Array<{ code: string }>)[0]!.code).toBe('not_configured');
  });

  it('the skipped row never leaks the key itself', async () => {
    process.env.TVMEDIA_API_KEY = 'sk-super-secret-value-123456';
    await runTvMediaIngest(3);
    expect(JSON.stringify(inserts)).not.toContain('sk-super-secret-value-123456');
  });
});

describe('failure classification tells the operator what to fix', () => {
  it('401/403/auth signatures -> auth_failed', () => {
    expect(classifyFailure(['2026-08-05: http_401 Unauthorized'])).toBe('auth_failed');
    expect(classifyFailure(['2026-08-05: http_403 Forbidden'])).toBe('auth_failed');
    expect(classifyFailure(['2026-08-05: invalid_key rejected'])).toBe('auth_failed');
  });

  it('429/rate-limit signatures -> rate_limited', () => {
    expect(classifyFailure(['2026-08-05: http_429 Too Many Requests'])).toBe('rate_limited');
    expect(classifyFailure(['2026-08-05: rate_limit exceeded'])).toBe('rate_limited');
  });

  it('anything else -> upstream_failed, never misdiagnosed as auth', () => {
    expect(classifyFailure(['2026-08-05: http_500 Internal Server Error'])).toBe('upstream_failed');
    expect(classifyFailure(['2026-08-05: timeout'])).toBe('upstream_failed');
    // Digits inside larger numbers must not trigger the code matchers.
    expect(classifyFailure(['2026-08-05: fetched 14290 rows then died'])).toBe('upstream_failed');
  });
});

describe('the two lies that made staleness unfalsifiable', () => {
  const writer = readFileSync(join(process.cwd(), 'src/lib/viewing/ingest/tvMediaWriter.ts'), 'utf8');

  it('a failed run never NULLs last_success_at — undefined skips the column', () => {
    expect(writer).toContain('last_success_at: fetchComplete ? nowIso : undefined');
    expect(writer).not.toContain('last_success_at: null');
  });

  it('coverage only advances when listings were actually fetched', () => {
    const update = writer.slice(writer.indexOf("from('tv_lineups').update"), writer.indexOf("from('tv_providers').update"));
    expect(update).toContain('allListings.length > 0');
    expect(update).toContain('coverage_end_utc');
  });
});

describe('gating and the workflow diagnostic', () => {
  it("skipped rows never satisfy the ingest gate — only success/partial count as 'ran'", () => {
    const gate = readFileSync(join(process.cwd(), 'src/lib/viewing/ingest/scheduledIngest.ts'), 'utf8');
    expect(gate).toContain("['success', 'partial']");
    expect(gate).not.toContain("'skipped'");
  });

  it('the GitHub workflow explains a 401 as a CRON_SECRET mismatch, actionably', () => {
    const wf = readFileSync(join(process.cwd(), '.github/workflows/tv-ingest-refresh.yml'), 'utf8');
    expect(wf).toContain('::error');
    expect(wf).toContain('CRON_SECRET');
  });
});
