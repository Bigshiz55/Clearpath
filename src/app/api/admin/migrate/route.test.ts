/**
 * THE MIGRATION RUNNER'S FAILURE BEHAVIOR IS PART OF THE UNATTENDED PATH.
 *
 * The apply-migrations workflow's PATH 2 decides success with
 * `test "$code" = "200"` — so whatever this route returns IS the workflow's
 * verdict. Before these tests, the route answered 200/ok:true even when a
 * migration FAILED (it recorded the failure row, kept going, and summarized
 * with ok:true), which means an unattended run could half-apply a sequence,
 * go green, and leave the wreckage for the next person to find. These pin:
 *
 *   - a failed migration STOPS the run: nothing after it is attempted
 *     (later migrations may depend on the failed one),
 *   - a run containing any failure answers non-200 / ok:false and NAMES the
 *     migration that failed,
 *   - the failure is recorded success=false so a later run retries it and
 *     nothing reads it as applied,
 *   - selection is evidence-based: app-ledger rows, then the CLI's own
 *     ledger; a sparse app ledger never causes applied history to rerun,
 *   - repeat runs with nothing pending are pure no-ops,
 *   - a missing or malformed connection string is a clear, closed failure —
 *     never an attempt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

/** A tiny three-migration registry so selection/failure behavior is exact. */
vi.mock('@/lib/pendingMigrations', () => {
  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
  return {
    PENDING_MIGRATIONS: [
      { name: '0001_alpha', sqlB64: b64('create table alpha()') },
      { name: '0002_beta', sqlB64: b64('create table beta()') },
      { name: '0003_gamma', sqlB64: b64('create table gamma()') },
    ],
  };
});

interface AppRow { name: string; checksum: string | null; success: boolean; reconciled: boolean }
let appLedgerRows: AppRow[] = [];
/** 'absent' simulates a database with no supabase_migrations schema at all. */
let cliNames: string[] | 'absent' = [];
let failSql: Set<string> = new Set();
/** Every migration SQL string the mock actually executed, in order. */
let executed: string[] = [];
/** Every ledger INSERT's [name, ..., success] params, in order. */
let ledgerWrites: Array<{ name: string; success: boolean }> = [];

vi.mock('pg', () => ({
  Client: class {
    async connect() {}
    async query(sql: string, params?: unknown[]) {
      if (/create table if not exists public\.schema_migrations/.test(sql)) return { rows: [] };
      if (/pg_advisory_lock|pg_advisory_unlock/.test(sql)) return { rows: [] };
      if (/select name, checksum, success, reconciled from public\.schema_migrations/.test(sql)) {
        return { rows: appLedgerRows };
      }
      if (/from supabase_migrations\.schema_migrations/.test(sql)) {
        if (cliNames === 'absent') throw new Error('schema "supabase_migrations" does not exist');
        return { rows: cliNames.map((name) => ({ name })) };
      }
      if (/^begin$|^commit$|^rollback$/i.test(sql.trim())) return { rows: [] };
      if (/insert into public\.schema_migrations/.test(sql)) {
        const p = params as [string, string, string, string, ...unknown[]];
        ledgerWrites.push({ name: p[0], success: /,true,/.test(sql.replace(/\s+/g, '')) });
        return { rows: [] };
      }
      if (/NOTIFY pgrst/.test(sql)) return { rows: [] };
      // Anything else is a migration's own SQL.
      if (failSql.has(sql)) throw new Error('relation already exists');
      executed.push(sql);
      return { rows: [] };
    }
    async end() {}
  },
}));

beforeEach(() => {
  vi.resetModules();
  appLedgerRows = [];
  cliNames = [];
  failSql = new Set();
  executed = [];
  ledgerWrites = [];
  vi.stubEnv('SUPABASE_DB_URL', 'postgresql://postgres:pw@db.example.supabase.co:5432/postgres');
  vi.stubEnv('MIGRATE_SECRET', 'test-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function post(auth = 'Bearer test-secret') {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/admin/migrate', {
      method: 'POST',
      headers: auth ? { authorization: auth, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
      body: '{}',
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const ck = (sql: string) => {
  // Same sha256 the route computes — imported lazily to share the mock env.
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(sql, 'utf8').digest('hex');
};

describe('selection is evidence-based and ordered', () => {
  it('everything recorded with matching checksums → no-op: nothing executes, 200, applied 0', async () => {
    appLedgerRows = [
      { name: '0001_alpha', checksum: ck('create table alpha()'), success: true, reconciled: false },
      { name: '0002_beta', checksum: ck('create table beta()'), success: true, reconciled: false },
      { name: '0003_gamma', checksum: ck('create table gamma()'), success: true, reconciled: false },
    ];
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(executed).toEqual([]);
    expect(body.applied).toBe(0);
    // Run it AGAIN — repeat execution stays a pure no-op.
    const again = await post();
    expect(again.status).toBe(200);
    expect(executed).toEqual([]);
  });

  it('one genuinely pending migration runs — and only it', async () => {
    appLedgerRows = [
      { name: '0001_alpha', checksum: ck('create table alpha()'), success: true, reconciled: false },
      { name: '0002_beta', checksum: ck('create table beta()'), success: true, reconciled: false },
    ];
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(executed).toEqual(['create table gamma()']);
    expect(body.applied).toBe(1);
    expect(ledgerWrites).toEqual([{ name: '0003_gamma', success: true }]);
  });

  it('SPARSE app ledger + CLI evidence: applied history is never re-executed, the genuinely new one still runs', async () => {
    appLedgerRows = []; // the sparse ledger — records nothing at all
    cliNames = ['0001_alpha', '0002_beta']; // the CLI applied the history
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(executed).toEqual(['create table gamma()']);
    expect(body.applied).toBe(1);
  });

  it('multiple pending migrations apply in deterministic registry order', async () => {
    appLedgerRows = [
      { name: '0001_alpha', checksum: ck('create table alpha()'), success: true, reconciled: false },
    ];
    const { status } = await post();
    expect(status).toBe(200);
    expect(executed).toEqual(['create table beta()', 'create table gamma()']);
  });
});

describe('a failure stops the run and is surfaced, never papered over', () => {
  it('the failed migration is recorded success=false, later migrations are NOT attempted, and the response is non-200 naming it', async () => {
    appLedgerRows = [
      { name: '0001_alpha', checksum: ck('create table alpha()'), success: true, reconciled: false },
    ];
    failSql = new Set(['create table beta()']);
    const { status, body } = await post();
    // beta failed -> gamma must not run (it may depend on beta).
    expect(executed).toEqual([]);
    expect(ledgerWrites).toEqual([{ name: '0002_beta', success: false }]);
    expect(status).toBeGreaterThanOrEqual(500);
    expect(body.ok).toBe(false);
    expect(body.failed).toBe('0002_beta');
    const results = body.results as Array<{ name: string; ok: boolean }>;
    expect(results.some((r) => r.name === '0002_beta' && r.ok === false)).toBe(true);
    expect(results.some((r) => r.name === '0003_gamma')).toBe(false);
  });

  it('a checksum-mismatch halt is a failure answer too, not a 200', async () => {
    appLedgerRows = [
      { name: '0001_alpha', checksum: ck('something that is not the current sql'), success: true, reconciled: false },
    ];
    const { status, body } = await post();
    expect(status).toBeGreaterThanOrEqual(500);
    expect(body.ok).toBe(false);
    expect(body.failed).toBe('0001_alpha');
    expect(executed).toEqual([]); // nothing after the halt either
  });
});

describe('credentials and connection strings fail closed', () => {
  it('no configured database URL → 503, no connection attempted', async () => {
    vi.stubEnv('SUPABASE_DB_URL', '');
    const { status } = await post();
    expect(status).toBe(503);
    expect(executed).toEqual([]);
  });

  it('a malformed database URL is rejected by validation before any connection', async () => {
    vi.stubEnv('SUPABASE_DB_URL', 'not-a-postgres-url');
    const { status, body } = await post();
    expect(status).toBe(503);
    expect(body.stage).toBe('validate');
    expect(executed).toEqual([]);
  });

  it('no bearer and no admin session → 403', async () => {
    const { status } = await post('');
    expect(status).toBe(403);
    expect(executed).toEqual([]);
  });
});
