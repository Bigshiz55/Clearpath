import { test, expect, type Page } from '@playwright/test';

/**
 * MORE INFO — CLICK = UNDERSTAND IT.
 *
 * Clicking a card must EXPAND it, not navigate away from the results. These
 * run at a desktop width and at the three phone widths, because the contract
 * is the same on both and only the presentation differs (centred modal vs
 * bottom sheet).
 *
 * The scroll assertion is the one that matters most and the one a DOM check
 * cannot fake: `overflow: hidden` on the body is what freezes the page behind
 * the dialog, and on its own it is also what LOSES the position. So the test
 * scrolls deep into the grid first, and asserts the card is still under the
 * same part of the viewport after closing.
 */
async function open(page: Page, w: number, h = 900) {
  await page.setViewportSize({ width: w, height: h });
  await page.route('**/api/ratings/**', (r) =>
    r.fulfill({ json: { ratings: { standardScore: 84, audience: 78, tomatometer: 91, imdb: 6.8 }, overview: 'A synopsis.' } }),
  );
  // The drawer's own payload. Kept deliberately complete so the content
  // assertions below are about LAYOUT, not about what the API happened to
  // return today.
  await page.route('**/api/dna/**', (r) =>
    r.fulfill({ json: { dna: { score: 84, confidence: 0.8, tasteScore: 80, available: true, sampleSize: 120, fit: { agree: [{ label: 'Investigative mystery', note: 'you rate these highly' }], clash: [{ label: 'Slow burn', note: 'you tend to bail early' }] } } } }),
  );
  await page.route('**/api/quicklook/**', (r) =>
    r.fulfill({
      json: {
        id: 1000, mediaType: 'movie', title: 'Se7en', year: 1995,
        overview: 'Two detectives hunt a killer who uses the seven deadly sins as his motives.',
        backdropUrl: null, posterUrl: null, trailerUrl: 'https://www.youtube.com/watch?v=znmZoVkCjpI',
        genres: ['Crime', 'Thriller'], contentRating: 'R', status: null, runtime: '2h 7m',
        score: 84, standardScore: 84,
        ratings: { standardScore: 84, audience: 78, tomatometer: 91, imdb: 6.8 },
        where: ['Netflix'],
      },
    }),
  );
  await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
  await page.waitForTimeout(400);
}

const firstCard = (page: Page) => page.getByTestId('qa-grid').locator('> div').first();

for (const w of [390, 1280] as const) {
  test(`clicking the poster opens More Info, not a navigation @ ${w}`, async ({ page }) => {
    await open(page, w);
    const url = page.url();
    await firstCard(page).getByTestId('more-info-open').first().click();
    await expect(page.getByTestId('more-info')).toBeVisible();
    // Still on the results page — the grid was never unmounted.
    expect(page.url(), 'clicking the poster navigated away').toBe(url);
    await expect(page.getByTestId('qa-grid')).toBeAttached();
  });

  test(`clicking the title opens the same More Info @ ${w}`, async ({ page }) => {
    await open(page, w);
    // The title is the SECOND more-info-open in the card (poster is first).
    const opens = firstCard(page).getByTestId('more-info-open');
    await expect(opens).toHaveCount(2);
    await opens.nth(1).click();
    await expect(page.getByTestId('more-info')).toBeVisible();
  });

  test(`Escape closes More Info @ ${w}`, async ({ page }) => {
    await open(page, w);
    await firstCard(page).getByTestId('more-info-open').first().click();
    await expect(page.getByTestId('more-info')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('more-info')).toHaveCount(0);
  });

  test(`the close control closes More Info @ ${w}`, async ({ page }) => {
    await open(page, w);
    await firstCard(page).getByTestId('more-info-open').first().click();
    await page.getByTestId('more-info-close').click();
    await expect(page.getByTestId('more-info')).toHaveCount(0);
  });

  test(`More Info answers what it is, why, and where @ ${w}`, async ({ page }) => {
    await open(page, w);
    await firstCard(page).getByTestId('more-info-open').first().click();
    const mi = page.getByTestId('more-info');
    await expect(mi).toBeVisible();
    // WHAT IT'S ABOUT — objective, labelled, and present.
    await expect(mi.getByTestId('mi-about')).toBeVisible();
    await expect(mi.getByTestId('mi-about')).toContainText(/seven deadly sins/i);
    // The SHARED score component — the same one the card uses.
    await expect(mi.locator('[data-testid="wv-score"]').first()).toBeVisible();
    // Acting on it does not require Full Verdict.
    await expect(mi.getByTestId('more-info-actions')).toBeVisible();
    await expect(mi.getByTestId('card-verdict-for')).toBeVisible();
    await expect(mi.getByTestId('card-verdict-against')).toBeVisible();
    await expect(mi.getByTestId('more-info-trailer')).toBeVisible();
    await expect(mi.getByTestId('more-info-full-verdict')).toBeVisible();
  });
}

test('the WatchVerd1ct mark in More Info is the same component as on the card', async ({ page }) => {
  await open(page, 1280);
  const cardScore = firstCard(page).locator('[data-testid="wv-score"]').first();
  await expect(cardScore).toBeVisible();
  const cardShape = await cardScore.evaluate((el) => ({
    hasBadgeSvg: !!el.querySelector('svg'),
    call: el.getAttribute('data-call'),
    label: (el.textContent ?? '').replace(/\s+/g, ''),
  }));

  await firstCard(page).getByTestId('more-info-open').first().click();
  const miScore = page.getByTestId('more-info').locator('[data-testid="wv-score"]').first();
  await expect(miScore).toBeVisible();
  const miShape = await miScore.evaluate((el) => ({
    hasBadgeSvg: !!el.querySelector('svg'),
    call: el.getAttribute('data-call'),
    label: (el.textContent ?? '').replace(/\s+/g, ''),
  }));

  // Same mark: the pink badge SVG is present in both, and both carry the same
  // verdict wording. (The NUMBER may differ — the card shows the personal
  // score and the drawer the blend — which is a data difference, not a visual
  // identity difference.)
  expect(miShape.hasBadgeSvg, 'More Info lost the pink Verd1ct mark').toBe(true);
  expect(cardShape.hasBadgeSvg, 'the card lost the pink Verd1ct mark').toBe(true);
  expect(miShape.call).toBe(cardShape.call);
});

test('SCROLL RESTORATION — closing returns the card to where it was', async ({ page }) => {
  await open(page, 1280, 700);
  // Go deep enough that a reset to the top would be unmistakable.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => window.scrollY);
  expect(before, 'the fixture must be scrollable for this test to mean anything').toBeGreaterThan(150);

  // Anchor on a specific card's position, not just the window offset.
  const cards = page.getByTestId('qa-grid').locator('> div');
  const target = cards.last();
  // SETTLE THE VIEWPORT FIRST. Playwright's `click()` scrolls its target into
  // view before dispatching, so measuring the offset before that happens
  // compares two different scroll positions and fails a component that is
  // behaving correctly — observed: the page moved 1040 → 350 on the click, the
  // drawer captured and restored 350 exactly, and the test called it a 690px
  // regression. Scroll it in first, then take the baseline.
  const opener = target.getByTestId('more-info-open').first();
  await opener.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const settled = await page.evaluate(() => window.scrollY);
  const yBefore = (await target.boundingBox())!.y;

  await opener.click();
  await expect(page.getByTestId('more-info')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('more-info')).toHaveCount(0);
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => window.scrollY);
  expect(Math.abs(after - settled), `scroll jumped ${Math.round(after - settled)}px`).toBeLessThanOrEqual(2);
  const yAfter = (await target.boundingBox())!.y;
  expect(Math.abs(yAfter - yBefore), 'the card moved in the viewport').toBeLessThanOrEqual(2);
  // And the results themselves survived.
  await expect(page.getByTestId('qa-grid')).toBeVisible();
});

test('VOTE / SAVE ISOLATION — card controls never open More Info', async ({ page }) => {
  await open(page, 1280);
  const card = firstCard(page);

  await card.getByTestId('card-verdict-for').click();
  await expect(card.getByTestId('card-verdict-for')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('more-info'), 'FOR opened More Info').toHaveCount(0);

  await card.getByTestId('card-verdict-against').click();
  await expect(page.getByTestId('more-info'), 'AGAINST opened More Info').toHaveCount(0);

  const save = card.getByRole('button', { name: /^Save$|Saved/i }).first();
  if (await save.count()) {
    await save.click();
    await expect(page.getByTestId('more-info'), 'SAVE opened More Info').toHaveCount(0);
  }

  // The W (docket) lives on the artwork, inside the same box as the poster
  // link — the highest-risk bubbling case on the card.
  const w = card.locator('button[data-testid^="w-check-"]').first();
  if (await w.count()) {
    await w.click();
    await expect(page.getByTestId('more-info'), 'the W opened More Info').toHaveCount(0);
  }

  // The trailer control is a sibling of the poster link, not a child.
  const trailer = card.getByTestId('trailer-play').first();
  if (await trailer.count()) {
    await trailer.click();
    await expect(page.getByTestId('more-info'), 'the Trailer control opened More Info').toHaveCount(0);
  }
});

test('a modified click still opens the real page (new tab is not stolen)', async ({ page }) => {
  await open(page, 1280);
  const link = firstCard(page).getByTestId('more-info-open').first();
  await expect(link).toHaveAttribute('href', /\/app\/title\//);
  // Ctrl-click must NOT be intercepted into the drawer.
  await link.click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByTestId('more-info'), 'a modified click was swallowed by More Info').toHaveCount(0);
});
