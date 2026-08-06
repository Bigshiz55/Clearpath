/**
 * WS7 — the user-scoped views must enforce isolation at the DATABASE, not in
 * application code. This suite verifies the migration text that provides that
 * guarantee (a DB-connected integration variant runs separately when
 * DATABASE_URL is set). The point of the P0 fix: an application `.eq('user_id')`
 * filter is not a security boundary; `security_invoker` makes the base-table
 * RLS the boundary.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/0045_user_view_rls_hardening.sql'),
  'utf8',
);
const packs = readFileSync(join(process.cwd(), 'supabase/migrations/0036_packs.sql'), 'utf8');

describe('0045 — user-scoped views cannot bypass RLS', () => {
  it('turns on security_invoker for BOTH user-scoped views', () => {
    expect(migration).toMatch(/user_seen_programmes set \(security_invoker = true\)/);
    expect(migration).toMatch(/user_tracking_matches set \(security_invoker = true\)/);
  });

  it('revokes anon from both views (belt-and-braces for old engines)', () => {
    expect(migration).toMatch(/revoke all on public\.user_seen_programmes from anon/);
    expect(migration).toMatch(/revoke all on public\.user_tracking_matches from anon/);
  });

  it('does NOT alter/revoke/grant the deliberately-definer catalog views', () => {
    // They may be NAMED in the rationale comment, but no executable statement
    // may reference them — strip comments, then assert.
    const code = migration
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    for (const v of ['public_canon_titles', 'public_dist_offers', 'public_linear_airings', 'public_source_health']) {
      expect(code).not.toContain(v);
    }
  });

  it('is idempotent and version-guarded', () => {
    expect(migration).toMatch(/server_version_num/);
    expect(migration).toMatch(/if exists \(select 1 from pg_views/);
  });

  it('the base tables it relies on really have own-row SELECT RLS', () => {
    // The invoker fix only works because these policies exist — assert the
    // precondition so a future migration that drops them fails HERE.
    expect(packs).toMatch(/create policy user_seen_own_select on public\.user_seen\s+for select using \(auth\.uid\(\) = user_id\)/);
    expect(packs).toMatch(/create policy user_tracking_own_select on public\.user_tracking\s+for select using \(auth\.uid\(\) = user_id\)/);
  });
});
