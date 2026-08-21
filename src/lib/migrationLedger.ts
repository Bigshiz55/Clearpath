import 'server-only';
import { createHash } from 'node:crypto';

/**
 * THE MIGRATION LEDGER — the database's own record of what actually ran.
 *
 * Built because the previous arrangement had no trustworthy answer to "what
 * schema does production have?". The admin route applied migrations and
 * recorded nothing; scripts/migrate.ts kept a bare (name) table but was
 * removed from the build pipeline; and /api/version filled the vacuum with
 * the newest FILE in the repo, which is not evidence of anything. That is how
 * the endpoint came to report 0042 while the database sat at 0041.
 *
 * Rules this module exists to enforce:
 *   - A ledger row is written ONLY after a migration completes successfully.
 *   - A failed or partially-run migration is never recorded as success.
 *   - A migration is skipped only when BOTH its identifier and its checksum
 *     match. Changed SQL under an applied name is a hard stop, not a rerun.
 *   - The ledger is never backfilled from filenames. Presence of a file is
 *     not evidence of application; only schema probes are (see reconcile.ts).
 */

/** Bootstrapped by the runner, not by a migration — avoids a chicken/egg. */
export const LEDGER_DDL = `
create table if not exists public.schema_migrations (
  name            text primary key,
  filename        text,
  checksum        text not null,
  started_at      timestamptz,
  completed_at    timestamptz,
  success         boolean not null default false,
  error_message   text,
  error_code      text,
  execution_method text,
  environment     text,
  reconciled      boolean not null default false,
  evidence        text
);
-- Older deployments may already have the bare (name, applied_at) table.
alter table public.schema_migrations add column if not exists filename         text;
alter table public.schema_migrations add column if not exists checksum         text;
alter table public.schema_migrations add column if not exists started_at       timestamptz;
alter table public.schema_migrations add column if not exists completed_at     timestamptz;
alter table public.schema_migrations add column if not exists success          boolean not null default false;
alter table public.schema_migrations add column if not exists error_message    text;
alter table public.schema_migrations add column if not exists error_code       text;
alter table public.schema_migrations add column if not exists execution_method text;
alter table public.schema_migrations add column if not exists environment      text;
alter table public.schema_migrations add column if not exists reconciled       boolean not null default false;
alter table public.schema_migrations add column if not exists evidence         text;
-- BORN HARDENED. The ledger records what DDL ran and what may be skipped —
-- an anon-writable ledger row can poison skip/halt decisions (a forged
-- success row suppresses a migration; a forged checksum halts the run).
-- Migration 0046 hardens this table too, but only 'if exists' — on a fresh
-- database where the runner creates the table AFTER 0046 ran, that guard
-- skipped forever and the table sat exposed (observed on production,
-- 2026-08-21). The DDL below runs on EVERY migrate call, so the repair is
-- order-independent and self-heals existing deployments. Owner and
-- service_role are unaffected (RLS is not forced for the table owner);
-- anon/authenticated lose REST access, which nothing legitimate uses —
-- the version reader goes through the direct pg channel or service_role.
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;
-- HISTORY IS NOT A FAILURE. The bare legacy ledger recorded a row ONLY after
-- a migration committed (the old runner inserted inside the same
-- transaction), so every pre-upgrade row is a truthful success — but the
-- 'success' column arrives with DEFAULT FALSE, which reads that history as
-- 30+ recorded FAILURES, and a recorded failure is RETRIED: the first
-- modern-runner pass after the upgrade would have re-executed every
-- historical DDL against a live database. The backfill states what the old
-- runner's own semantics guaranteed. It is idempotent and cannot touch a
-- modern row: a modern FAILURE always carries its checksum and
-- error_message; legacy bare rows have neither. Backfilled rows land in
-- decideForMigration's designed branch — "recorded applied without a
-- checksum — not rerun".
update public.schema_migrations
   set success = true
 where success = false
   and checksum is null
   and error_message is null;
`;

/**
 * One fixed key so every runner — CLI or admin route, any deployment —
 * contends for the SAME lock. Two deployments cannot migrate at once.
 */
export const MIGRATION_LOCK_KEY = 8_140_042;

export type ExecutionMethod = 'cli' | 'admin_route';

/** sha256 of the exact SQL text that ran. */
export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

export interface LedgerRow {
  name: string;
  checksum: string | null;
  success: boolean;
  reconciled: boolean;
}

export type SkipDecision =
  | { action: 'run' }
  | { action: 'skip'; reason: string }
  | { action: 'halt'; reason: string };

/**
 * Whether a migration should run, be skipped, or STOP the whole run.
 *
 * A checksum mismatch halts rather than reruns: the SQL under an
 * already-applied name has changed, and silently re-executing edited DDL
 * against a live database is precisely the failure this ledger exists to
 * prevent.
 */
export function decideForMigration(name: string, checksum: string, existing: LedgerRow | undefined): SkipDecision {
  if (!existing) return { action: 'run' };
  if (!existing.success) return { action: 'run' }; // a recorded failure is retried
  if (!existing.checksum) {
    // Applied under the old bare ledger, or reconciled from schema evidence:
    // we know it ran but not what SQL. Do not rerun; do not claim a match.
    return { action: 'skip', reason: 'recorded applied without a checksum — not rerun' };
  }
  if (existing.checksum !== checksum) {
    return {
      action: 'halt',
      reason: `checksum mismatch for ${name}: the ledger has ${existing.checksum.slice(0, 12)}… but the repository now has ${checksum.slice(0, 12)}…. The SQL changed after it was applied; resolve manually rather than rerunning edited DDL.`,
    };
  }
  return { action: 'skip', reason: 'already applied, checksum matches' };
}

/**
 * THE CLI'S OWN LEDGER IS APPLICATION EVIDENCE TOO. Production's history was
 * mostly applied through the Supabase CLI, whose commit-time record
 * (supabase_migrations.schema_migrations) this module's ledger never saw —
 * observed 2026-08-21: public.schema_migrations recorded 5 rows while ~44
 * registered migrations were physically applied. A runner reading only the
 * app ledger decides 'run' for every unrecorded name, so the first
 * credentialed migrate would have re-executed years of applied DDL against a
 * live database. /api/version already trusts this record as its cli_ledger
 * evidence tier; the runners consult the same record through this merge.
 *
 * Ordering rules, deliberately:
 *   - An app-ledger SUCCESS row wins outright. Checksum match/halt semantics
 *     stay authoritative — CLI presence can never convert a checksum
 *     mismatch into a skip.
 *   - An app-ledger FAILURE row is outranked by CLI evidence: the physical
 *     state is applied (the recorded failure was a re-execution attempt, or
 *     a retry the CLI later satisfied), and "retrying" would re-execute
 *     applied DDL.
 *   - Without CLI evidence nothing changes: the existing row, or its
 *     absence, decides exactly as before.
 *
 * A synthesized row carries no checksum, landing in decideForMigration's
 * designed branch: applied without a checksum — not rerun, never claimed as
 * a match.
 */
export function withCliEvidence(
  existing: LedgerRow | undefined,
  name: string,
  cliApplied: ReadonlySet<string>,
): LedgerRow | undefined {
  if (!cliApplied.has(name)) return existing;
  if (existing?.success) return existing;
  return { name, checksum: null, success: true, reconciled: false };
}

/** The one query method both runners' pg clients provide. */
export interface LedgerQuerier {
  query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

/**
 * Migration names recorded by the Supabase CLI's ledger. An absent table, an
 * older CLI schema without a `name` column, or any read failure returns the
 * EMPTY set: no evidence is never fabricated evidence, and the runner simply
 * decides from the app ledger alone, exactly as before.
 */
export async function readCliAppliedNames(db: LedgerQuerier): Promise<Set<string>> {
  try {
    const { rows } = await db.query('select name from supabase_migrations.schema_migrations');
    return new Set(
      rows.map((r) => r.name).filter((n): n is string => typeof n === 'string' && n.length > 0),
    );
  } catch {
    return new Set();
  }
}

/**
 * Ledger trust level, surfaced by /api/version so nobody reads a partial
 * ledger as authoritative.
 *   unreconciled  - bare legacy rows exist (no checksum) that were never proven
 *   reconciled    - the one-time reconciliation has run
 *   runner_ledger - answered from a CHECKSUMMED public.schema_migrations row —
 *                   written by the modern runner only after the migration
 *                   committed, so it is commit-time evidence in its own right.
 *                   Exists because the runner never sets `reconciled`, and
 *                   without this tier a migration applied via the admin route
 *                   stayed invisible to /api/version forever.
 *   cli_ledger    - answered from supabase_migrations.schema_migrations, the
 *                   Supabase CLI's own application record — real evidence with
 *                   its own timestamp version and name.
 *   empty         - no ledger rows at all
 *   unavailable   - the ledger could not be read
 */
export type LedgerStatus = 'reconciled' | 'unreconciled' | 'runner_ledger' | 'cli_ledger' | 'empty' | 'unavailable';
