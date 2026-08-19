import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * EVERY /admin PAGE IS GATED — ENFORCED STRUCTURALLY, NOT BY MEMORY.
 *
 * `/admin/migrations` and `/admin/tv` shipped with no gate at all: there is no
 * `/admin/layout.tsx`, `middleware.ts` carries no `/admin` rule, and neither
 * page checked anything. The APIs behind them were already protected
 * (`isAdminEmail` on config-state and reconcile-dry, `MIGRATE_SECRET` on
 * migrate), so this was exposure of internal tooling rather than privilege
 * escalation — but the migrations console rendered for anyone with the URL.
 *
 * A per-page check is easy to forget on the NEXT page, which is why this walks
 * the directory instead of naming the two that were wrong. If a layout guard is
 * introduced later, relax this to recognise it — do not delete it.
 */

const ADMIN_DIR = path.resolve(__dirname);

function adminPages(): string[] {
  return readdirSync(ADMIN_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(ADMIN_DIR, e.name, 'page.tsx'))
    .filter((p) => existsSync(p));
}

describe('/admin pages are gated', () => {
  const pages = adminPages();

  it('finds the admin pages at all, so this cannot pass vacuously', () => {
    expect(pages.length).toBeGreaterThanOrEqual(4);
  });

  it('there is still no layout guard, which is why the per-page check matters', () => {
    // If this fails, a layout guard was added — good. Move the check there and
    // update this test rather than dropping the coverage.
    expect(existsSync(path.join(ADMIN_DIR, 'layout.tsx'))).toBe(false);
  });

  for (const p of adminPages()) {
    const name = path.basename(path.dirname(p));
    it(`/admin/${name} refuses a non-admin`, () => {
      const src = readFileSync(p, 'utf8');
      expect(src, `/admin/${name} does not check the caller`).toMatch(/isAdminEmail|hasFounderAccess|resolveFounderAccess/);
      expect(src, `/admin/${name} checks but does not refuse`).toMatch(/notFound\(\)|redirect\(/);
    });
  }
});
