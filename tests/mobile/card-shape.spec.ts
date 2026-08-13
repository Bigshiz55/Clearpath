import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * SHORTER, SQUARER TILES — AND EVERY ROW LINES UP.
 *
 * A 5-across desktop grid drew a full 2:3 poster (~420px tall at a 280px
 * column) before the score, the ratings or the FOR/AGAINST/SAVE row appeared
 * at all — a screenshot of real results showed nothing but a wall of cropped
 * artwork. And within that wall, a card with no streaming match (no "Watch on
 * X" pill) had its action row sitting 36px higher than a neighbour that had
 * one, so a row of five cards read as five different heights.
 *
 * Fixed two ways: the art box is now a fixed, shorter height from `sm` (see
 * `.wv-card-art` in globals.css) with the true poster shown uncropped via
 * `object-contain` over a blurred backdrop of the same image; and the
 * evidence zone always reserves its height, pill or no pill.
 */
const HARNESS = '/dev/finder';

function finderItem(id: number, title: string, opts: { where?: string | null } = {}) {
  return {
    id, mediaType: 'movie' as const, title, year: 2020 + id, posterPath: null, posterUrl: null as string | null,
    matchScore: 80 - id, generalScore: 75, primaryCall: 'MAYBE', reason: 'Fixture verdict.',
    where: opts.where ?? null, receipts: [], deciderUrl: `/app/title/movie/${id}`,
  };
}

async function openWithResults(page: Page, w: number, items: ReturnType<typeof finderItem>[]) {
  await page.route('**/api/finder', (route: Route) =>
    route.fulfill({ json: { items, scoredFor: 'Your match', relaxed: null } }),
  );
  await page.setViewportSize({ width: w, height: 1000 });
  await page.goto(HARNESS);
  const finder = page.getByTestId('harness-finder');
  await finder.getByRole('textbox').first().fill('a crime thriller');
  await finder.getByRole('button', { name: /Find titles/ }).first().click();
  await expect(page.locator('#finder-results')).toBeVisible();
}

const cards = (page: Page) => page.locator('#finder-results .poster-grid > *');

test('a card with no streaming pill still lines up its action row with one that has it', async ({ page }) => {
  await openWithResults(page, 1600, [
    finderItem(1, 'No Pill Here', { where: null }),
    finderItem(2, 'Has A Pill', { where: 'Netflix' }),
    finderItem(3, 'Also No Pill', { where: null }),
  ]);
  const actionRows = cards(page).locator('.wv-act-row');
  await expect(actionRows).toHaveCount(3);
  const tops: number[] = [];
  for (let i = 0; i < 3; i++) tops.push(Math.round((await actionRows.nth(i).boundingBox())!.y));
  expect(new Set(tops).size, `action rows sit at ${tops.join(', ')}`).toBe(1);
});

test('the media frame is a fixed ratio from a desktop width, not the old full 2:3', async ({ page }) => {
  // CHANGED BY THE CARD REDESIGN: the frame was two hard pixel heights (196 /
  // 216 at `lg`), which only agreed with the grid at the two widths they were
  // measured on. It is now an aspect-ratio, so every card in a row resolves to
  // the same frame height at the same column width and the frame scales with
  // the grid. It is also the box a trailer plays inside, which is why it now
  // carries `contain: layout` — see `.wv-card-art` in globals.css.
  await openWithResults(page, 1600, [finderItem(1, 'Some Movie')]);
  const art = (await cards(page).first().locator('.wv-card-art').boundingBox())!;
  // 2:3 at a ~300px column would be ~450px tall; the frame is 8:5 of the card.
  expect(art.height, `art height ${art.height}`).toBeLessThan(300);
  expect(art.height, `art height ${art.height}`).toBeGreaterThan(140);
  expect(art.width / art.height, 'the frame is not 8:5').toBeCloseTo(1.6, 1);
  const contain = await cards(page).first().locator('.wv-card-art').evaluate((el) => getComputedStyle(el).contain);
  expect(contain, 'the frame does not contain its own layout').toContain('layout');
});

test('the poster is letterboxed (object-contain), not cropped, at a desktop width', async ({ page }) => {
  const withPoster = { ...finderItem(1, 'Some Movie'), posterUrl: 'https://image.tmdb.org/t/p/w342/fixture.jpg' };
  await openWithResults(page, 1600, [withPoster]);
  // The real poster is the SECOND img in the art box — the first is the
  // decorative, aria-hidden blurred backdrop behind it (still `object-cover`
  // on purpose, so it fills the frame as a matte).
  const real = cards(page).first().locator('.wv-card-art img[alt]:not([alt=""])');
  await expect(real).toHaveCSS('object-fit', 'contain');
});

test('on a phone, the row layout and 2:3 cover are untouched', async ({ page }) => {
  await openWithResults(page, 390, [finderItem(1, 'Some Movie')]);
  const art = cards(page).first().locator('.wv-card-art');
  const box = (await art.boundingBox())!;
  // A row card: poster at ~38% of a narrow card, still true 2:3.
  expect(Math.round(box.height / box.width * 100) / 100).toBeCloseTo(1.5, 1);
});
