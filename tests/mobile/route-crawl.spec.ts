import { test, expect, type ConsoleMessage, type Page, type Request } from '@playwright/test';

/**
 * THE ROUTE CRAWLER.
 *
 * Every prior suite proves one screen deeply. Nothing proved that the WHOLE
 * app loads — that no route 500s, that no page logs an exception into the
 * console during an ordinary visit, that no screen scrolls sideways on a
 * phone, that no image 404s into a broken placeholder. Those are exactly the
 * defects a user meets first and a targeted test never sees.
 *
 * WHAT IT CRAWLS, AND WHY THOSE:
 *   • The public routes — everything reachable signed-out, which is every
 *     first impression the product makes.
 *   • Every `/dev/*` harness — these mount the REAL components (the finder,
 *     the verdict report, the guide, the quiz, the court) over fixtures, so
 *     the crawler exercises the actual UI of authenticated screens without a
 *     session. That is the only way to reach them here; `/app/*` correctly
 *     redirects to /login without one, which is asserted separately below.
 *
 * WHAT COUNTS AS A FAILURE is deliberately narrow, so this stays a signal
 * rather than a nuisance: a 5xx, a page-level exception, a console `error`
 * that is not a known-and-explained third-party noise, a broken image, or
 * horizontal overflow. A 404 on a route we did not ask for is not this
 * suite's business; a 404 on a route the app itself links to is.
 */

/** Signed-out routes. A first-time visitor can reach every one of these. */
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/begin',
  '/start',
  '/learn',
  '/explore',
  '/lite',
  '/offline',
  '/import-taste',
  '/newuser',
  '/fresh',
];

/** Harnesses that mount the real components of the authenticated app. */
const HARNESS_ROUTES = [
  '/dev/visual-qa',
  '/dev/finder',
  '/dev/report-tabs',
  '/dev/channel-guide',
  '/dev/on-tv',
  '/dev/title-grid',
  '/dev/title-page',
  '/dev/verdict',
  '/dev/verdict-evidence',
  '/dev/mobile-home',
  '/dev/feed',
  '/dev/top10',
  '/dev/dna-quiz',
  '/dev/rapid-fire',
  '/dev/detective',
  '/dev/live-tv',
  '/dev/court',
  '/dev/court-vote',
  '/dev/onboarding',
  '/dev/post-watch',
  '/dev/together',
  '/dev/share-card',
  '/dev/logo',
  '/dev/search-qa',
  '/dev/reco-lab',
];

const ALL_ROUTES = [...PUBLIC_ROUTES, ...HARNESS_ROUTES];

/**
 * Console noise we accept, each with a reason. Anything not on this list is a
 * failure — the list is the audit trail, and it is meant to stay short.
 */
const ALLOWED_CONSOLE = [
  // The harnesses have no Supabase/TMDB credentials, so data fetches fail by
  // design. That is the environment, not the app.
  /supabase/i,
  /Failed to load resource/i,
  /net::ERR_/i,
  /401|403|404 \(/,
  // THE HARNESS POINTS SUPABASE AT A HOST THAT CANNOT RESOLVE, on purpose:
  // `harness.invalid` is in the reserved `.invalid` TLD, so no request can ever
  // leave and no real project is ever contacted. Two failures follow by
  // construction, and both name their own cause in the text we match on — the
  // anonymous sign-in every public page kicks off, and the realtime socket the
  // Court opens. Neither is reachable from the product's code paths in
  // production, where the host resolves.
  //
  // These are matched on the specific call and the specific host rather than on
  // a bare "Failed to fetch", because a blanket match would swallow a genuine
  // request failure in app code. See the `pageerror` note below for what a
  // sloppy suppression cost last time.
  /signInAnonymously/,
  /harness\.invalid/,
  // Next.js image/font preload advisories — performance hints, not errors.
  /preload/i,
];

interface Findings {
  consoleErrors: string[];
  pageErrors: string[];
  brokenImages: string[];
}

/** A real 1×1 PNG, served for well-formed TMDB image URLs (below). */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
/** The only URL shapes the app may legitimately build against TMDB's CDN. */
const TMDB_IMG_PATH = /^\/t\/p\/(?:w\d{2,4}|h\d{2,4}|original)\/[\w.-]+\.(?:jpe?g|png|svg)$/i;

async function visit(page: Page, route: string): Promise<{ status: number | null; findings: Findings }> {
  const findings: Findings = { consoleErrors: [], pageErrors: [], brokenImages: [] };

  // HERMETIC IMAGES. Every API call in this suite is intercepted by design
  // ("no real project is contacted" — the config's own words); the TMDB image
  // CDN was the one remaining live external dependency, so this crawl's
  // verdict depended on the runner's network instead of the repo. The stub
  // keeps the broken-image detector armed for everything the REPO controls:
  // a malformed TMDB URL (wrong path shape — the URL-construction bug class)
  // is still failed and reported, and every non-TMDB asset is still fetched
  // for real. Only the third-party CDN's reachability stops mattering.
  await page.route('https://image.tmdb.org/**', (r) => {
    const path = new URL(r.request().url()).pathname;
    return TMDB_IMG_PATH.test(path)
      ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL_PNG })
      : r.abort('failed');
  });

  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (ALLOWED_CONSOLE.some((re) => re.test(text))) return;
    findings.consoleErrors.push(text);
  });
  // AN UNCAUGHT EXCEPTION THAT REACHES THE PAGE IS A DEFECT. NO EXCEPTIONS —
  // and that word is load-bearing.
  //
  // This listener briefly allowlisted React #418/#423/#425 as "hydration
  // fallback noise the harness provokes by design". That was wrong, and the
  // allowlist hid a real crash: the Court room was white-screening with
  // "Application error: a client-side exception has occurred". The crawler
  // reported /dev/court as clean for as long as the allowlist stood, and only
  // `court.spec.ts` — which asserts on actual content — caught it.
  //
  // The lesson is the rule: a suppression written to explain a symptom you have
  // not diagnosed will eventually suppress a defect. If a route throws, either
  // fix the route or fix the harness, and never quiet the messenger.
  page.on('pageerror', (e: Error) => findings.pageErrors.push(e.message));
  page.on('requestfailed', (r: Request) => {
    if (r.resourceType() === 'image') findings.brokenImages.push(r.url());
  });

  const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
  // Give client components a moment to mount and throw if they are going to.
  await page.waitForTimeout(900);
  return { status: res?.status() ?? null, findings };
}

test.describe('every route loads without an error', () => {
  for (const route of ALL_ROUTES) {
    test(`${route} renders cleanly`, async ({ page }) => {
      const { status, findings } = await visit(page, route);

      expect(status, `${route} returned ${status}`).not.toBeNull();
      expect(status!, `${route} returned a server error`).toBeLessThan(500);
      // A harness or public route must exist. (404 here means a link in the
      // app points at nothing.)
      expect(status!, `${route} is missing`).not.toBe(404);

      expect(findings.pageErrors, `${route} threw: ${findings.pageErrors.join(' | ')}`).toEqual([]);
      expect(
        findings.consoleErrors,
        `${route} logged console errors: ${findings.consoleErrors.join(' | ')}`,
      ).toEqual([]);
      expect(
        findings.brokenImages,
        `${route} has broken images: ${findings.brokenImages.join(' | ')}`,
      ).toEqual([]);

      // Something actually rendered — a blank body is a failure that a 200
      // hides.
      const text = (await page.locator('body').innerText()).trim();
      expect(text.length, `${route} rendered an empty page`).toBeGreaterThan(0);

      // AND IT RENDERED THE PAGE, NOT NEXT'S APOLOGY FOR IT. A crashed client
      // component still returns 200 with a non-empty body, so every check above
      // passes while the user stares at a white screen. This is the assertion
      // that would have caught the Court crash on its own, without depending on
      // an exception being reported at all.
      expect(text, `${route} rendered the client-side error fallback`).not.toContain(
        'Application error',
      );
    });
  }
});

/**
 * NO SIDEWAYS SCROLL ON ANY SHIPPING ROUTE. `overflow-guard.spec` does this for
 * a chosen set at many viewports; this covers every PUBLIC route at the two
 * widths that break first — the narrowest phone the product supports, and a
 * large desktop where a fixed-width child escapes a wide container.
 *
 * THIS FOUND A REAL ONE: the landing page's enlarged wordmark measured 252px
 * at `text-3xl`, which beside a 56px mark inside a 16px-padded page needs 334
 * — 2px off the right edge at 320. Fixed in `Logo` by stepping the size down
 * below 360px.
 *
 * The `/dev/*` harnesses are deliberately excluded from THIS assertion (they
 * stay in the load crawl above, which is where they earn their keep). They
 * render fixtures at hardcoded sizes to inspect a component — `/dev/logo`
 * prints the wordmark at a fixed `text-4xl` specifically to check the numeral
 * — so their width is a property of the fixture, not of the product, and they
 * 404 in production.
 */
for (const w of [320, 1920]) {
  test(`no shipping route scrolls sideways @ ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    const offenders: string[] = [];
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(250);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (over > 1) offenders.push(`${route} (+${over}px)`);
    }
    expect(offenders, `routes overflowing at ${w}px: ${offenders.join(', ')}`).toEqual([]);
  });
}

/**
 * THE AUTH WALL HOLDS. A signed-out request for a private screen must land on
 * the login page — not render the screen, and not 500.
 */
test('private routes redirect a signed-out visitor to login', async ({ page }) => {
  for (const route of ['/app', '/app/watch', '/app/watchlist', '/app/settings', '/app/verdict']) {
    const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(res?.status() ?? 0, `${route} errored`).toBeLessThan(500);
    expect(page.url(), `${route} did not gate`).toMatch(/\/login/);
  }
});

/**
 * NO DEAD LINKS IN THE PRIMARY NAVIGATION. Every href the app puts in front of
 * a signed-out visitor has to go somewhere real.
 */
test('every link on the landing page resolves', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) =>
    Array.from(new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))),
  );
  expect(hrefs.length).toBeGreaterThan(0);
  const dead: string[] = [];
  for (const href of hrefs) {
    const res = await page.request.get(href);
    if (res.status() >= 400 && res.status() !== 401 && res.status() !== 403) {
      dead.push(`${href} → ${res.status()}`);
    }
  }
  expect(dead, `dead links: ${dead.join(', ')}`).toEqual([]);
});
