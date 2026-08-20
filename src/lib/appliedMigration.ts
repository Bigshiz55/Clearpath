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
 * AN UNAVAILABLE LEDGER NAMES ITS OWN CAUSE. The first deployment of the
 * two-channel reader answered `unavailable` on production and could not say
 * why: every failure collapsed into the same `null`, so diagnosing it meant
 * redeploying with guesses. Each channel now reports a SANITIZED reason —
 * a structural code (`validate_rejected`, `ETIMEDOUT`, `28P01`, `missing_key`)
 * and never a URL, hostname, message or any fragment of a secret. The codes
 * are Node error codes / Postgres SQLSTATEs the operator can act on without
 * being handed anything an attacker could use.
 *
 * It still refuses to guess. `cli_ledger` is a NAMED evidence source, not a
 * relaxation: the CLI wrote that row when it applied the migration. What
 * remains forbidden is answering from filenames, or reporting unreconciled
 * repo rows as fact — those still return 'unknown'.
 */
export interface AppliedMigrationInfo {
  appliedDatabaseMigration: string | 'unknown';
  migrationLedgerStatus: LedgerStatus;
  /**
   * WHY the ledger read landed where it did, per channel — present only when
   * a channel was tried and failed, so a healthy read stays exactly the shape
   * it always was. Values are closed-vocabulary codes, never free text from
   * an error object (a pg connect error's message contains the hostname).
   */
  ledgerChannels?: {
    directDb?: string;
    rest?: string;
  };
}

interface RepoLedgerRow { name: string; success: boolean; reconciled: boolean }

/** A channel's outcome: an answer, or a sanitized reason it has none. */
type ChannelResult =
  | { ok: true; info: AppliedMigrationInfo }
  | { ok: false; reason: string };

/**
 * Reduce an unknown thrown value to a structural code that is safe to
 * publish. `code` on Node/pg errors is an errno ('ETIMEDOUT', 'ENOTFOUND')
 * or a Postgres SQLSTATE ('28P01' bad password, '3D000' no such database) —
 * fixed vocabularies with no secret content. Anything else is reported only
 * by its constructor name; error MESSAGES are never forwarded, because a
 * connect failure interpolates the hostname into its message.
 */
function sanitizedErrorCode(err: unknown): string {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z0-9_]{2,32}$/i.test(code)) return code;
    const name = (err as { name?: unknown }).name;
    if (typeof name === 'string' && name.length <= 64) return name;
  }
  return 'unknown_error';
}

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
async function readViaDirectDb(rawUrl: string): Promise<ChannelResult> {
  const dbUrl = sanitizeDbUrl(rawUrl);
  if (!validateDbUrl(dbUrl).ok) return { ok: false, reason: 'validate_rejected' };
  let client: Client | null = null;
  try {
    client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      // A diagnostic read must fail fast, never hang the endpoint that
      // exists to answer "is this deployed yet". pg's default is no limit.
      connectionTimeoutMillis: 5000,
    });
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

    return { ok: true, info: conclude(repoRows, cliVersion) };
  } catch (err) {
    // Connection-level failure: report WHICH kind, let the caller try the
    // next channel. The code is structural; the message never leaves here.
    return { ok: false, reason: sanitizedErrorCode(err) };
  } finally {
    await client?.end().catch(() => {});
  }
}

/** Channel 2 — the REST admin client (requires a privileged API key). */
async function readViaRest(): Promise<ChannelResult> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('schema_migrations')
      .select('name, success, reconciled')
      .eq('success', true)
      .order('name', { ascending: false });
    if (error) return { ok: false, reason: error.code || 'rest_query_failed' };
    return { ok: true, info: conclude(((data ?? []) as RepoLedgerRow[]), null) };
  } catch {
    // createAdminClient throws precisely when no privileged key is
    // configured under either accepted name — the one code this channel
    // needs to be able to say out loud.
    return { ok: false, reason: 'missing_key' };
  }
}

export async function getAppliedMigrationInfo(): Promise<AppliedMigrationInfo> {
  const channels: { directDb?: string; rest?: string } = {};
  try {
    const dbUrl = serverEnv.migrationsDbUrl();
    if (dbUrl) {
      const viaDb = await readViaDirectDb(dbUrl);
      if (viaDb.ok) return viaDb.info;
      channels.directDb = viaDb.reason;
    } else {
      channels.directDb = 'not_configured';
    }
    const viaRest = await readViaRest();
    if (viaRest.ok) return { ...viaRest.info, ledgerChannels: channels };
    channels.rest = viaRest.reason;
    return {
      appliedDatabaseMigration: 'unknown',
      migrationLedgerStatus: 'unavailable',
      ledgerChannels: channels,
    };
  } catch (err) {
    return {
      appliedDatabaseMigration: 'unknown',
      migrationLedgerStatus: 'unavailable',
      ledgerChannels: { ...channels, rest: channels.rest ?? sanitizedErrorCode(err) },
    };
  }
}
