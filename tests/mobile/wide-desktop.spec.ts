import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * THE MACBOOK VIEW. A photo of the deployed finder on a laptop showed the
 * whole page locked to a ~672px column: two giant posters between two fields
 * of black. The phone layout was simply being worn on a desktop.
 *
 * The contract these tests pin:
 *  - the QUESTION keeps a readable column at every width (a 1500px textarea
 *    is a worse textarea),
 *  - the RESULTS take the container, and extra width becomes MORE columns at
 *    the same card size — never wider cards,
 *  - nothing changes on a phone.
 */
const HARNESS = '/dev/finder';

function finderItem(id: number, title: string) {
  return {
    id, mediaType: 'movie' as const, title, year: 2023, posterPath: null, posterUrl: null,
    matchScore: 88, generalScore: 80, primaryCall: 'STREAM IT', reason: 'Fixture verdict.',
    where: 'Netflix', receipts: ['On Netflix'], deciderUrl: `/app/title/movie/${id}`,
  };
}

async function openWithResults(page: Page, w: number, h = 950) {
  await page.route('**/api/finder', (route: Route) =>
    route.fulfill({
      json: {
        items: Array.from({ length: 8 }, (_, i) => finderItem(i + 1, `Result ${i + 1}`)),
        scoredFor: 'Your match',
        relaxed: null,
      },
    }),
  );
  await page.setViewportSize({ width: w, height: h });
  await page.goto(HARNESS);
  const finder = page.getByTestId('harness-finder');
  await finder.getByRole('textbox').first().fill('a crime thriller');
  await finder.getByRole('button', { name: /Find titles/ }).first().click();
  await expect(page.locator('#finder-results')).toBeVisible();
  await expect(page.getByText('Result 1')).toBeVisible();
}

const grid = (page: Page) => page.locator('#finder-results .poster-grid');
const cards = (page: Page) => page.locator('#finder-results .poster-grid > *');

/** How many cards share the first row's top edge. */
async function columnsOf(page: Page): Promise<number> {
  const n = await cards(page).count();
  const tops: number[] = [];
  for (let i = 0; i < n; i++) tops.push(Math.round((await cards(page).nth(i).boundingBox())!.y));
  return tops.filter((t) => t === tops[0]).length;
}

test('a MacBook window gets a wide grid of normal-size cards, not two posters', async ({ page }) => {
  await openWithResults(page, 1512);
  const g = (await grid(page).boundingBox())!;
  expect(g.width, 'the results use the screen').toBeGreaterThan(1100);
  expect(await columnsOf(page), 'columns at 1512px').toBeGreaterThanOrEqual(4);
  // Extra width multiplies columns; it must never inflate a single card.
  const card = (await cards(page).first().boundingBox())!;
  expect(card.width, 'card width stays human').toBeLessThan(400);
});

test('the question keeps a readable column on that same wide screen', async ({ page }) => {
  await openWithResults(page, 1512);
  const ask = (await page.getByTestId('harness-finder').getByRole('textbox').first().boundingBox())!;
  expect(ask.width, 'the textarea is a column, not a banner').toBeLessThan(700);
  // And it sits centered, not stranded on the left edge.
  expect(ask.x).toBeGreaterThan(300);
});

test('an even wider desktop just gets more columns', async ({ page }) => {
  await openWithResults(page, 1900);
  expect(await columnsOf(page)).toBeGreaterThanOrEqual(5);
  const card = (await cards(page).first().boundingBox())!;
  expect(card.width).toBeLessThan(400);
});

/**
 * THE PHONE IS TWO COLUMNS NOW (owner-approved), NOT ONE.
 *
 * This asserted `columnsOf === 1` — the retired single-column-of-sideways-cards
 * phone grid. The point of the test is unchanged and is about the WIDE end of
 * the range: extra desktop width must become MORE columns at the same card
 * size, and it must not reach down and disturb the phone. So the phone still
 * gets its own assertion here; the number it is pinned to is the current
 * approved one, and the two properties that actually guard the phone — the grid
 * uses the full width, and nothing scrolls sideways — are untouched.
 */
test('a phone is exactly what it was — two columns, full width, no sideways scroll', async ({ page }) => {
  await openWithResults(page, 390, 844);
  expect(await columnsOf(page)).toBe(2);
  const g = (await grid(page).boundingBox())!;
  expect(g.width).toBeGreaterThan(330); // the grid still uses the phone's width
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
});
