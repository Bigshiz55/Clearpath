import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * THE RUNTIME MUST BE ABLE TO READ THE LEDGER THE ENVIRONMENT ACTUALLY HAS.
 *
 * Production reproduction (2026-08-20, environment verified by the owner):
 * the database is healthy, `supabase_migrations.schema_migrations` is
 * populated, and the deployment holds a working direct Postgres connection
 * (`migrations_db_url: true` on /api/health) — yet /api/version reported
 * `appliedDatabaseMigration: "unknown", migrationLedgerStatus: "unavailable"`.
 * Root cause: `getAppliedMigrationInfo` read the ledger EXCLUSIVELY through
 * the REST admin client, whose `serviceRoleKey()` is `required()` — it throws
 * when SUPABASE_SERVICE_ROLE_KEY is absent, so the one credential that was
 * missing vetoed a read the environment could serve through the same `pg`
 * channel the migrate endpoint itself uses.
 *
 * These pin the repaired contract:
 *   1. with a configured DB URL and no service key, the ledger is READ;
 *   2. the CLI's own ledger (supabase_migrations.schema_migrations) counts as
 *      explicit evidence, reported under its own status — never 'unknown';
 *   3. failure states stay explicit: nothing reachable → 'unavailable'.
 */

const pgQueries: string[] = [];
let pgScript: Array<{ rows: Array<Record<string, unknown>> } | Error> = [];
let pgConnectError: Error | null = null;

vi.mock('server-only', () => ({}));
vi.mock('pg', () => ({
  Client: class {
    async connect() {
      if (pgConnectError) throw pgConnectError;
    }
    async query(sql: string) {
      pgQueries.push(sql);
      const next = pgScript.shift();
      if (!next) return { rows: [] };
      if (next instanceof Error) throw next;
      return next;
    }
    async end() {}
  },
}));

const adminRows: Array<Record<string, unknown>> = [];
let adminAvailable = false;
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (!adminAvailable) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: async () => ({ data: adminRows, error: null }),
    };
    return { from: () => chain };
  },
}));

beforeEach(() => {
  vi.resetModules();
  pgQueries.length = 0;
  pgScript = [];
  pgConnectError = null;
  adminRows.length = 0;
  adminAvailable = false;
  vi.stubEnv('SUPABASE_DB_URL', 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function read() {
  const { getAppliedMigrationInfo } = await import('./appliedMigration');
  return getAppliedMigrationInfo();
}

describe('the ledger is readable through the channel the environment actually has', () => {
  it('reads the reconciled repo ledger over the direct DB connection — no service key needed', async () => {
    pgScript = [
      { rows: [{ name: '0047_decision_runs', success: true, reconciled: true }] },
    ];
    const out = await read();
    expect(out.migrationLedgerStatus, 'the missing REST key vetoed a readable ledger').toBe('reconciled');
    expect(out.appliedDatabaseMigration).toBe('0047_decision_runs');
  });

  it("the CLI's own ledger is explicit evidence, reported under its own status", async () => {
    pgScript = [
      { rows: [] }, // public.schema_migrations — empty (the repo ledger was never written)
      { rows: [{ version: '0048_title_knowledge' }] }, // supabase_migrations.schema_migrations
    ];
    const out = await read();
    expect(out.migrationLedgerStatus).toBe('cli_ledger');
    expect(out.appliedDatabaseMigration).toBe('0048_title_knowledge');
  });

  it('an unreconciled repo ledger still defers to CLI evidence when it exists', async () => {
    pgScript = [
      { rows: [{ name: '0031_something', success: true, reconciled: false }] },
      { rows: [{ version: '0048_title_knowledge' }] },
    ];
    const out = await read();
    expect(out.migrationLedgerStatus).toBe('cli_ledger');
    expect(out.appliedDatabaseMigration).toBe('0048_title_knowledge');
  });

  it('no evidence anywhere stays honest: unreconciled repo rows alone are not an answer', async () => {
    pgScript = [
      { rows: [{ name: '0031_something', success: true, reconciled: false }] },
      { rows: [] },
    ];
    const out = await read();
    expect(out.migrationLedgerStatus).toBe('unreconciled');
    expect(out.appliedDatabaseMigration).toBe('unknown');
  });

  it('FAILURE STAYS EXPLICIT: DB unreachable and no REST key → unavailable, never a guess', async () => {
    pgConnectError = new Error('connection refused');
    const out = await read();
    expect(out.migrationLedgerStatus).toBe('unavailable');
    expect(out.appliedDatabaseMigration).toBe('unknown');
  });

  it('the REST path still works when only the service key is configured', async () => {
    vi.stubEnv('SUPABASE_DB_URL', '');
    adminAvailable = true;
    adminRows.push({ name: '0046_security_advisor_hardening', success: true, reconciled: true });
    const out = await read();
    expect(out.migrationLedgerStatus).toBe('reconciled');
    expect(out.appliedDatabaseMigration).toBe('0046_security_advisor_hardening');
  });
});

/**
 * AN UNAVAILABLE LEDGER NAMES ITS OWN CAUSE — WITHOUT LEAKING ANYTHING.
 *
 * The first production deploy of the two-channel reader answered
 * `unavailable` and could not say why: every failure collapsed into the same
 * null, so the only way to diagnose it was redeploying guesses. These pin the
 * repaired contract: each failed channel reports a closed-vocabulary code
 * (a Node errno, a Postgres SQLSTATE, 'validate_rejected', 'missing_key'),
 * a healthy read carries no diagnostics at all, and no code ever contains a
 * URL, hostname or credential fragment — a pg connect error interpolates the
 * hostname into its MESSAGE, which is exactly why messages never travel.
 */
describe('an unavailable ledger names its own cause', () => {
  it('a connect failure reports its errno per channel, and the REST gap its missing key', async () => {
    const err = new Error('connect ETIMEDOUT db.example.supabase.co:5432') as Error & { code: string };
    err.code = 'ETIMEDOUT';
    pgConnectError = err;
    const out = await read();
    expect(out.migrationLedgerStatus).toBe('unavailable');
    expect(out.ledgerChannels).toEqual({ directDb: 'ETIMEDOUT', rest: 'missing_key' });
  });

  it('a rejected connection string is named as validation, not as a connect error', async () => {
    vi.stubEnv('SUPABASE_DB_URL', 'postgresql://user:p@ss@db.example.supabase.co:5432/postgres');
    const out = await read();
    expect(out.ledgerChannels?.directDb).toBe('validate_rejected');
  });

  it('no configured DB URL says so, rather than pretending the channel failed', async () => {
    vi.stubEnv('SUPABASE_DB_URL', '');
    const out = await read();
    expect(out.migrationLedgerStatus).toBe('unavailable');
    expect(out.ledgerChannels).toEqual({ directDb: 'not_configured', rest: 'missing_key' });
  });

  it('NEVER LEAKS: the diagnostic carries no hostname, credential or URL fragment', async () => {
    const err = new Error('getaddrinfo ENOTFOUND db.SECRETREF.supabase.co') as Error & { code: string };
    err.code = 'ENOTFOUND';
    pgConnectError = err;
    const out = await read();
    const serialized = JSON.stringify(out);
    expect(serialized).not.toMatch(/SECRETREF|supabase\.co|postgres:|secret/i);
    expect(out.ledgerChannels?.directDb).toBe('ENOTFOUND');
  });

  it('an error with no structural code degrades to its constructor name, never its message', async () => {
    pgConnectError = Object.assign(new RangeError('boom with db.example.supabase.co inside'), { code: 42 });
    const out = await read();
    expect(out.ledgerChannels?.directDb).toBe('RangeError');
  });

  it('a HEALTHY read carries no diagnostics at all — the shape that always was', async () => {
    pgScript = [
      { rows: [{ name: '0047_decision_runs', success: true, reconciled: true }] },
    ];
    const out = await read();
    expect(out.migrationLedgerStatus).toBe('reconciled');
    expect(out.ledgerChannels).toBeUndefined();
  });

  it('a REST answer after a direct-DB failure still names the channel that failed', async () => {
    const err = new Error('refused') as Error & { code: string };
    err.code = 'ECONNREFUSED';
    pgConnectError = err;
    adminAvailable = true;
    adminRows.push({ name: '0046_security_advisor_hardening', success: true, reconciled: true });
    const out = await read();
    expect(out.migrationLedgerStatus).toBe('reconciled');
    expect(out.appliedDatabaseMigration).toBe('0046_security_advisor_hardening');
    expect(out.ledgerChannels).toEqual({ directDb: 'ECONNREFUSED' });
  });
});

describe('the privileged key accepts the new Supabase secret-key format', () => {
  it('serviceRoleKey() resolves SUPABASE_SECRET_KEY (sb_secret_…) when the legacy var is absent', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test_value_not_a_real_key');
    const { serverEnv } = await import('./env');
    expect(serverEnv.serviceRoleKey()).toBe('sb_secret_test_value_not_a_real_key');
  });
});
