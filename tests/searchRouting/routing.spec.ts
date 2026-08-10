/**
 * PRODUCTION-EQUIVALENT ROUTING VERIFICATION, both viewports.
 *
 * Drives the shipped SearchBar in the local production build of the deployed
 * commit. /api/search is answered with realistic catalog shapes (the server
 * half is verified separately against live production with real TMDB data);
 * what is measured HERE is what the browser actually does with them.
 */
import { test, expect, type Page } from '@playwright/test';

const CATALOG: Record<string, unknown> = {
  'Creed 2015': { results: [
    { id: 312221, mediaType: 'movie', title: 'Creed', year: 2015 },
    { id: 916224, mediaType: 'movie', title: 'Creed', year: 2005 },
  ], people: [] },
  'Rocky': { results: [{ id: 1366, mediaType: 'movie', title: 'Rocky', year: 1976 }], people: [] },
  'It': { results: [{ id: 346364, mediaType: 'movie', title: 'It', year: 2017 }], people: [] },
  'something good': { results: [{ id: 236329, mediaType: 'movie', title: 'Something Good' }], people: [] },
  'the sequel': { results: [{ id: 1163319, mediaType: 'movie', title: 'The Sequel' }], people: [] },
  'movies like Creed': { results: [{ id: 312221, mediaType: 'movie', title: 'Creed', year: 2015 }], people: [] },
};

async function arm(page: Page) {
  await page.route('**/api/search*', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(CATALOG[q] ?? { results: [], people: [] }) });
  });
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}

const EXPECT: [string, RegExp | null][] = [
  ['Creed 2015', /\/app\/title\/movie\/312221/],   // year picks the 2015 Creed
  ['Rocky', /\/app\/title\/movie\/1366/],          // exact title still navigates
  ['It', /\/app\/title\/movie\/346364/],           // pronoun-title still navigates
  ['something good', /\/app\/ask\?q=/],            // generic phrase → Judge
  ['the sequel', /\/app\/ask\?q=/],                // generic phrase → Judge
  ['movies like Creed', /\/app\/ask\?q=/],         // similarity → Judge, never Creed's page
  ['', null],                                      // empty input never navigates
];

for (const vp of [{ name: 'desktop-1440x900', width: 1440, height: 900 }, { name: 'mobile-390x844', width: 390, height: 844 }]) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    for (const [q, want] of EXPECT) {
      test(`${JSON.stringify(q)} → ${want ? want.source : 'no navigation'}`, async ({ page }) => {
        await arm(page);
        const requested: string[] = [];
        page.on('request', (r) => {
          const u = new URL(r.url());
          if (u.origin !== 'http://127.0.0.1:3211' || u.pathname.startsWith('/api/')) return;
          if (/\.(js|css|png|svg|woff2?|ico|map)$/.test(u.pathname)) return;
          requested.push(u.pathname + u.search.replace(/[?&]_rsc=[^&]*/, ''));
        });
        await page.goto('/dev/mobile-home', { waitUntil: 'domcontentloaded' });
        const SEARCH_INPUT = 'input[placeholder="Search by title, actor, genre, or platform…"]';
        const input = page.locator(SEARCH_INPUT);
        await expect(input).toBeVisible();
        /* THE INPUT IS VISIBLE BEFORE IT IS ALIVE.
           `domcontentloaded` returns with the server-rendered markup painted
           and React not yet hydrated, so the box is on screen and its submit
           handler is not attached — an Enter pressed then is swallowed with no
           trace. That is not a slow navigation the assertion can wait out: the
           keypress is simply gone, which is exactly what the failure showed
           ("saw []" after polling a full 10s, on a fully mocked route).

           React attaches its fiber/props keys to a DOM node when it hydrates
           it, so their presence on THIS input is a direct signal that this
           control — not merely the document — is interactive. Waiting on the
           real precondition rather than on a longer sleep. */
        await page.waitForFunction((sel) => {
          const el = document.querySelector(sel);
          return !!el && Object.keys(el).some((k) => k.startsWith('__react'));
        }, SEARCH_INPUT, { timeout: 15_000 });
        await input.fill(q);
        requested.length = 0;
        await input.press('Enter');
        /* WAIT FOR THE OUTCOME, NOT FOR A FIXED 900ms.
           A blind sleep asserts on whatever has happened by the time it
           expires, so the FIRST case in the run — which pays route compilation
           and client warm-up that the other six do not — could be measured
           before the navigation it is waiting for was ever issued. Observed:
           `"Creed 2015"` failing alone on a cold run and passing on the next,
           with nothing changed. Polling asserts the same claim and settles as
           soon as it is true, so a warm run stays fast and a cold one is
           correct instead of unlucky.

           The negative case KEEPS the fixed dwell: "no navigation happened"
           can only be established by giving one time to happen and observing
           that it did not. */
        const seen = () =>
          requested.filter((u) => !u.startsWith('/dev/mobile-home') && !u.startsWith('/login') && u !== '/app' && u !== '/app/');
        if (want !== null) {
          await expect
            .poll(() => seen().some((u) => want.test(u)), {
              message: `wanted ${want} — saw ${JSON.stringify(seen())}`,
              timeout: 10_000,
            })
            .toBe(true);
        } else {
          await page.waitForTimeout(900);
        }
        const inApp = seen();
        if (want === null) {
          // Link PREFETCH is not navigation: on the phone viewport the bottom
          // nav prefetches its four destinations in the background, so request
          // sniffing reports phantom "navigations". The claim that matters is
          // that the page itself never leaves.
          expect(new URL(page.url()).pathname, 'empty input must not navigate').toBe('/dev/mobile-home');
        } else {
          expect(inApp.some((u) => want.test(u)), `wanted ${want} in ${JSON.stringify(inApp)}`).toBe(true);
        }
      });
    }
  });
}
