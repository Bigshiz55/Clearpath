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
 *
 * ── WHY PREREQUISITES EXIST ───────────────────────────────────────────────
 * "Not applied" carries an implicit promise: that the migration COULD be
 * applied, and applying it is the fix. For a migration whose own SQL depends
 * on an object that isn't in the database, that promise is false — running it
 * fails at the first statement, and the real defect is upstream.
 *
 * This is not hypothetical. 0042_canonical_availability ALTERs
 * `public.watchmode_availability`, which is absent from production because
 * 0041 (the migration that creates it) never ran there — see
 * docs/SCHEMA_DRIFT_0042.md for the full evidence. Reporting that as "0042 not
 * applied" points an operator straight at applying 0042, which is exactly the
 * wrong action. BLOCKED_PREREQUISITE_MISSING names the missing object instead.
 */

export type Classification =
  | 'PROVEN_APPLIED'
  | 'PROVEN_NOT_APPLIED'
  /** The migration cannot run at all: an object its SQL depends on is absent. */
  | 'BLOCKED_PREREQUISITE_MISSING'
  | 'UNKNOWN';

export interface Prerequisite {
  /** The database object this migration's SQL requires to already exist. */
  object: string;
  /** Boolean SQL: true when that object is present. */
  sql: string;
  /** What its absence means for an operator, in plain words. */
  absenceMeans: string;
}

export interface Probe {
  migration: string;
  /** Boolean SQL: true when the migration's objects are present. */
  sql: string;
  /** What the probe demonstrates, recorded in the ledger's evidence column. */
  evidence: string;
  /** Checked FIRST. When it reads false the migration is blocked, not pending. */
  requires?: Prerequisite;
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
  // 0042's proof is the column it adds — but a column can only exist on a
  // table that exists, so the table is checked first. Without that ordering a
  // missing table reads as "0042 not applied", which invites applying 0042 to
  // fix it; 0042 would fail on its own first ALTER.
  { migration: '0042_canonical_availability', sql: columnExists('watchmode_availability', 'availability_state'),
    evidence: "column watchmode_availability.availability_state exists",
    requires: {
      object: 'public.watchmode_availability',
      sql: tableExists('watchmode_availability'),
      absenceMeans:
        'Migration 0041, which creates it, has not run against this database, so 0042 cannot run either — every statement in 0042 ALTERs that table. Applying 0042 is not the fix. See docs/SCHEMA_DRIFT_0042.md.',
    } },
];

export interface ReconcileResult {
  migration: string;
  classification: Classification;
  evidence: string | null;
  backfilled: boolean;
  /** Human-readable explanation — populated only when something is blocked. */
  note: string | null;
}

/**
 * Turn probe outcomes into a classification. `null` = the probe could not run.
 *
 * THE PREREQUISITE OUTRANKS THE PROBE, deliberately. A missing prerequisite
 * forces the migration's own probe to read false for a reason that has nothing
 * to do with whether the migration is pending, so answering from the probe
 * alone reports a true statement that misleads about the required action.
 */
export function classify(
  probeResult: boolean | null,
  prerequisiteResult: boolean | null = true,
): Classification {
  if (prerequisiteResult === false) return 'BLOCKED_PREREQUISITE_MISSING';
  // Could not determine the prerequisite -> cannot trust the probe either.
  if (prerequisiteResult === null) return 'UNKNOWN';
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

/** Runs boolean SQL, returning null when the query itself fails. */
export type ProbeQuery = (sql: string) => Promise<boolean | null>;

/**
 * The single implementation both admin routes use, so the read-only dry run
 * and the backfilling run can never disagree about what the database says.
 */
export async function runProbes(query: ProbeQuery): Promise<ReconcileResult[]> {
  const results: ReconcileResult[] = [];
  for (const probe of PROBES) {
    const prerequisite = probe.requires ? await query(probe.requires.sql) : true;
    // Skip the probe itself when its prerequisite is absent: the answer is
    // already determined, and asking would only produce a misleading false.
    const present = prerequisite === false ? null : await query(probe.sql);
    const classification = classify(present, prerequisite);
    results.push({
      migration: probe.migration,
      classification,
      evidence: classification === 'PROVEN_APPLIED' ? probe.evidence : null,
      backfilled: false,
      note:
        classification === 'BLOCKED_PREREQUISITE_MISSING' && probe.requires
          ? `${probe.requires.object} is missing. ${probe.requires.absenceMeans}`
          : null,
    });
  }
  return results;
}
