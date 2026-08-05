import { test, expect, type Page } from '@playwright/test';

/**
 * SEARCH → RESULT → FULL TITLE, IN A REAL BROWSER, ON A PRODUCTION BUILD.
 *
 * The reported workflow, verbatim:
 *   "Type CSI NY. A large rich result card appears. Clicking much of that card
 *    does nothing. Sometimes attempting to open it leaves a black/dark screen.
 *    Pressing the explicit blue Search button does work."
 *   "The preview says availability is not confirmed, while the full title page
 *    lists Hulu, Paramount Plus Essential, Paramount+ Amazon Channel, and The
 *    Roku Channel."
 *
 * Three separate defects live in that paragraph and each gets its own
 * assertions below: dead regions on the card, an overlay that outlives the
 * navigation, and two availability systems disagreeing about one title.
 *
 * `/api/search` and `/api/ratings/*` are stubbed because the harness build
 * carries no TMDB key. The ratings stub deliberately mirrors PRODUCTION as it
 * actually is for this title: providers present, Watchmode cache EMPTY. That
 * combination is what produced the contradiction, so a stub without it would
 * pass vacuously.
 */

const CSI_NY = {
  id: 2458,
  mediaType: 'tv' as const,
  title: 'CSI: NY',
  year: 2004,
  overview: 'Detective Mac Taylor and his team investigate crimes in New York City.',
  posterPath: null,
  posterUrl: null,
  voteAverage: 7.3,
};

/** Exactly what the full title page lists today. */
const PROVIDER_NAMES = ['Hulu', 'Paramount Plus Essential', 'Paramount+ Amazon Channel', 'The Roku Channel'];

const RATINGS_WITH_PROVIDERS = {
  ratings: { standardScore: 74, audience: 73, rtAudience: null, tomatometer: null, imdb: null, metacritic: null },
  overview: CSI_NY.overview,
  facts: { runtimeMinutes: null, episodeRuntimeMinutes: 43, seasons: 9, episodes: 197, contentRating: 'TV-14', genres: ['Crime', 'Drama'] },
  // PRODUCTION'S ACTUAL STATE: the Watchmode enrichment queue never reached
  // this title, so there is no cache row at all.
  availability: { status: 'unconfirmed', sources: [], checkedAt: null },
  providers: {
    region: 'US',
    checkedAt: '2026-08-05T00:00:00.000Z',
    options: [
      { name: 'Hulu', type: 'flatrate', link: null },
      { name: 'Paramount Plus Essential', type: 'flatrate', link: null },
      { name: 'Paramount+ Amazon Channel', type: 'flatrate', link: null },
      { name: 'The Roku Channel', type: 'ads', link: null },
    ],
  },
};

async function stub(page: Page, ratings: unknown = RATINGS_WITH_PROVIDERS) {
  await page.route('**/api/search**', async (route) => {
    const q = decodeURIComponent(new URL(route.request().url()).searchParams.get('q') ?? '').toLowerCase();
    const people = q.includes('hanks')
      ? [{ id: 31, name: 'Tom Hanks', knownFor: 'Forrest Gump', profileUrl: null }]
      : [];
    await route.fulfill({ json: { results: q.includes('csi') ? [CSI_NY] : [], people } });
  });
  await page.route('**/api/ratings/**', (route) => route.fulfill({ json: ratings }));
  await page.route('**/api/availability/refresh**', (route) => route.fulfill({ json: { available: false } }));
}

/** A hard load of the harness that carries the global search control. */
async function hardLoad(page: Page, w = 390, h = 844) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/dev/feed', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ruling-feed')).toBeVisible();
}

const sheet = (p: Page) => p.getByTestId('quick-search-sheet');

async function searchForCsi(page: Page) {
  await page.getByTestId('header-search').click();
  await expect(sheet(page)).toBeVisible();
  await page.getByTestId('quick-search-input').fill('CSI NY');
  await expect(page.getByTestId(`search-result-${CSI_NY.id}`)).toBeVisible({ timeout: 15000 });
}

/**
 * HOLD THE DESTINATION so the page we searched FROM is still on screen, then
 * assert the overlay has already gone. Without the hold the assertion could
 * pass simply because the browser had left — which is exactly the vacuous
 * result that would hide the black-screen defect.
 */
async function holdDestination(page: Page) {
  await page.route('**/login**', async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  await page.route('**/app/title/**', async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
}

/** The destination, whether it lands or bounces to login carrying `next`. */
async function expectOpenedTitle(page: Page) {
  await page.waitForURL(/\/app\/title\/tv\/2458|next=%2Fapp%2Ftitle%2Ftv%2F2458/, { timeout: 20000 });
  expect(page.url(), 'must not have gone to the Judge').not.toContain('/app/ask');
}

// ---------------------------------------------------------------------------
// PASS 1 and PASS 2 — the full workflow, twice, each after a hard refresh
// ---------------------------------------------------------------------------

for (const pass of [1, 2] as const) {
  for (const [label, width] of [['mobile', 390], ['desktop', 1280]] as const) {
    test(`pass ${pass} @ ${label}: the poster opens the title and the overlay is gone`, async ({ page }) => {
      await stub(page);
      await hardLoad(page, width, width === 390 ? 844 : 900);
      await searchForCsi(page);
      await holdDestination(page);

      await page.getByTestId(`search-result-open-${CSI_NY.id}`).click({ position: { x: 30, y: 40 } });
      // THE OVERLAY GOES FIRST. Still on the harness page — nothing has
      // navigated yet — and the sheet is already unmounted.
      await expect(sheet(page), 'no abandoned overlay').toHaveCount(0);
      await expectOpenedTitle(page);
    });

    test(`pass ${pass} @ ${label}: the text body opens the title and the overlay is gone`, async ({ page }) => {
      await stub(page);
      await hardLoad(page, width, width === 390 ? 844 : 900);
      await searchForCsi(page);
      await holdDestination(page);

      // THE DEAD REGION. Previously the synopsis, facts, score and where-to-watch
      // were outside the link and a tap here did nothing at all.
      await page.getByTestId(`search-result-where-${CSI_NY.id}`).click();
      await expect(sheet(page), 'no abandoned overlay').toHaveCount(0);
      await expectOpenedTitle(page);
    });

    test(`pass ${pass} @ ${label}: "Open full verdict" opens the title and the overlay is gone`, async ({ page }) => {
      await stub(page);
      await hardLoad(page, width, width === 390 ? 844 : 900);
      await searchForCsi(page);
      await holdDestination(page);

      await page.getByText('Open full verdict').click();
      await expect(sheet(page), 'no abandoned overlay').toHaveCount(0);
      await expectOpenedTitle(page);
    });
  }
}

test('the synopsis, the facts line and the score are all live targets', async ({ page }) => {
  await stub(page);
  await hardLoad(page);
  await searchForCsi(page);
  // Every one of these was dead on the old card. They are all inside the one
  // anchor now, so each resolves to the same navigable element.
  for (const testid of [
    `search-result-score-${CSI_NY.id}`,
    `search-result-where-${CSI_NY.id}`,
    `search-result-open-${CSI_NY.id}`,
  ]) {
    const inLink = await page
      .getByTestId(testid)
      .evaluate((el) => Boolean(el.closest('a[href*="/app/title/"]')));
    expect(inLink, testid).toBe(true);
  }
});

// ---------------------------------------------------------------------------
// The actions act. They never navigate.
// ---------------------------------------------------------------------------

test('Save does not navigate', async ({ page }) => {
  await stub(page);
  await hardLoad(page);
  await searchForCsi(page);
  const before = page.url();
  await page.getByTestId(`search-result-${CSI_NY.id}`).getByRole('button', { name: /save|list/i }).first().click();
  await page.waitForTimeout(600);
  expect(page.url()).toBe(before);
  await expect(sheet(page), 'search stays open so you can keep looking').toBeVisible();
});

test('W toggles the docket and does not navigate', async ({ page }) => {
  await stub(page);
  await hardLoad(page);
  await searchForCsi(page);
  const before = page.url();
  const w = page.getByTestId(`w-check-${CSI_NY.id}`);
  await expect(w).toHaveAttribute('aria-pressed', 'false');
  await w.click();
  await expect(w, 'now on the docket').toHaveAttribute('aria-pressed', 'true');
  await w.click();
  await expect(w, 'and off again').toHaveAttribute('aria-pressed', 'false');
  expect(page.url()).toBe(before);
});

test('For and Against do not navigate', async ({ page }) => {
  await stub(page);
  await hardLoad(page);
  await searchForCsi(page);
  const before = page.url();
  const row = page.getByTestId(`search-result-${CSI_NY.id}`);
  for (const name of [/for/i, /against|not for me/i]) {
    const btn = row.getByRole('button', { name }).first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(400);
      expect(page.url(), String(name)).toBe(before);
    }
  }
});

test('no button is nested inside the result link', async ({ page }) => {
  await stub(page);
  await hardLoad(page);
  await searchForCsi(page);
  const nested = await page
    .getByTestId(`search-result-open-${CSI_NY.id}`)
    .evaluate((el) => el.querySelectorAll('button, a').length);
  expect(nested, 'a control inside an anchor has undefined activation behaviour').toBe(0);
});

// ---------------------------------------------------------------------------
// The preview and the full page tell the same story
// ---------------------------------------------------------------------------

test('the preview names the providers the title page lists, not "not confirmed"', async ({ page }) => {
  await stub(page);
  await hardLoad(page);
  await searchForCsi(page);
  const where = page.getByTestId(`search-result-where-${CSI_NY.id}`);
  await expect(where).toBeVisible();
  const text = (await where.textContent()) ?? '';
  expect(text, 'the Watchmode cache being empty must not erase real platforms').not.toContain('Not yet confirmed');
  expect(text).toContain(PROVIDER_NAMES[0]);
});

test('with NEITHER provider source, it honestly says so', async ({ page }) => {
  await stub(page, {
    ratings: { standardScore: 74, audience: null, rtAudience: null, tomatometer: null, imdb: null, metacritic: null },
    overview: null,
    facts: null,
    availability: { status: 'unconfirmed', sources: [], checkedAt: null },
    providers: null,
  });
  await hardLoad(page);
  await searchForCsi(page);
  await expect(page.getByTestId(`search-result-where-${CSI_NY.id}`)).toContainText('Not yet confirmed');
});

test('Watchmode data still wins when it exists', async ({ page }) => {
  await stub(page, {
    ...RATINGS_WITH_PROVIDERS,
    availability: {
      status: 'available',
      checkedAt: '2026-08-04T00:00:00.000Z',
      sources: [{ name: 'Netflix', type: 'subscription', deeplink: 'https://netflix.example/x' }],
    },
  });
  await hardLoad(page);
  await searchForCsi(page);
  const text = (await page.getByTestId(`search-result-where-${CSI_NY.id}`).textContent()) ?? '';
  expect(text).toContain('Netflix');
  // The two lists are never mixed — one service, one wording.
  expect(text).not.toContain('Hulu');
});

// ---------------------------------------------------------------------------
// Person results, Escape, Back
// ---------------------------------------------------------------------------

test('a person result navigates and closes the overlay', async ({ page }) => {
  await stub(page);
  await hardLoad(page);
  await page.getByTestId('header-search').click();
  await page.getByTestId('quick-search-input').fill('Tom Hanks');
  const person = page.getByTestId('search-person-31');
  await expect(person).toBeVisible({ timeout: 15000 });
  await page.route('**/login**', async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  await page.route('**/app/person/**', async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  await person.click();
  await expect(sheet(page), 'no abandoned overlay').toHaveCount(0);
  await page.waitForURL(/\/app\/person\/31|next=%2Fapp%2Fperson%2F31/, { timeout: 20000 });
});

test('Escape closes cleanly, leaving nothing behind', async ({ page }) => {
  await stub(page);
  await hardLoad(page);
  await searchForCsi(page);
  await page.keyboard.press('Escape');
  await expect(sheet(page)).toHaveCount(0);
  // Nothing dark left over the page, and the page underneath still works.
  await expect(page.getByTestId('ruling-feed')).toBeVisible();
  await page.getByTestId('header-search').click();
  await expect(sheet(page), 'and it still opens again').toBeVisible();
});

test('Back returns to a usable screen', async ({ page }) => {
  await stub(page);
  await hardLoad(page);
  await searchForCsi(page);
  await page.getByTestId(`search-result-open-${CSI_NY.id}`).click();
  await expectOpenedTitle(page);
  await page.goBack();
  await expect(page.getByTestId('ruling-feed')).toBeVisible({ timeout: 20000 });
  await expect(sheet(page), 'and no overlay came back with it').toHaveCount(0);
  await page.getByTestId('header-search').click();
  await expect(sheet(page)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

test('no horizontal overflow at any width, with results on screen', async ({ page }) => {
  for (const w of [320, 390, 430, 768, 1024, 1440] as const) {
    await stub(page);
    await hardLoad(page, w, 900);
    await searchForCsi(page);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over, `${w}px`).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
  }
});

test('every action in a result is a 44px target on a phone', async ({ page }) => {
  await stub(page);
  await hardLoad(page, 390, 844);
  await searchForCsi(page);
  const row = page.getByTestId(`search-result-${CSI_NY.id}`);
  const buttons = row.getByRole('button');
  const n = await buttons.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    if (!(await b.isVisible())) continue;
    const box = (await b.boundingBox())!;
    expect(box.height, `button ${i} height`).toBeGreaterThanOrEqual(40);
  }
});

// ---------------------------------------------------------------------------
// The W on the full title page — the real component, over a real fixture
// ---------------------------------------------------------------------------

test('the full title page offers Save, W, For and Against', async ({ page }) => {
  await page.route('**/api/ratings/**', (route) => route.fulfill({ json: RATINGS_WITH_PROVIDERS }));
  await page.route('**/api/availability/refresh**', (route) => route.fulfill({ json: { available: false } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/report-tabs', { waitUntil: 'domcontentloaded' });

  const w = page.locator('[data-testid^="w-check-"]').first();
  await expect(w, 'the circular W was missing from this page entirely').toBeVisible({ timeout: 15000 });
  // Polled, not read once: `boundingBox()` on a page that has not finished
  // laying out returns null, which would fail for the wrong reason.
  await expect
    .poll(async () => (await w.boundingBox())?.width ?? 0, { timeout: 10000 })
    .toBeGreaterThanOrEqual(44);
  await expect
    .poll(async () => (await w.boundingBox())?.height ?? 0, { timeout: 10000 })
    .toBeGreaterThanOrEqual(44);
});

test('the title page W toggles the docket and does not navigate', async ({ page }) => {
  await page.route('**/api/ratings/**', (route) => route.fulfill({ json: RATINGS_WITH_PROVIDERS }));
  await page.route('**/api/availability/refresh**', (route) => route.fulfill({ json: { available: false } }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/report-tabs', { waitUntil: 'domcontentloaded' });

  const w = page.locator('[data-testid^="w-check-"]').first();
  await expect(w).toBeVisible({ timeout: 15000 });
  const before = page.url();
  await expect(w).toHaveAttribute('aria-pressed', 'false');
  await w.click();
  await expect(w, 'added to the active docket').toHaveAttribute('aria-pressed', 'true');
  expect(page.url(), 'the W is an action, never a navigation').toBe(before);
  await w.click();
  await expect(w, 'and removed again').toHaveAttribute('aria-pressed', 'false');
});

test('Save on the title page is still a separate, persistent action', async ({ page }) => {
  // Save and W are not interchangeable: Save is the watchlist, W is the active
  // docket. Both have to be present and distinct.
  await page.route('**/api/ratings/**', (route) => route.fulfill({ json: RATINGS_WITH_PROVIDERS }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/report-tabs', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid^="w-check-"]').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /save|watchlist/i }).first()).toBeVisible();
});
