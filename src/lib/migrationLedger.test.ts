import { describe, it, expect } from 'vitest';
import { checksumOf, decideForMigration, LEDGER_DDL, MIGRATION_LOCK_KEY, readCliAppliedNames, withCliEvidence } from './migrationLedger';
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

/**
 * THE CLI'S OWN LEDGER IS APPLICATION EVIDENCE. /api/version already trusts
 * supabase_migrations.schema_migrations as its cli_ledger tier; the runners
 * must consult the same record, or every CLI-applied name decides as 'run'
 * and a credentialed migrate re-executes applied DDL (the observed
 * production shape: 5 app-ledger rows vs ~44 physically applied).
 */
describe('CLI-ledger evidence merges into the decision, without touching checksum semantics', () => {
  const ck = checksumOf('create table x');

  it('a CLI-applied name with no app-ledger row is skipped — never rerun, never a claimed match', () => {
    const merged = withCliEvidence(undefined, '0007_court', new Set(['0007_court']));
    const d = decideForMigration('0007_court', ck, merged);
    expect(d.action).toBe('skip');
    if (d.action === 'skip') expect(d.reason).toMatch(/without a checksum/);
  });

  it('no CLI evidence changes nothing: absent stays run, existing rows pass through untouched', () => {
    expect(withCliEvidence(undefined, '0050_future', new Set())).toBeUndefined();
    const failure = { name: '0050_future', checksum: ck, success: false, reconciled: false };
    expect(withCliEvidence(failure, '0050_future', new Set())).toBe(failure);
  });

  it('CLI evidence can never mask checksum semantics: a checksummed success row wins outright', () => {
    const success = { name: '0042', checksum: checksumOf('create table y'), success: true, reconciled: false };
    const merged = withCliEvidence(success, '0042', new Set(['0042']));
    expect(merged).toBe(success);
    // The mismatch still HALTS — CLI presence must not convert it to a skip.
    expect(decideForMigration('0042', ck, merged).action).toBe('halt');
  });

  it('CLI evidence outranks a recorded failure: the physical state is applied, retrying would re-execute', () => {
    const failure = { name: '0042', checksum: ck, success: false, reconciled: false };
    const d = decideForMigration('0042', ck, withCliEvidence(failure, '0042', new Set(['0042'])));
    expect(d.action).toBe('skip');
  });

  it('readCliAppliedNames returns the recorded names and drops null/empty ones', async () => {
    const names = await readCliAppliedNames({
      query: async () => ({ rows: [{ name: '0049_decision_runs' }, { name: null }, { name: '' }, { name: '0001_init' }] }),
    });
    expect(names).toEqual(new Set(['0049_decision_runs', '0001_init']));
  });

  it('an absent or unreadable CLI ledger is NO evidence — empty set, never a guess', async () => {
    const names = await readCliAppliedNames({
      query: async () => { throw new Error('relation "supabase_migrations.schema_migrations" does not exist'); },
    });
    expect(names.size).toBe(0);
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
