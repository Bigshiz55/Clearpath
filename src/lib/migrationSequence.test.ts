/**
 * MIGRATION IDENTITY DISCIPLINE — pinned after the 0047 collision.
 *
 * Production's CLI ledger owns the number 0047 twice (0047_voice_interviews
 * at version 20260808180259, 0047_watchlist_provenance at 20260812164511 —
 * both applied from outside this repository), and this repo had authored a
 * THIRD 0047 (decision_runs). Nothing objected, because nothing compared the
 * numbers anywhere. The decision-runs DDL was re-issued as 0049; these tests
 * make the discipline executable:
 *
 *   - a NEW duplicate human sequence number fails before merge;
 *   - the retired 0047_decision_runs identity cannot quietly return;
 *   - the migration's entry_point constraint cannot drift from the code's
 *     EntryPoint vocabulary again (the original 0047 draft predated Phase 8
 *     and would have rejected every court/verdict/subscriptions insert);
 *   - every registry/contract reference points at a real on-disk file.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PENDING_MIGRATIONS } from './pendingMigrations';
import { SCHEMA_CONTRACT } from './schemaContract';
import { LEDGER_DDL } from './migrationLedger';
import { ENTRY_POINTS } from './graph/types';

const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const onDisk = readdirSync(DIR).filter((f) => f.endsWith('.sql')).map((f) => f.replace(/\.sql$/, ''));

/**
 * 0039 is carried by TWO files (growth_os, packs_expansion) — a historical
 * duplicate that predates this discipline and is applied under BOTH names in
 * ledgers, so renaming either would orphan a ledger row. Grandfathered by
 * exact name; nothing may join this list.
 */
const GRANDFATHERED_DUPLICATE_NUMBERS = new Set(['0039']);

describe('one number, one migration', () => {
  it('no two migration files share a sequence number (0039 grandfathered by name)', () => {
    const byNumber = new Map<string, string[]>();
    for (const name of onDisk) {
      const num = name.slice(0, 4);
      byNumber.set(num, [...(byNumber.get(num) ?? []), name]);
    }
    const offenders = [...byNumber.entries()].filter(
      ([num, names]) => names.length > 1 && !GRANDFATHERED_DUPLICATE_NUMBERS.has(num),
    );
    expect(offenders, `duplicate migration sequence number(s): ${JSON.stringify(offenders)}`).toEqual([]);
    // The grandfather list is exactly the historical pair — not a loophole.
    expect(byNumber.get('0039')?.sort()).toEqual(['0039_growth_os', '0039_packs_expansion']);
  });

  it('the retired 0047_decision_runs identity does not exist on disk, in the registry, or in the contract', () => {
    expect(onDisk).not.toContain('0047_decision_runs');
    expect(PENDING_MIGRATIONS.map((m) => m.name)).not.toContain('0047_decision_runs');
    expect(SCHEMA_CONTRACT.map((r) => r.migration)).not.toContain('0047_decision_runs');
    // Its successor is real and registered.
    expect(onDisk).toContain('0049_decision_runs');
    expect(PENDING_MIGRATIONS.map((m) => m.name)).toContain('0049_decision_runs');
  });

  it('every registered migration and every contract reference names a real on-disk file', () => {
    const disk = new Set(onDisk);
    const ghostRegistrations = PENDING_MIGRATIONS.map((m) => m.name).filter((n) => !disk.has(n));
    expect(ghostRegistrations, 'registered but no file on disk').toEqual([]);
    const ghostContracts = [...new Set(SCHEMA_CONTRACT.map((r) => r.migration))].filter((n) => !disk.has(n));
    expect(ghostContracts, 'contract points at a migration file that does not exist').toEqual([]);
  });

  it("the registry's base64 for 0049_decision_runs is byte-identical to the file", () => {
    const entry = PENDING_MIGRATIONS.find((m) => m.name === '0049_decision_runs')!;
    const fromRegistry = Buffer.from(entry.sqlB64, 'base64').toString('utf8');
    const fromDisk = readFileSync(join(DIR, '0049_decision_runs.sql'), 'utf8');
    expect(fromRegistry).toBe(fromDisk);
  });
});

describe('the decision_runs schema speaks the code’s vocabulary', () => {
  it("the entry_point check constraint lists exactly the code's ENTRY_POINTS", () => {
    const sql = readFileSync(join(DIR, '0049_decision_runs.sql'), 'utf8');
    const m = /entry_point\s+text\s+not\s+null\s+check\s*\(entry_point\s+in\s*\(([^)]+)\)\)/.exec(sql);
    expect(m, 'entry_point check constraint not found in 0049_decision_runs.sql').toBeTruthy();
    const inList = m![1]!
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .sort();
    expect(inList).toEqual([...ENTRY_POINTS].sort());
  });
});

describe('one runner discipline — the CLI script and the admin route share the ledger machinery', () => {
  it('scripts/migrate.ts runs the shared LEDGER_DDL/checksum discipline, not a private bare ledger', () => {
    const script = readFileSync(join(__dirname, '..', '..', 'scripts', 'migrate.ts'), 'utf8');
    /* This script was the last bare-ledger writer — and the Actions
       workflow's PREFERRED path, so the unattended route was exactly the
       one without checksums, halt-on-mismatch, or hardening. */
    expect(script).toMatch(/import \{ LEDGER_DDL, MIGRATION_LOCK_KEY, checksumOf, decideForMigration/);
    expect(script).toMatch(/execution_method[\s\S]{0,200}'cli'/);
    expect(script).not.toMatch(/create table if not exists public\.schema_migrations/);
  });

  it('the ledger upgrade backfills legacy history as the successes it truthfully was', () => {
    /* LEDGER_DDL adds `success` with DEFAULT FALSE — without the backfill,
       every pre-upgrade row (each written only after a successful commit by
       the old runner) read as a recorded FAILURE, and recorded failures are
       RETRIED: the first modern run would have re-executed 30+ historical
       DDLs against a live database. The guard conditions make the backfill
       unable to touch a modern row (modern failures always carry checksum
       and error_message). */
    expect(LEDGER_DDL).toMatch(/update public\.schema_migrations\s*\n\s*set success = true\s*\n\s*where success = false\s*\n\s*and checksum is null\s*\n\s*and error_message is null;/);
  });

  it('an upgraded legacy row is SKIPPED, never re-run and never trusted for a checksum match', async () => {
    const { decideForMigration } = await import('./migrationLedger');
    const d = decideForMigration('0031_reco_engine', 'abc123', {
      name: '0031_reco_engine',
      checksum: null,
      success: true,
      reconciled: false,
    });
    expect(d.action).toBe('skip');
  });
});

describe('the ledger table is born hardened', () => {
  it('LEDGER_DDL itself enables RLS and revokes anon/authenticated — order-independent of 0046', () => {
    /* 0046 hardens public.schema_migrations only `if exists`; on a database
       where the runner created the table after 0046 ran, that guard skipped
       forever and the ledger sat REST-writable to anon — a forged success
       row suppresses a migration, a forged checksum halts the run. The DDL
       executes on every migrate call, so the repair self-heals. */
    expect(LEDGER_DDL).toMatch(/alter table public\.schema_migrations enable row level security;/);
    expect(LEDGER_DDL).toMatch(/revoke all on public\.schema_migrations from anon, authenticated;/);
  });
});
