/**
 * EVERY ADMIN SURFACE IS GATED, AND THE GATE IS NOT OPTIONAL.
 *
 * The check on `/admin` used to be three lines copied into each page. Two of
 * the five pages shipped without them — `/admin/migrations`, whose own doc
 * comment claimed it was session-gated, and `/admin/tv`, which renders the
 * deployment's data mode, egress counts and per-source blockers. Neither
 * exposed a destructive action (the `/api/admin/*` routes authorize
 * themselves), but both rendered to anyone who guessed the path.
 *
 * A gate you have to remember is a gate that gets forgotten, so it moved into
 * `src/app/admin/layout.tsx`, which Next.js runs for every nested route
 * whether or not the page's author thought about auth. This test pins the two
 * halves of that: the layout really is the gate, and no page has quietly gone
 * back to rolling its own (a second gate is how they drift apart again).
 *
 * Source-level on purpose: `/admin` needs a real session and an ADMIN_EMAILS
 * match, so a request-level test would assert against a login redirect and
 * prove nothing about the pages behind it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const ADMIN_PAGES = join(ROOT, 'src', 'app', 'admin');
const ADMIN_API = join(ROOT, 'src', 'app', 'api', 'admin');

const read = (p: string) => readFileSync(p, 'utf8');

/**
 * Source with comment bodies blanked. The negative assertions below ("never
 * getSession") are exactly the things a good doc comment NAMES in order to
 * forbid them, so a rule that reads its own explanation fails on correct code.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^(\s*)\/\/.*$/gm, '$1');

/** Every `page.tsx` under /admin, at any depth. */
function pages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) pages(p, out);
    else if (entry === 'page.tsx') out.push(p);
  }
  return out;
}

/** Every `route.ts` under /api/admin, at any depth. */
function routes(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) routes(p, out);
    else if (entry === 'route.ts') out.push(p);
  }
  return out;
}

describe('the /admin gate', () => {
  it('exists as a layout, so a new page is covered the moment it is created', () => {
    const layout = join(ADMIN_PAGES, 'layout.tsx');
    expect(existsSync(layout), 'src/app/admin/layout.tsx is the gate and must exist').toBe(true);
    const src = code(layout);
    // Identity is verified against the auth server, never read off the cookie.
    expect(src).toMatch(/supabase\.auth\.getUser\(\)/);
    expect(src).not.toMatch(/getSession\(/);
    // The allowlist, not a database flag anyone could flip.
    expect(src).toMatch(/isAdminEmail\(user\.email\)/);
    // 404, not 403 — a 403 confirms the route is real.
    expect(src).toMatch(/notFound\(\)/);
    expect(src).not.toMatch(/redirect\(/);
    // A cached layout would gate the first visitor and nobody after.
    expect(src).toMatch(/export const dynamic = 'force-dynamic'/);
  });

  it('covers every admin page, including the two that once shipped ungated', () => {
    const found = pages(ADMIN_PAGES).map((p) => p.slice(ADMIN_PAGES.length + 1));
    // Named explicitly: these are the regressions, and a rename that moved one
    // out from under the layout should fail loudly rather than silently.
    for (const known of ['migrations/page.tsx', 'tv/page.tsx', 'content/page.tsx', 'feedback/page.tsx', 'watchmode/page.tsx']) {
      expect(found, `${known} is no longer under the gated /admin layout`).toContain(known);
    }
    expect(found.length).toBeGreaterThanOrEqual(5);
  });

  it('has exactly ONE gate — no page rolls its own any more', () => {
    const offenders = pages(ADMIN_PAGES)
      .filter((p) => /isAdminEmail|isFounderOrAdminEmail/.test(code(p)))
      .map((p) => p.slice(ROOT.length + 1));
    expect(
      offenders,
      `these pages re-implement the layout's gate; two copies of one rule is how they drift:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  /**
   * A PAGE GATE IS NOT AN API GATE.
   *
   * `/api/admin/*` is reachable directly — a layout never runs for it. Each
   * route authorizes itself, and that has to stay true: this is the half that
   * actually stands between a stranger and a migration run.
   */
  /**
   * ONE ROUTE ANSWERS EVERYONE, ON PURPOSE.
   *
   * `/api/admin/whoami` exists so a refusal can explain itself — "not signed
   * in", "signed in but not on the allowlist", "no allowlist configured" are
   * three different problems that otherwise look identical to the owner. It
   * MUST return 200 to a non-admin or it cannot do that job, and it discloses
   * nothing to justify a gate: the caller's own address, booleans about the
   * caller, and whether an allowlist exists — never its contents.
   */
  const SELF_STATUS = new Set(['src/app/api/admin/whoami/route.ts']);

  it('every /api/admin route still authorizes itself', () => {
    const all = routes(ADMIN_API);
    expect(all.length).toBeGreaterThan(0);
    for (const p of all) {
      if (SELF_STATUS.has(p.slice(ROOT.length + 1))) continue;
      const src = code(p);
      const rel = p.slice(ROOT.length + 1);
      // Either the route verifies the caller itself, or it delegates to a
      // shared server-side authorizer (`authorizeTvAdmin` checks getUser()
      // against ADMIN_EMAILS, or a CRON_SECRET bearer token). What is not
      // acceptable is a route that checks nothing.
      expect(src, `${rel} does not verify the caller`).toMatch(
        /supabase\.auth\.getUser\(\)|MIGRATE_SECRET|authorizeTvAdmin\(/,
      );
      expect(src, `${rel} never refuses anyone`).toMatch(/\b40[13]\b/);
    }
  });
});
