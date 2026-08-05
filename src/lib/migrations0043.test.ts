import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PENDING_MIGRATIONS } from './pendingMigrations';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0043_production_hardening.sql'), 'utf8');

/**
 * GET DIAGNOSTICS ... = ROW_COUNT yields an INTEGER.
 *
 * The lock function originally declared its target `boolean`, which Postgres
 * accepts at CREATE time and then fails on the FIRST CALL with
 * "operator does not exist: boolean > integer". Nothing in the app calls the
 * lock yet, so the break was invisible in the environment where it was
 * applied and would only have surfaced when a fresh environment used it.
 * Reproduced and fixed against a real Postgres 16.
 */
describe('0043 row-count handling', () => {
  it('the row-count variable is an integer, never a boolean', () => {
    expect(sql).toMatch(/v_rows\s+integer/);
    expect(sql).toMatch(/get diagnostics v_rows = row_count/);
    expect(sql).not.toMatch(/v_got/);
  });

  it('no GET DIAGNOSTICS target is declared boolean anywhere in the file', () => {
    const targets = [...sql.matchAll(/get diagnostics\s+(\w+)\s*=\s*row_count/gi)].map((m) => m[1]!);
    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      expect(sql, `${t} must not be declared boolean`).not.toMatch(new RegExp(`${t}\\s+boolean`));
    }
  });

  it('the registered copy matches the file on disk — a stale base64 ships the old bug', () => {
    const entry = PENDING_MIGRATIONS.find((m) => m.name === '0043_production_hardening');
    expect(entry).toBeDefined();
    expect(Buffer.from(entry!.sqlB64, 'base64').toString('utf8')).toBe(sql);
  });
});
