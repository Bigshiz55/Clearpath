/**
 * THE SCHEMA PROBE MUST BE ABLE TO ANSWER FROM THE CHANNEL THE ENVIRONMENT
 * ACTUALLY HAS — the same lesson the ledger reader learned on 2026-08-20.
 * Production holds a working direct Postgres connection and no REST service
 * key; the REST-only probe answered 503 about a database it could reach, on
 * the exact day the question was "was 0049_decision_runs actually applied?".
 *
 * These pin the two-channel contract: direct catalog read first (presence +
 * row-level-security state in one query), REST per-object fallback second,
 * both-fail named with closed-vocabulary codes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

let pgRows: Array<{ name: string; relkind: string; relrowsecurity: boolean }> = [];
let pgConnectError: Error | null = null;
/** The ledger table's simulated state, served to readLedgerTable's queries. */
let ledgerColumns: string[] = [];
let ledgerRls = false;
let ledgerCounts: { total: number; ok: number | null; latest: string | null } = { total: 0, ok: null, latest: null };
vi.mock('pg', () => ({
  Client: class {
    async connect() {
      if (pgConnectError) throw pgConnectError;
    }
    async query(sql: string) {
      if (/information_schema\.columns/.test(sql)) {
        return { rows: ledgerColumns.map((column_name) => ({ column_name })) };
      }
      if (/relname = 'schema_migrations'/.test(sql)) {
        return { rows: [{ relrowsecurity: ledgerRls }] };
      }
      if (/from public\.schema_migrations/.test(sql)) {
        return { rows: [ledgerCounts] };
      }
      return { rows: pgRows };
    }
    async end() {}
  },
}));

let adminAvailable = false;
const restPresent = new Set<string>();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (!adminAvailable) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    return {
      from: (object: string) => ({
        select: () => ({
          limit: async () =>
            restPresent.has(object) ? { error: null } : { error: { message: 'relation does not exist' } },
        }),
      }),
    };
  },
}));

beforeEach(() => {
  vi.resetModules();
  pgRows = [];
  pgConnectError = null;
  adminAvailable = false;
  restPresent.clear();
  ledgerColumns = [];
  ledgerRls = false;
  ledgerCounts = { total: 0, ok: null, latest: null };
  vi.stubEnv('SUPABASE_DB_URL', 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function get() {
  const { GET } = await import('./route');
  const res = await GET();
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** Every contract object present as an RLS-enabled table. */
async function allObjects(): Promise<Array<{ name: string; relkind: string; relrowsecurity: boolean }>> {
  const { SCHEMA_CONTRACT } = await import('@/lib/schemaContract');
  return [...new Set(SCHEMA_CONTRACT.map((r) => r.object))].map((name) => ({
    name,
    relkind: 'r',
    relrowsecurity: true,
  }));
}

describe('the direct catalog channel answers presence and RLS state', () => {
  it('a fully present, fully hardened schema is ok:200 via direct_db — no REST key needed', async () => {
    pgRows = await allObjects();
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.probeChannel).toBe('direct_db');
    expect(body.missingCount).toBe(0);
    expect(body.rlsDisabled).toEqual([]);
  });

  it('a missing decision_runs is NAMED with its migration — the 0049 application question, answerable', async () => {
    pgRows = (await allObjects()).filter((r) => r.name !== 'decision_runs');
    const { status, body } = await get();
    expect(status).toBe(503);
    const missing = body.missing as Array<{ object: string; migration: string }>;
    expect(missing.some((m) => m.object === 'decision_runs' && m.migration === '0049_decision_runs')).toBe(true);
    expect(body.unappliedMigrations).toContain('0049_decision_runs');
  });

  it('a present table with row security OFF is reported in rlsDisabled — the ledger-exposure class', async () => {
    pgRows = (await allObjects()).map((r) => (r.name === 'decision_runs' ? { ...r, relrowsecurity: false } : r));
    const { body } = await get();
    expect(body.rlsDisabled).toEqual(['decision_runs']);
    expect(body.missingCount).toBe(0);
  });
});

describe('the application ledger reports its own shape', () => {
  it('a legacy bare ledger is visible AS legacy: two columns, RLS off, no success accounting', async () => {
    pgRows = await allObjects();
    ledgerColumns = ['name', 'applied_at'];
    ledgerRls = false;
    ledgerCounts = { total: 33, ok: null, latest: '0046_security_advisor_hardening' };
    const { body } = await get();
    const lt = body.ledgerTable as Record<string, unknown>;
    expect(lt.exists).toBe(true);
    expect(lt.columns).toEqual(['name', 'applied_at']);
    expect(lt.rlsEnabled).toBe(false);
    expect(lt.rowCount).toBe(33);
    expect(lt.successCount).toBeNull();
    expect(lt.latestName).toBe('0046_security_advisor_hardening');
  });

  it('a modern hardened ledger reads back with its full shape and success accounting', async () => {
    pgRows = await allObjects();
    ledgerColumns = ['name', 'applied_at', 'filename', 'checksum', 'started_at', 'completed_at', 'success', 'error_message', 'error_code', 'execution_method', 'environment', 'reconciled', 'evidence'];
    ledgerRls = true;
    ledgerCounts = { total: 34, ok: 34, latest: '0049_decision_runs' };
    const { body } = await get();
    const lt = body.ledgerTable as Record<string, unknown>;
    expect(lt.rlsEnabled).toBe(true);
    expect(lt.successCount).toBe(34);
    expect(lt.latestName).toBe('0049_decision_runs');
  });
});

describe('fallback and failure stay honest', () => {
  it('no DB URL falls back to the REST per-object probe', async () => {
    vi.stubEnv('SUPABASE_DB_URL', '');
    adminAvailable = true;
    const { SCHEMA_CONTRACT } = await import('@/lib/schemaContract');
    for (const r of SCHEMA_CONTRACT) restPresent.add(r.object);
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.probeChannel).toBe('rest');
    expect(body.rlsDisabled).toEqual([]); // PostgREST cannot see RLS state
  });

  it('direct-DB failure falls through to REST; both failing names both channels without leaking', async () => {
    const err = new Error('getaddrinfo ENOTFOUND db.SECRETREF.supabase.co') as Error & { code: string };
    err.code = 'ENOTFOUND';
    pgConnectError = err;
    const { status, body } = await get();
    expect(status).toBe(503);
    expect(body.probeFailed).toContain('ENOTFOUND');
    expect(body.probeFailed).toContain('missing_key');
    expect(JSON.stringify(body)).not.toMatch(/SECRETREF|supabase\.co|postgres:/);
  });
});
