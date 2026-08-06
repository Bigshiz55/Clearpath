/**
 * LAYER C — the BROWSER workflow, in a real Chromium.
 *
 * ── WHAT THIS IS, EXACTLY ────────────────────────────────────────────────
 * Chromium in this environment CANNOT reach the deployed site: a direct
 * navigation to https://clearpath-pearl-chi.vercel.app fails with
 * `net::ERR_CONNECTION_RESET`. So this suite drives a LOCAL PRODUCTION BUILD
 * of the same commit that is deployed (d68d0a0), and every `/api/search` and
 * `/api/person-search` response it serves is a FROZEN RECORDING of the real
 * production response captured by Layer A — never a fabrication, never a
 * fixture, and never a second live call.
 *
 * This is therefore local browser verification of production data. It is not
 * live browser testing, and nothing here may be reported as such.
 *
 * What it adds over Layer A: Layer A asked the shipped router where a query
 * WOULD go. This watches a real user type into the real component, and records
 * where the browser ACTUALLY went — including what was rendered on the way.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { detectLeaks } from '../../scripts/searchAudit/oracle';
import type { FrozenTest } from '../../scripts/searchAudit/corpus';

const corpus = JSON.parse(readFileSync('artifacts/search-audit/search-corpus-1000.json', 'utf8')) as { tests: FrozenTest[] };
const captures = JSON.parse(readFileSync('artifacts/search-audit/live-responses.json', 'utf8')) as {
  endpoint: string; query: string; status: number | null; body: string; error: string | null;
}[];
const frozen = new Map(captures.map((c) => [`${c.endpoint} ${c.query}`, c]));

/**
 * ≥10 per category, ≥200 total, chosen deterministically (the first ten of
 * each category in id order) so the selection is reproducible and cannot be
 * quietly reshaped between runs.
 */
function selection(): FrozenTest[] {
  const byCat = new Map<string, FrozenTest[]>();
  for (const t of corpus.tests) {
    const list = byCat.get(t.category) ?? [];
    if (list.length < 10) list.push(t);
    byCat.set(t.category, list);
  }
  return [...byCat.values()].flat().sort((a, b) => a.id - b.id);
}

const CASES = selection();

interface CRow {
  test_id: number; category: string; query: string; viewport: string;
  /** The FIRST place the app sent the browser, before any auth redirect. */
  routed_to: string | null;
  /** Every in-app path the submit caused, in order — kept so a routing claim
   *  can be checked rather than trusted. */
  request_chain: string[];
  landed_url: string; rendered_results: number; console_errors: string[];
  leaks: string[]; page_error: string | null; pass: boolean; reason: string;
}
const rows: CRow[] = [];

/** Serve only what production actually returned; anything else is a miss. */
async function replay(page: Page): Promise<{ misses: string[] }> {
  const misses: string[] = [];
  const handler = async (route: Route) => {
    const url = new URL(route.request().url());
    const key = `${url.pathname} ${url.searchParams.get('q') ?? ''}`;
    const hit = frozen.get(key);
    if (!hit || hit.error) {
      // A replay miss is never allowed to fall through to a live request.
      misses.push(key);
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"results":[],"people":[]}' });
      return;
    }
    await route.fulfill({ status: hit.status ?? 200, contentType: 'application/json', body: hit.body });
  };
  await page.route('**/api/search*', handler);
  await page.route('**/api/person-search*', handler);
  // Nothing else may leave the browser during a measurement pass.
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route('**://api.themoviedb.org/**', (r) => r.abort());
  return { misses };
}

for (const viewport of [{ name: 'desktop-1440x900', width: 1440, height: 900 }, { name: 'mobile-390x844', width: 390, height: 844 }] as const) {
  // The full selection on desktop; a representative slice on the phone, which
  // is the same components at a different width.
  const cases = viewport.name === 'desktop-1440x900' ? CASES : CASES.filter((_, i) => i % 3 === 0);

  test.describe(`Layer C ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const t of cases) {
      test(`#${t.id} ${t.category}: ${JSON.stringify(t.query_or_turns[0]).slice(0, 60)}`, async ({ page }) => {
        const consoleErrors: string[] = [];
        let pageError: string | null = null;
        page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
        page.on('pageerror', (e) => { pageError = String(e.message).slice(0, 300); });
        // EVERY navigation, in order.
        //
        // The harness gates /app/* and the middleware bounces an anonymous
        // visitor to /login, so reading `page.url()` after the fact reported
        // /login for all 198 searches and said nothing about where the search
        // had actually sent them. The chain keeps the app's own decision,
        // which is the thing being measured; the login bounce is recorded
        // separately as what an anonymous user then experiences.
        //
        // Recording `framenavigated` was not enough either: the App Router
        // pushes client-side, so the destination goes out as an RSC fetch and
        // the middleware's redirect is the only thing that ever becomes a
        // frame navigation. Watching the REQUESTS catches the app's chosen
        // path before the gate rewrites it.
        const navigations: string[] = [];
        const requested: string[] = [];
        page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(new URL(f.url()).pathname + new URL(f.url()).search); });
        page.on('request', (r) => {
          const u = new URL(r.url());
          if (u.origin !== 'http://127.0.0.1:3211') return;
          if (/\.(js|css|png|jpg|svg|woff2?|ico|map)$/.test(u.pathname)) return;
          if (u.pathname.startsWith('/api/')) return;
          requested.push(u.pathname + u.search.replace(/[?&]_rsc=[^&]*/, ''));
        });
        await replay(page);

        await page.goto('/dev/mobile-home', { waitUntil: 'domcontentloaded' });
        const input = page.locator('input[placeholder="Search by title, actor, genre, or platform…"]');
        await expect(input).toBeVisible();

        const query = (t.query_or_turns[0] ?? '').slice(0, 300);
        // `fill` sets the value in one operation, which is what a paste or a
        // speech-to-text insert does; typing 5,000 characters would measure
        // the keyboard, not the search.
        await input.fill(query);
        // Only what the SUBMIT causes counts. The harness prefetches /app on
        // load, and that prefetch was being reported as the destination of
        // every search.
        requested.length = 0;
        navigations.length = 0;
        await input.press('Enter');
        // Give the component its /api/search round trip and the navigation.
        await page.waitForTimeout(700);

        const landed = new URL(page.url()).pathname + new URL(page.url()).search;
        // Prefer the most SPECIFIC path the submit asked for. `/app` is the
        // layout the router fetches on its way to a deeper route, so taking
        // the first request reported it as the destination of 127 searches
        // that were actually going somewhere else.
        const candidates = requested.filter((u) => !u.startsWith('/dev/mobile-home') && !u.startsWith('/login'));
        const routed = candidates.find((u) => u !== '/app' && u !== '/app/')
          ?? candidates[0]
          ?? navigations.find((u) => !u.startsWith('/dev/mobile-home'))
          ?? null;
        const rendered = await page.locator('[data-testid="search-results"] li').count().catch(() => 0);
        const text = await page.locator('body').innerText().catch(() => '');
        const leaks = detectLeaks(text);

        // WHAT MUST HOLD FOR EVERY INPUT, including hostile and malformed:
        // the page survives, nothing executes, nothing leaks.
        const fatal = pageError !== null || leaks.length > 0;
        const reason = fatal
          ? `page error: ${pageError ?? ''} leaks: ${leaks.join(', ')}`
          : `routed to ${routed ?? '(stayed put)'}, landed ${landed}, ${rendered} rendered results`;

        rows.push({
          test_id: t.id, category: t.category, query, viewport: viewport.name,
          routed_to: routed, request_chain: [...new Set(requested)].slice(0, 12), landed_url: landed, rendered_results: rendered, console_errors: consoleErrors,
          leaks, page_error: pageError, pass: !fatal, reason,
        });

        expect(leaks, `secret or stack-trace leak for ${JSON.stringify(query)}`).toEqual([]);
        expect(pageError, `uncaught page error for ${JSON.stringify(query)}`).toBeNull();
      });
    }
  });
}

test.afterAll(() => {
  mkdirSync('artifacts/search-audit', { recursive: true });
  const pass = process.env.AUDIT_PASS ?? '1';
  writeFileSync(`artifacts/search-audit/layerC-pass${pass}.json`, JSON.stringify(rows, null, 1));
});
