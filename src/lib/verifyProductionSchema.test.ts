/**
 * THE VERIFY JOB'S VERDICT MUST COME FROM DATABASE EVIDENCE, NOT EXIT CODES.
 *
 * scripts/verifyProductionSchema.ts is the workflow's final gate. Its logic
 * runs here IN-PROCESS with a stubbed fetch (a subprocess per case took ~1
 * minute of tsx cold-start each — same logic, none of the evidence), and the
 * argv/exit shell is pinned by source so the workflow's exit-code contract
 * cannot silently drift. The case that motivated check 2: a migration whose
 * objects are not in the schema contract passes the object check while no
 * ledger recorded it — "deployed code ahead of the recorded identity" must
 * fail the run.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifySchema, type HealthBody, type VersionBody } from '../../scripts/verifyProductionSchema';

const HEALTHY: HealthBody = {
  ok: true,
  checked: 105,
  missingCount: 0,
  unappliedMigrations: [],
  missing: [],
  probeFailed: null,
  runner: { databaseUrlConfigured: true, adminAllowlistConfigured: true, migrateSecretConfigured: true },
};

function stubFetch(health: HealthBody, version: VersionBody | 'unreachable'): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/health/schema')) {
      return new Response(JSON.stringify(health), { headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/version')) {
      if (version === 'unreachable') return new Response('nope', { status: 500 });
      return new Response(JSON.stringify(version), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

describe('verifySchema answers from two independent evidence channels', () => {
  it('healthy schema with matching migration identity → ok', async () => {
    const out = await verifySchema('http://x', stubFetch(HEALTHY, {
      latestMigrationInCode: '0049_decision_runs',
      appliedMigrationName: '0049_decision_runs',
      migrationLedgerStatus: 'cli_ledger',
    }));
    expect(out.ok).toBe(true);
    expect(out.messages.join('\n')).toMatch(/all 105 required objects exist/);
    expect(out.messages.join('\n')).toMatch(/migration identity: 0049_decision_runs applied/);
  });

  it('missing objects → failed, naming the migrations to apply in order', async () => {
    const out = await verifySchema('http://x', stubFetch({
      ...HEALTHY,
      ok: false,
      missingCount: 1,
      unappliedMigrations: ['0050_example'],
      missing: [{ object: 'example_table', migration: '0050_example', error: 'not present' }],
    }, { latestMigrationInCode: '0050_example', appliedMigrationName: '0049_decision_runs' }));
    expect(out.ok).toBe(false);
    expect(out.messages.join('\n')).toMatch(/0050_example/);
    expect(out.messages.join('\n')).toMatch(/Apply, in order/);
  });

  it('unreadable database (probeFailed) → failed closed', async () => {
    const out = await verifySchema('http://x', stubFetch({ ...HEALTHY, ok: false, probeFailed: 'no probe channel could answer' }, 'unreachable'));
    expect(out.ok).toBe(false);
    expect(out.messages.join('\n')).toMatch(/could not probe/);
  });

  it('objects present but deployed code is AHEAD of the recorded identity → failed (the contract-invisible class)', async () => {
    const out = await verifySchema('http://x', stubFetch(HEALTHY, {
      latestMigrationInCode: '0050_retention_cron',
      appliedMigrationName: '0049_decision_runs',
      migrationLedgerStatus: 'cli_ledger',
    }));
    expect(out.ok).toBe(false);
    expect(out.messages.join('\n')).toMatch(/AHEAD/);
    expect(out.messages.join('\n')).toMatch(/0050_retention_cron/);
  });

  it('objects present but no ledger can name an applied migration → failed, never assumed', async () => {
    const out = await verifySchema('http://x', stubFetch(HEALTHY, {
      latestMigrationInCode: '0049_decision_runs',
      appliedMigrationName: null,
      migrationLedgerStatus: 'unavailable',
    }));
    expect(out.ok).toBe(false);
    expect(out.messages.join('\n')).toMatch(/cannot name any applied migration/);
  });

  it('version endpoint unreachable → failed, identity is not skippable', async () => {
    const out = await verifySchema('http://x', stubFetch(HEALTHY, 'unreachable'));
    expect(out.ok).toBe(false);
    expect(out.messages.join('\n')).toMatch(/version unreachable/);
  });

  it('identity ahead of code (deploy still rolling out) is NOT a failure — only behind is', async () => {
    const out = await verifySchema('http://x', stubFetch(HEALTHY, {
      latestMigrationInCode: '0049_decision_runs',
      appliedMigrationName: '0050_retention_cron',
      migrationLedgerStatus: 'runner_ledger',
    }));
    expect(out.ok).toBe(true);
  });
});

describe('the script shell keeps the workflow exit-code contract', () => {
  it('non-ok exits 1, missing URL exits 2, and main only runs as a script', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'scripts', 'verifyProductionSchema.ts'), 'utf8');
    expect(src).toMatch(/if \(!outcome\.ok\) process\.exit\(1\);/);
    expect(src).toMatch(/process\.exit\(2\);/);
    expect(src).toMatch(/process\.argv\[1\]\?\.includes\('verifyProductionSchema'\)/);
  });
});
