import { test, expect, type Page } from '@playwright/test';

/**
 * SEARCH, IN A REAL BROWSER, ON A PRODUCTION BUILD.
 *
 * Two reported failures, both release-blocking:
 *   1. "the search button does nothing, especially on iPhone"
 *   2. "an exact title search returns an unrelated Judge recommendation"
 *
 * The unit tests pin the rules; these pin the BEHAVIOUR — a real tap, real
 * hydration timing, a real URL afterwards.
 *
 * `/api/search` is stubbed because the harness build carries no TMDB key, so
 * the catalog would otherwise be empty and every assertion about "the exact
 * title wins" would pass vacuously. The stub returns a deliberately
 * ADVERSARIAL ordering — the popular near-match first — so the exact-match
 * rule has to actually work rather than benefit from luck.
 */

const CATALOG = [
  { id: 2734, mediaType: 'tv', title: 'CSI: Crime Scene Investigation', year: 2000, overview: '', posterPath: null, posterUrl: null, voteAverage: 7.8 },
  { id: 1431, mediaType: 'tv', title: 'CSI: Miami', year: 2002, overview: '', posterPath: null, posterUrl: null, voteAverage: 7.4 },
  { id: 2458, mediaType: 'tv', title: 'CSI: NY', year: 2004, overview: '', posterPath: null, posterUrl: null, voteAverage: 7.3 },
];

async function stubSearch(page: Page) {
  await page.route('**/api/search**', async (route) => {
    const q = decodeURIComponent(new URL(route.request().url()).searchParams.get('q') ?? '').toLowerCase();
    const results = CATALOG.filter((c) => c.title.toLowerCase().includes(q.split(':')[0]!.trim()));
    const people = q.includes('hanks')
      ? [{ id: 31, name: 'Tom Hanks', knownFor: 'Forrest Gump', profileUrl: null }]
      : [];
    await route.fulfill({ json: { results, people } });
  });
}

async function feed(page: Page, w = 390, h = 844) {
  await page.setViewportSize({ width: w, height: h });
  await stubSearch(page);
  await page.goto('/dev/feed', { waitUntil: 'domcontentloaded' });
}

const sheet = (p: Page) => p.getByTestId('quick-search-sheet');
const input = (p: Page) => p.getByTestId('quick-search-input');

/**
 * Assert search ended up at `path`.
 *
 * The harness has no session, so `/app/*` is gated by middleware and lands on
 * `/login?next=<path>`. That redirect IS the proof: the destination search
 * resolved is right there in the query string. Accepting either form keeps the
 * test about routing rather than about authentication.
 */
async function expectLandedOn(p: Page, path: string) {
  const direct = path.replace(/\//g, '\\/');
  const bounced = `next=${encodeURIComponent(path)}`;
  await p.waitForURL(new RegExp(`${direct}|${bounced}`), { timeout: 15000 });
  expect(p.url(), 'must not have gone to the Judge').not.toContain('/app/ask');
}

// ---------------------------------------------------------------------------
// 1. The button opens search on the first tap, even mid-hydration
// ---------------------------------------------------------------------------

test('a request fired BEFORE the sheet mounts is honoured after it mounts', async ({ page }) => {
  await stubSearch(page);
  // Exactly the lost-tap case: the mark is set while nothing is listening.
  // An init script runs before the document has a root element at all, so the
  // mark has to be left the moment one exists — still long before hydration.
  await page.addInitScript(() => {
    const mark = () => document.documentElement?.setAttribute('data-wv-search-pending', '1');
    mark();
    document.addEventListener('readystatechange', mark);
  });
  await page.goto('/dev/feed', { waitUntil: 'domcontentloaded' });
  await expect(sheet(page)).toBeVisible();
});

test('the first tap opens it on a hard load, with the page still hydrating', async ({ page }) => {
  await stubSearch(page);
  // Hold the JS back so the tap genuinely lands in the pre-hydration window —
  // the exact condition that made the button look dead on a slow iPhone.
  await page.route('**/*.js', async (route) => {
    await new Promise((r) => setTimeout(r, 700));
    await route.continue();
  });
  await page.goto('/dev/feed', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('header-search').click({ force: true });
  // Nothing was listening when that landed; it must still open.
  await expect(sheet(page)).toBeVisible({ timeout: 15000 });
});

test('open, close and open again — repeatedly', async ({ page }) => {
  await feed(page);
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('header-search').click();
    await expect(sheet(page), `open ${i}`).toBeVisible();
    await page.getByTestId('quick-search-close').click();
    await expect(sheet(page), `close ${i}`).toHaveCount(0);
  }
});

test('the floating trigger works once the header scrolls away', async ({ page }) => {
  await feed(page);
  await page.mouse.wheel(0, 900);
  await expect(page.getByTestId('floating-search')).toBeVisible();
  const box = (await page.getByTestId('floating-search').boundingBox())!;
  expect(box.width, 'tap target').toBeGreaterThanOrEqual(44);
  expect(box.height, 'tap target').toBeGreaterThanOrEqual(44);
  await page.getByTestId('floating-search').click();
  await expect(sheet(page)).toBeVisible();
});

// ---------------------------------------------------------------------------
// 2. An empty box does nothing
// ---------------------------------------------------------------------------

test('an empty search does nothing at all', async ({ page }) => {
  await feed(page);
  const before = page.url();
  await page.getByTestId('header-search').click();
  await page.getByTestId('quick-search-submit').click();
  await page.waitForTimeout(300);
  await expect(sheet(page)).toBeVisible();
  expect(page.url()).toBe(before);
});

// ---------------------------------------------------------------------------
// 3. An exact title is a title, not a recommendation
// ---------------------------------------------------------------------------

test('“CSI: NY” opens CSI: NY — not the Judge, not the more popular sibling', async ({ page }) => {
  await feed(page);
  await page.getByTestId('header-search').click();
  await input(page).fill('CSI: NY');
  await input(page).press('Enter');
  // 2458 is CSI: NY. The stub returns CSI: Crime Scene Investigation FIRST, so
  // landing here proves the exact-title rule beat the popularity ordering.
  await expectLandedOn(page, '/app/title/tv/2458');
});

test('the search box does not keep your last query', async ({ page }) => {
  // Pinned on the DESKTOP bar deliberately: that one lives in the header and
  // never unmounts, so a query left behind stays on screen. (The sheet's box is
  // destroyed when it closes, so asserting there would pass no matter what.)
  await page.setViewportSize({ width: 1440, height: 900 });
  await stubSearch(page);
  // The visual-QA harness mounts the REAL header, which is the only place the
  // desktop bar lives (`xl:flex` inside Nav).
  await page.goto('/dev/visual-qa', { waitUntil: 'domcontentloaded' });
  const bar = page.getByTestId('header-search-bar');
  await expect(bar).toBeVisible();

  // Hold the destination so the page we searched FROM is still on screen when
  // we look at the box.
  await page.route('**/login**', async (route) => {
    await new Promise((r) => setTimeout(r, 5000));
    await route.continue();
  });
  await bar.fill('CSI: NY');
  await bar.press('Enter');
  await expect(bar).toHaveValue('', { timeout: 10000 });
});

test('a loose query opens the best catalog result', async ({ page }) => {
  await feed(page);
  await page.getByTestId('header-search').click();
  await input(page).fill('CSI');
  await input(page).press('Enter');
  await expectLandedOn(page, '/app/title/tv/2734');
});

test('a person search surfaces the person', async ({ page }) => {
  await feed(page);
  await page.getByTestId('header-search').click();
  await input(page).fill('Tom Hanks');
  await expect(page.getByRole('link', { name: /Tom Hanks/ })).toBeVisible({ timeout: 15000 });
});

// ---------------------------------------------------------------------------
// 4. A genuine recommendation request still reaches the Judge
// ---------------------------------------------------------------------------

test('“Find me three crime thrillers under two hours” goes to Ask the Judge', async ({ page }) => {
  await feed(page);
  await page.getByTestId('header-search').click();
  await input(page).fill('Find me three crime thrillers under two hours');
  await input(page).press('Enter');
  // The harness has no session, so /app/ask bounces to login carrying the
  // query — what matters is that it went to ask, not to a title.
  await page.waitForURL(/q=Find\+me|q=Find%20me/, { timeout: 15000 });
  expect(page.url()).not.toMatch(/\/app\/title\//);
});

// ---------------------------------------------------------------------------
// 5. Available everywhere, and big enough to hit
// ---------------------------------------------------------------------------

test('the trigger is present and 44px at every phone width', async ({ page }) => {
  for (const w of [320, 390, 430] as const) {
    await feed(page, w, 844);
    // Measured only once it is genuinely laid out — `boundingBox()` on a page
    // that has not painted yet returns null and would fail for the wrong reason.
    await expect(page.getByTestId('header-search')).toBeVisible();
    const box = (await page.getByTestId('header-search').boundingBox())!;
    expect(box.width, `${w}px width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${w}px height`).toBeGreaterThanOrEqual(44);
  }
});

test('the sheet never scrolls the page sideways', async ({ page }) => {
  for (const w of [320, 390, 430, 1024] as const) {
    await feed(page, w, 900);
    await page.getByTestId('header-search').click();
    await expect(sheet(page)).toBeVisible();
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over, `${w}px`).toBeLessThanOrEqual(1);
    await page.getByTestId('quick-search-close').click();
  }
});

test('voice search is still offered where the browser supports it', async ({ page }) => {
  await feed(page);
  await page.addInitScript(() => {
    // Chromium headless does not expose it; the control must appear when a
    // browser does. Removing voice was explicitly out of scope.
    (window as unknown as Record<string, unknown>).SpeechRecognition = function () {};
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('header-search').click();
  await expect(page.getByRole('button', { name: /voice/i })).toBeVisible({ timeout: 10000 });
});
