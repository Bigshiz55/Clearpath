import { describe, it, expect } from 'vitest';
import { checksumOf, decideForMigration, LEDGER_DDL, MIGRATION_LOCK_KEY } from './migrationLedger';
import { classify, shouldBackfill, probeFor, PROBES } from './migrationReconcile';

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
    expect(classify(true, 'x')).toBe('PROVEN_APPLIED');
    expect(classify(false, 'x')).toBe('PROVEN_NOT_APPLIED');
    expect(classify(null, 'x')).toBe('UNKNOWN');
  });

  it('backfills PROVEN_APPLIED and nothing else', () => {
    expect(shouldBackfill('PROVEN_APPLIED')).toBe(true);
    expect(shouldBackfill('PROVEN_NOT_APPLIED')).toBe(false);
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
