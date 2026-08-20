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
 * Ledger trust level, surfaced by /api/version so nobody reads a partial
 * ledger as authoritative.
 *   unreconciled - rows exist but historical migrations were never proven
 *   reconciled   - the one-time reconciliation has run
 *   cli_ledger   - answered from supabase_migrations.schema_migrations, the
 *                  Supabase CLI's own application record — real evidence with
 *                  its own name, used when the repo ledger cannot answer.
 *   empty        - no ledger rows at all
 *   unavailable  - the ledger could not be read
 */
export type LedgerStatus = 'reconciled' | 'unreconciled' | 'cli_ledger' | 'empty' | 'unavailable';
