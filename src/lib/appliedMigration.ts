import 'server-only';
import { Client } from 'pg';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { sanitizeDbUrl, validateDbUrl } from '@/lib/adminMigrateUrl';
import type { LedgerStatus } from '@/lib/migrationLedger';

/**
 * WHAT THE DATABASE ACTUALLY HAS — read-only, always.
 *
 * This module NEVER triggers, repairs, applies or backfills a migration. It
 * reads the ledger and reports what it finds. /api/version is a diagnostic,
 * and a diagnostic that mutates state is how a "check" becomes an outage.
 *
 * TWO READ CHANNELS, because the 2026-08-20 incident proved one is not
 * enough: production held a working direct Postgres connection
 * (SUPABASE_DB_URL — the exact channel the migrate endpoint uses) and a
 * healthy, populated database, yet this module read the ledger EXCLUSIVELY
 * through the REST admin client, whose `serviceRoleKey()` throws when
 * SUPABASE_SERVICE_ROLE_KEY is absent. The one missing credential vetoed a
 * read the environment could serve, and /api/version answered "unavailable"
 * about a database that was fine.
 *
 *   1. DIRECT DB (preferred when configured): the same sanitized/validated
 *      `pg` connection the migrate route uses. Reads the repo ledger
 *      (public.schema_migrations, with its success/reconciled semantics)
 *      and, when that cannot answer, the Supabase CLI's own ledger
 *      (supabase_migrations.schema_migrations) — which PostgREST can never
 *      expose, so the direct channel is the ONLY way to read it.
 *   2. REST admin client (fallback): unchanged behavior for deployments
 *      configured with a privileged API key instead of a DB URL.
 *
 * It still refuses to guess. `cli_ledger` is a NAMED evidence source, not a
 * relaxation: the CLI wrote that row when it applied the migration. What
 * remains forbidden is answering from filenames, or reporting unreconciled
 * repo rows as fact — those still return 'unknown'.
 */
export interface AppliedMigrationInfo {
  appliedDatabaseMigration: string | 'unknown';
  migrationLedgerStatus: LedgerStatus;
}

const UNAVAILABLE: AppliedMigrationInfo = {
  appliedDatabaseMigration: 'unknown',
  migrationLedgerStatus: 'unavailable',
};

interface RepoLedgerRow { name: string; success: boolean; reconciled: boolean }

/** Decide from repo-ledger rows + optional CLI-ledger version. Pure. */
function conclude(rows: RepoLedgerRow[], cliVersion: string | null): AppliedMigrationInfo {
  const successes = rows.filter((r) => r.success);
  if (successes.some((r) => r.reconciled)) {
    // Sorted newest-first by the callers.
    return { appliedDatabaseMigration: successes[0]!.name, migrationLedgerStatus: 'reconciled' };
  }
  if (cliVersion) {
    return { appliedDatabaseMigration: cliVersion, migrationLedgerStatus: 'cli_ledger' };
  }
  if (successes.length > 0) {
    // Rows exist but were never proven and no CLI evidence exists — the
    // honest answer is still unknown.
    return { appliedDatabaseMigration: 'unknown', migrationLedgerStatus: 'unreconciled' };
  }
  return { appliedDatabaseMigration: 'unknown', migrationLedgerStatus: 'empty' };
}

/** Channel 1 — the direct Postgres connection the migrate endpoint uses. */
async function readViaDirectDb(rawUrl: string): Promise<AppliedMigrationInfo | null> {
  const dbUrl = sanitizeDbUrl(rawUrl);
  if (!validateDbUrl(dbUrl).ok) return null;
  let client: Client | null = null;
  try {
    client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();

    let repoRows: RepoLedgerRow[] = [];
    try {
      const res = await client.query(
        'select name, success, reconciled from public.schema_migrations where success = true order by name desc',
      );
      repoRows = (res.rows ?? []) as RepoLedgerRow[];
    } catch {
      /* repo ledger absent on this database — not an error, just no rows */
    }

    let cliVersion: string | null = null;
    if (!repoRows.some((r) => r.reconciled)) {
      try {
        const res = await client.query(
          'select version from supabase_migrations.schema_migrations order by version desc limit 1',
        );
        cliVersion = (res.rows?.[0]?.version as string | undefined) ?? null;
      } catch {
        /* CLI ledger schema absent — genuine no-evidence, never fabricated */
      }
    }

    return conclude(repoRows, cliVersion);
  } catch {
    return null; // connection-level failure: let the caller try the next channel
  } finally {
    await client?.end().catch(() => {});
  }
}

/** Channel 2 — the REST admin client (requires a privileged API key). */
async function readViaRest(): Promise<AppliedMigrationInfo | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('schema_migrations')
      .select('name, success, reconciled')
      .eq('success', true)
      .order('name', { ascending: false });
    if (error) return null;
    return conclude(((data ?? []) as RepoLedgerRow[]), null);
  } catch {
    return null;
  }
}

export async function getAppliedMigrationInfo(): Promise<AppliedMigrationInfo> {
  try {
    const dbUrl = serverEnv.migrationsDbUrl();
    if (dbUrl) {
      const viaDb = await readViaDirectDb(dbUrl);
      if (viaDb) return viaDb;
    }
    const viaRest = await readViaRest();
    if (viaRest) return viaRest;
    return UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
}
