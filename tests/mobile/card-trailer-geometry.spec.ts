import { test, expect, type Page } from '@playwright/test';

/**
 * THE INTERACTION CONTRACT: A TRAILER MAY NEVER CHANGE THE OUTER DIMENSIONS
 * OF A CARD.
 *
 *   poster state    the poster occupies the media frame
 *   trailer state   the video replaces the poster INSIDE THE SAME frame
 *   nothing below moves
 *
 * No expansion, no row displacement, no card-height mutation, no clipping, no
 * overlay escaping into another row, no half-visible card, no giant hover card.
 * Only one trailer plays at a time, and the explicit ▶ Trailer control stays
 * available.
 *
 * These assertions measure the real thing rather than trusting the CSS: the
 * SAME card is measured before, during and after playback, and its neighbours
 * are measured with it — a card that grows pushes the row, and a row that
 * moves is the failure mode this contract exists to prevent.
 */

/** A resolvable trailer for every title, so playback can be driven offline. */
async function stubTrailers(page: Page) {
  await page.route('**/api/trailer/**', (r) =>
    r.fulfill({
      json: {
        trailer: { videoId: 'dQw4w9WgXcQ', official: true, type: 'Trailer', autoplayEligible: false },
      },
    }),
  );
  // The YouTube embed itself must never be fetched in a test run.
  await page.route('https://www.youtube-nocookie.com/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<html><body>stub</body></html>' }),
  );
}

async function open(page: Page, w: number, h: number) {
  await stubTrailers(page);
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/dev/visual-qa', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
}

/** Outer geometry of every card in the grid, rounded to whole pixels. */
async function geometry(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="qa-grid"] > .card')].map((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }),
  );
}

const WIDTHS = [
  { w: 1440, h: 900, name: 'desktop-1440' },
  { w: 1280, h: 800, name: 'desktop-1280' },
  { w: 390, h: 844, name: 'mobile-390' },
];

for (const { w, h, name } of WIDTHS) {
  test(`${name}: playing a trailer does not move one pixel of the grid`, async ({ page }) => {
    await open(page, w, h);

    const before = await geometry(page);
    expect(before.length, 'no cards in the grid').toBeGreaterThan(2);

    // Play the SECOND card, so a card exists on either side of it — a growing
    // card shows up as a displaced neighbour before it shows up as anything
    // else.
    const play = page.getByTestId('trailer-play').nth(1);
    await play.scrollIntoViewIfNeeded();
    const scrolled = await geometry(page);
    await play.click();

    const player = page.getByTestId('trailer-player');
    await expect(player).toBeVisible();
    const during = await geometry(page);
    expect(during, `the grid moved while a trailer was playing (${name})`).toEqual(scrolled);

    // The video occupies exactly the frame the poster did — no more, no less.
    const frame = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="trailer-player"]')!;
      const media = p.closest('[data-testid="trailer-media"]')!;
      const a = p.getBoundingClientRect();
      const b = media.getBoundingClientRect();
      return {
        player: { x: Math.round(a.x), y: Math.round(a.y), w: Math.round(a.width), h: Math.round(a.height) },
        media: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      };
    });
    expect(frame.player, 'the player escaped its media frame').toEqual(frame.media);

    // Closing restores the poster and, again, moves nothing.
    await page.getByTestId('trailer-close').click();
    await expect(player).toHaveCount(0);
    const after = await geometry(page);
    expect(after, `the grid moved after the trailer closed (${name})`).toEqual(scrolled);

    // And no sideways scroll appeared at any point.
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over, `horizontal overflow at ${w}`).toBeLessThanOrEqual(1);
  });
}

test('only one trailer plays at a time', async ({ page }) => {
  await open(page, 1440, 900);
  await page.getByTestId('trailer-play').nth(1).click();
  await expect(page.getByTestId('trailer-player')).toHaveCount(1);

  // Starting another releases the first, rather than leaving two iframes in
  // a grid that may hold fifty cards.
  await page.getByTestId('trailer-play').nth(3).click();
  await expect(page.getByTestId('trailer-player')).toHaveCount(1);
  await expect(page.locator('[data-testid="trailer-media"][data-playing="1"]')).toHaveCount(1);
});

test('every trailer control is a 44px target and takes focus', async ({ page }) => {
  await open(page, 390, 844);

  // THE AFFORDANCE THAT USED TO BE 68×25.
  const play = page.getByTestId('trailer-play').first();
  const pb = (await play.boundingBox())!;
  expect(pb.width, `▶ Trailer is ${pb.width}px wide`).toBeGreaterThanOrEqual(44);
  expect(pb.height, `▶ Trailer is ${pb.height}px tall`).toBeGreaterThanOrEqual(44);

  await play.click();
  await expect(page.getByTestId('trailer-player')).toBeVisible();
  for (const id of ['trailer-close', 'trailer-mute', 'trailer-restart', 'trailer-fullscreen']) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.width, `${id} is ${b.width}px wide`).toBeGreaterThanOrEqual(44);
    expect(b.height, `${id} is ${b.height}px tall`).toBeGreaterThanOrEqual(44);
    // Keyboard control: every one of them is reachable and shows a ring.
    await page.getByTestId(id).focus();
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    expect(focused, `${id} cannot take focus`).toBe(id);
  }
});

test('a trailer tap never triggers the card underneath it', async ({ page }) => {
  await open(page, 1440, 900);
  const url = page.url();
  await page.getByTestId('trailer-play').nth(1).click();
  await expect(page.getByTestId('trailer-player')).toBeVisible();
  // The poster is a link/button; the control is its SIBLING, so playing a
  // trailer must not have navigated or opened anything.
  expect(page.url()).toBe(url);
});

test('Escape closes the player and returns the poster', async ({ page }) => {
  await open(page, 1440, 900);
  await page.getByTestId('trailer-play').nth(1).click();
  await expect(page.getByTestId('trailer-player')).toBeVisible();
  const before = await geometry(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('trailer-player')).toHaveCount(0);
  expect(await geometry(page), 'Escape changed the grid').toEqual(before);
});
