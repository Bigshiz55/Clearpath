/**
 * WS7 Phase-6 — the security-advisor remediation (0046) does the two real
 * fixes and touches nothing it classified as an intentional interface.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const m = readFileSync(join(process.cwd(), 'supabase/migrations/0046_security_advisor_hardening.sql'), 'utf8');
const ingest = readFileSync(join(process.cwd(), 'supabase/migrations/0038_pack_ingest_runs.sql'), 'utf8');

describe('0046 — fixes exactly the two real findings', () => {
  it('revokes client EXECUTE on both server-only ingest lock RPCs, grants service_role', () => {
    for (const fn of ['pack_try_start_ingest', 'pack_finish_ingest']) {
      expect(m).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon, authenticated, public`));
      expect(m).toMatch(new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to service_role`));
    }
  });

  it('locks down schema_migrations (RLS + revoke), guarded on existence', () => {
    expect(m).toMatch(/enable row level security/);
    expect(m).toMatch(/revoke all on public\.schema_migrations from anon, authenticated/);
    expect(m).toMatch(/if exists \(select 1 from pg_tables/);
  });

  it('does NOT revoke the intentional anon interfaces', () => {
    // They may be NAMED in the rationale comment, but no executable statement
    // may reference them — strip comments, then assert.
    const code = m
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    for (const keep of ['court_join', 'court_vote', 'court_state', 'growth_click', 'public_canon_titles', 'public_dist_offers', 'public_linear_airings']) {
      expect(code).not.toContain(keep);
    }
  });

  it('is idempotent (every change is existence-guarded)', () => {
    expect(m).toMatch(/if exists \(select 1 from pg_proc/);
    expect((m.match(/do \$\$/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('precondition: 0038 really did over-grant these RPCs (so the fix is real)', () => {
    expect(ingest).toMatch(/grant execute on function public\.pack_try_start_ingest\(uuid, int\) to anon, authenticated/);
    expect(ingest).toMatch(/grant execute on function public\.pack_finish_ingest\(uuid, text, int, text\) to anon, authenticated/);
  });
});
