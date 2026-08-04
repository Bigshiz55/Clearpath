import 'server-only';

/**
 * ONE-TIME LEDGER RECONCILIATION — by evidence, never by filename.
 *
 * The ledger is incomplete because migrations were applied for months through
 * a route that recorded nothing. Rebuilding it requires asking the DATABASE
 * what exists, not asking the repository what was written.
 *
 * Each entry below names a concrete object whose presence proves the migration
 * ran. Absence proves it did not. Anything we cannot probe confidently is
 * UNKNOWN and is left alone — an unbackfilled row is recoverable, a wrongly
 * backfilled one silently licenses skipping a migration that never ran.
 */

export type Classification = 'PROVEN_APPLIED' | 'PROVEN_NOT_APPLIED' | 'UNKNOWN';

export interface Probe {
  migration: string;
  /** Boolean SQL: true when the migration's objects are present. */
  sql: string;
  /** What the probe demonstrates, recorded in the ledger's evidence column. */
  evidence: string;
}

const tableExists = (t: string) =>
  `select exists (select 1 from information_schema.tables where table_schema='public' and table_name='${t}')`;
const columnExists = (t: string, c: string) =>
  `select exists (select 1 from information_schema.columns where table_schema='public' and table_name='${t}' and column_name='${c}')`;

/**
 * Probes only for migrations whose effect is a durable, checkable object.
 * Deliberately NOT exhaustive: a migration absent from this list reconciles as
 * UNKNOWN, which is the honest answer.
 */
export const PROBES: Probe[] = [
  { migration: '0038_pack_ingest_runs', sql: tableExists('pack_ingest_runs'),
    evidence: "table public.pack_ingest_runs exists" },
  { migration: '0039_growth_os', sql: tableExists('growth_campaigns'),
    evidence: "table public.growth_campaigns exists" },
  { migration: '0039_packs_expansion', sql: tableExists('pack_premieres'),
    evidence: "table public.pack_premieres exists" },
  { migration: '0040_accounts_feedback', sql: tableExists('account_merges'),
    evidence: "table public.account_merges exists" },
  { migration: '0041_watchmode_availability', sql: tableExists('watchmode_availability'),
    evidence: "table public.watchmode_availability exists" },
  // 0042's proof is the column it adds. This MUST read false until the
  // migration is genuinely applied — it is the check that keeps 0042
  // PROVEN_NOT_APPLIED through the backup/test/rollback sequence.
  { migration: '0042_canonical_availability', sql: columnExists('watchmode_availability', 'availability_state'),
    evidence: "column watchmode_availability.availability_state exists" },
];

export interface ReconcileResult {
  migration: string;
  classification: Classification;
  evidence: string | null;
  backfilled: boolean;
}

/** Turn a probe outcome into a classification. `null` = probe could not run. */
export function classify(probeResult: boolean | null, evidence: string): ReconcileResult['classification'] {
  if (probeResult === null) return 'UNKNOWN';
  return probeResult ? 'PROVEN_APPLIED' : 'PROVEN_NOT_APPLIED';
}

/** Only PROVEN_APPLIED is ever written back. Nothing else touches the ledger. */
export function shouldBackfill(c: Classification): boolean {
  return c === 'PROVEN_APPLIED';
}

/** A migration with no probe is UNKNOWN — we do not infer from its filename. */
export function probeFor(migration: string): Probe | undefined {
  return PROBES.find((p) => p.migration === migration);
}
