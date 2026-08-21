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
  /**
   * The newest applied migration by MOST RECENT EVIDENCE, in that ledger's
   * OWN identity system: a repo filename ('0049_decision_runs') when the
   * repo/runner ledger answers, a CLI timestamp version ('20260812164511')
   * when the CLI ledger answers. The two systems are never merged into a
   * fake shared identity — `migrationLedgerStatus` names which one this is,
   * and `appliedMigrationName` / `cliLedger` / `runnerLedger` carry the
   * other system's answer alongside so neither is hidden.
   */
  appliedDatabaseMigration: string | 'unknown';
  migrationLedgerStatus: LedgerStatus;
  /**
   * The HUMAN name of the applied answer, when the ledger records one: for a
   * CLI answer this is the CLI row's own `name` column (e.g.
   * '0047_watchlist_provenance' beside version '20260812164511'); for a
   * repo/runner answer it equals appliedDatabaseMigration. Absent when the
   * ledger has no name to give — never invented from a filename scan.
   */
  appliedMigrationName?: string;
  /** CLI-ledger evidence, whenever it was readable — even when the repo
   *  ledger won the scalar. Version is the CLI's timestamp identity. */
  cliLedger?: { version: string; name: string | null };
  /** Newest checksummed runner-ledger row, when the CLI won the scalar —
   *  so the runner's own record stays visible beside the CLI's. */
  runnerLedger?: { name: string };
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

interface RepoLedgerRow {
  name: string;
  success: boolean;
  reconciled: boolean;
  /** Written by the modern runner at commit time; null on legacy bare rows. */
  checksum?: string | null;
  completed_at?: string | null;
}

/** The CLI ledger's own row: timestamp version + (on newer CLI schemas) name. */
interface CliLedgerRow { version: string; name: string | null }

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
export function sanitizedErrorCode(err: unknown): string {
  if (err && typeof err === 'object') {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && /^[A-Z0-9_]{2,32}$/i.test(code)) return code;
    const name = (err as { name?: unknown }).name;
    if (typeof name === 'string' && name.length <= 64) return name;
  }
  return 'unknown_error';
}

/** A CLI version is its own timestamp ('20260812164511' → epoch ms), so the
 *  two ledgers' evidence can be ordered IN TIME without merging identities. */
function cliVersionTime(version: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(version);
  if (!m) return 0;
  return Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +m[6]!);
}

/**
 * Decide from repo-ledger rows + optional CLI-ledger evidence. Pure.
 *
 * TWO IDENTITY SYSTEMS, NEVER CONFLATED: repo rows are named by filename
 * ('0049_decision_runs'); CLI rows are versioned by timestamp
 * ('20260812164511') with their own name column beside it. When both hold
 * evidence, the scalar answer goes to whichever recorded evidence MORE
 * RECENTLY — and the other ledger's answer always travels alongside it
 * (`cliLedger` / `runnerLedger`), so /api/version hides neither. Before
 * this, a migration the runner applied AFTER the CLI's last write stayed
 * invisible: the reader trusted only `reconciled` rows, and the runner
 * never sets that flag — its checksummed commit-time rows are first-class
 * evidence of their own.
 */
function conclude(rows: RepoLedgerRow[], cli: CliLedgerRow | null): AppliedMigrationInfo {
  const successes = rows.filter((r) => r.success);
  const cliInfo = cli ? { cliLedger: { version: cli.version, name: cli.name } } : {};
  if (successes.some((r) => r.reconciled)) {
    // Sorted newest-first by the callers. Reconciliation is the strongest
    // evidence tier; the CLI answer still rides along when it was read.
    const name = successes[0]!.name;
    return { appliedDatabaseMigration: name, appliedMigrationName: name, migrationLedgerStatus: 'reconciled', ...cliInfo };
  }
  // Modern runner rows: checksummed at commit time by the route/CLI runner.
  // Legacy bare rows (no checksum) prove nothing and stay out of this tier.
  const proven = successes.filter((r) => typeof r.checksum === 'string' && r.checksum !== '');
  const newestProven = proven[0] ?? null; // callers sort name-desc
  if (newestProven && cli) {
    const runnerTime = newestProven.completed_at ? Date.parse(newestProven.completed_at) : 0;
    if (runnerTime > cliVersionTime(cli.version)) {
      return {
        appliedDatabaseMigration: newestProven.name,
        appliedMigrationName: newestProven.name,
        migrationLedgerStatus: 'runner_ledger',
        ...cliInfo,
      };
    }
    return {
      appliedDatabaseMigration: cli.version,
      ...(cli.name ? { appliedMigrationName: cli.name } : {}),
      migrationLedgerStatus: 'cli_ledger',
      ...cliInfo,
      runnerLedger: { name: newestProven.name },
    };
  }
  if (newestProven) {
    return {
      appliedDatabaseMigration: newestProven.name,
      appliedMigrationName: newestProven.name,
      migrationLedgerStatus: 'runner_ledger',
    };
  }
  if (cli) {
    return {
      appliedDatabaseMigration: cli.version,
      ...(cli.name ? { appliedMigrationName: cli.name } : {}),
      migrationLedgerStatus: 'cli_ledger',
      ...cliInfo,
    };
  }
  if (successes.length > 0) {
    // Bare legacy rows exist but were never proven and no CLI evidence
    // exists — the honest answer is still unknown.
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
        'select name, success, reconciled, checksum, completed_at from public.schema_migrations where success = true order by name desc',
      );
      repoRows = (res.rows ?? []) as RepoLedgerRow[];
    } catch {
      /* repo ledger absent on this database — not an error, just no rows */
    }

    let cli: CliLedgerRow | null = null;
    if (!repoRows.some((r) => r.reconciled)) {
      // The CLI ledger's `name` column exists on newer CLI schemas only;
      // fall back to version-alone so an older ledger still answers.
      try {
        const res = await client.query(
          'select version, name from supabase_migrations.schema_migrations order by version desc limit 1',
        );
        const row = res.rows?.[0] as { version?: string; name?: string | null } | undefined;
        if (row?.version) cli = { version: row.version, name: row.name ?? null };
      } catch {
        try {
          const res = await client.query(
            'select version from supabase_migrations.schema_migrations order by version desc limit 1',
          );
          const version = (res.rows?.[0]?.version as string | undefined) ?? null;
          if (version) cli = { version, name: null };
        } catch {
          /* CLI ledger schema absent — genuine no-evidence, never fabricated */
        }
      }
    }

    return { ok: true, info: conclude(repoRows, cli) };
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
      .select('name, success, reconciled, checksum, completed_at')
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
