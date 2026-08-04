import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { LedgerStatus } from '@/lib/migrationLedger';

/**
 * WHAT THE DATABASE ACTUALLY HAS — read-only, always.
 *
 * This module NEVER triggers, repairs, applies or backfills a migration. It
 * reads the ledger and reports what it finds. /api/version is a diagnostic,
 * and a diagnostic that mutates state is how a "check" becomes an outage.
 *
 * It also refuses to guess. Until the one-time reconciliation has proven the
 * historical migrations from real schema evidence, the ledger is incomplete by
 * construction (the admin route recorded nothing for months), so ANY value it
 * holds could be an undercount. In that state the honest answer is `unknown` —
 * never 0041, never 0042.
 */
export interface AppliedMigrationInfo {
  appliedDatabaseMigration: string | 'unknown';
  migrationLedgerStatus: LedgerStatus;
}

export async function getAppliedMigrationInfo(): Promise<AppliedMigrationInfo> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('schema_migrations')
      .select('name, success, reconciled')
      .eq('success', true)
      .order('name', { ascending: false });

    if (error) return { appliedDatabaseMigration: 'unknown', migrationLedgerStatus: 'unavailable' };

    const rows = (data ?? []) as Array<{ name: string; success: boolean; reconciled: boolean }>;
    if (rows.length === 0) return { appliedDatabaseMigration: 'unknown', migrationLedgerStatus: 'empty' };

    // Reconciliation is what makes the ledger trustworthy. Without at least one
    // reconciled row the historical migrations were never proven, so the newest
    // recorded name is not a safe answer to "what is applied".
    const reconciled = rows.some((r) => r.reconciled);
    if (!reconciled) return { appliedDatabaseMigration: 'unknown', migrationLedgerStatus: 'unreconciled' };

    return { appliedDatabaseMigration: rows[0]!.name, migrationLedgerStatus: 'reconciled' };
  } catch {
    return { appliedDatabaseMigration: 'unknown', migrationLedgerStatus: 'unavailable' };
  }
}
