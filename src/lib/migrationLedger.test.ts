import { describe, it, expect } from 'vitest';
import { checksumOf, decideForMigration, LEDGER_DDL, MIGRATION_LOCK_KEY } from './migrationLedger';
import { classify, shouldBackfill, probeFor, runProbes, PROBES } from './migrationReconcile';

describe('checksums', () => {
  it('is stable and content-sensitive', () => {
    expect(checksumOf('select 1')).toBe(checksumOf('select 1'));
    expect(checksumOf('select 1')).not.toBe(checksumOf('select 2'));
  });
});

describe('decideForMigration', () => {
  const ck = checksumOf('create table x');

  it('runs when there is no ledger row', () => {
    expect(decideForMigration('0042', ck, undefined).action).toBe('run');
  });

  it('retries a recorded failure — a failed run is never treated as applied', () => {
    expect(decideForMigration('0042', ck, { name: '0042', checksum: ck, success: false, reconciled: false }).action).toBe('run');
  });

  it('skips only when identifier AND checksum match', () => {
    const d = decideForMigration('0042', ck, { name: '0042', checksum: ck, success: true, reconciled: false });
    expect(d.action).toBe('skip');
  });

  it('HALTS on a checksum mismatch rather than rerunning changed SQL', () => {
    const d = decideForMigration('0042', ck, { name: '0042', checksum: checksumOf('create table y'), success: true, reconciled: false });
    expect(d.action).toBe('halt');
    if (d.action === 'halt') expect(d.reason).toMatch(/checksum mismatch/i);
  });

  it('does not rerun a reconciled row that has no checksum, and does not claim a match', () => {
    const d = decideForMigration('0041', ck, { name: '0041', checksum: null, success: true, reconciled: true });
    expect(d.action).toBe('skip');
    if (d.action === 'skip') expect(d.reason).toMatch(/without a checksum/);
  });
});

describe('reconciliation classifies by evidence, never by filename', () => {
  it('PROVEN_APPLIED only when the probe finds the object', () => {
    expect(classify(true)).toBe('PROVEN_APPLIED');
    expect(classify(false)).toBe('PROVEN_NOT_APPLIED');
    expect(classify(null)).toBe('UNKNOWN');
  });

  it('backfills PROVEN_APPLIED and nothing else', () => {
    expect(shouldBackfill('PROVEN_APPLIED')).toBe(true);
    expect(shouldBackfill('PROVEN_NOT_APPLIED')).toBe(false);
    expect(shouldBackfill('BLOCKED_PREREQUISITE_MISSING')).toBe(false);
    expect(shouldBackfill('UNKNOWN')).toBe(false);
  });

  it('0042 is proven by the column it adds, so it cannot read applied before it runs', () => {
    const p = probeFor('0042_canonical_availability')!;
    expect(p.sql).toContain('availability_state');
    expect(p.sql).toContain('watchmode_availability');
  });

  it('a migration with no probe is UNKNOWN, not assumed', () => {
    expect(probeFor('0001_init')).toBeUndefined();
  });

  it('every probe checks a concrete database object', () => {
    for (const p of PROBES) expect(p.sql).toMatch(/information_schema/);
  });
});

/**
 * THE DEFECT THIS SUITE EXISTS FOR.
 *
 * Production has no `public.watchmode_availability` (0041 never ran there), so
 * 0042's column probe reads false. Answering from that probe alone gives
 * PROVEN_NOT_APPLIED, whose recommended action is "apply the migration" — and
 * applying 0042 would fail on its first ALTER. The prerequisite has to be
 * checked first and has to win.
 */
describe('a missing prerequisite is a schema failure, not a pending migration', () => {
  it('the prerequisite outranks the probe, even when the probe is conclusive', () => {
    expect(classify(false, false)).toBe('BLOCKED_PREREQUISITE_MISSING');
    // Belt and braces: even a probe that somehow read true cannot override it.
    expect(classify(true, false)).toBe('BLOCKED_PREREQUISITE_MISSING');
    expect(classify(null, false)).toBe('BLOCKED_PREREQUISITE_MISSING');
  });

  it('an unreadable prerequisite is UNKNOWN — never assumed satisfied', () => {
    expect(classify(true, null)).toBe('UNKNOWN');
    expect(classify(false, null)).toBe('UNKNOWN');
  });

  it('0042 declares the table it ALTERs as a prerequisite', () => {
    const p = probeFor('0042_canonical_availability')!;
    expect(p.requires).toBeDefined();
    expect(p.requires!.object).toBe('public.watchmode_availability');
    expect(p.requires!.sql).toMatch(/information_schema\.tables/);
  });

  it('reports the real production shape: table absent -> BLOCKED, naming the object', async () => {
    // Exactly what was reported: watchmode_availability absent, so its column
    // is absent too. Anything else present.
    const results = await runProbes(async (sql) =>
      sql.includes("table_name='watchmode_availability'") ? false : true,
    );
    const r = results.find((x) => x.migration === '0042_canonical_availability')!;
    expect(r.classification).toBe('BLOCKED_PREREQUISITE_MISSING');
    expect(r.backfilled).toBe(false);
    expect(r.evidence).toBeNull();
    expect(r.note).toContain('public.watchmode_availability');
    // The note must not send an operator off to apply 0042.
    expect(r.note).toMatch(/not the fix/i);
  });

  it('0041 in the same run reads PROVEN_NOT_APPLIED — it genuinely is pending', async () => {
    const results = await runProbes(async (sql) =>
      sql.includes("table_name='watchmode_availability'") ? false : true,
    );
    const r = results.find((x) => x.migration === '0041_watchmode_availability')!;
    expect(r.classification).toBe('PROVEN_NOT_APPLIED');
  });

  it('once the table exists, 0042 goes back to ordinary pending/applied answers', async () => {
    const applied = await runProbes(async () => true);
    expect(applied.find((x) => x.migration === '0042_canonical_availability')!.classification)
      .toBe('PROVEN_APPLIED');

    // Table present, column absent -> genuinely pending, and no stale note.
    const pending = await runProbes(async (sql) =>
      sql.includes("column_name='availability_state'") ? false : true,
    );
    const r = pending.find((x) => x.migration === '0042_canonical_availability')!;
    expect(r.classification).toBe('PROVEN_NOT_APPLIED');
    expect(r.note).toBeNull();
  });

  it('evidence is recorded only for what was actually proven', async () => {
    const results = await runProbes(async () => false);
    for (const r of results) expect(r.evidence).toBeNull();
  });
});

describe('ledger DDL and lock', () => {
  it('records the fields required to audit a run', () => {
    for (const c of ['checksum', 'started_at', 'completed_at', 'success', 'error_message', 'execution_method', 'environment', 'evidence']) {
      expect(LEDGER_DDL, c).toContain(c);
    }
  });
  it('defaults success to false so a crashed run is never a success', () => {
    expect(LEDGER_DDL).toMatch(/success\s+boolean not null default false/);
  });
  it('uses one fixed advisory-lock key for every runner', () => {
    expect(typeof MIGRATION_LOCK_KEY).toBe('number');
  });
});
