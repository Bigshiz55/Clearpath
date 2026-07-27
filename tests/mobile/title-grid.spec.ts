import { test, expect, type Page } from '@playwright/test';

/**
 * THE TWELVE-CARD GRID.
 *
 * The claim being tested is not "the grid renders" — it is the honesty rule
 * that made the grid necessary: a title you leave alone must send NOTHING.
 * The old one-at-a-time lane had no way to say "never heard of it", so Skip
 * became `not_interested` and ignorance became a stated dislike. Here the
 * network is watched directly: whatever the user did not tap must not appear
 * in a single request.
 */
const VIEWPORTS = [
  { w: 320, h: 568 },
  { w: 375, h: 667 },
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
];

function items(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    mediaType: i % 3 === 0 ? 'tv' : 'movie',
    title: `Test Title ${i + 1}`,
    year: 2000 + i,
    posterPath: null,
    posterUrl: null,
    genre: 'drama',
  }));
}

async function open(page: Page, w = 1280, h = 800, n = 20) {
  await page.route('**/api/calibration*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: items(n), answered: 0, size: 20, complete: false }),
    });
  });
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/dev/title-grid', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('title-grid')).toBeVisible();
}

test('shows exactly twelve at a time, however many are available', async ({ page }) => {
  await open(page, 1280, 800, 20);
  await expect(page.locator('[data-testid^="grid-tile-"]')).toHaveCount(12);
});

test('renders at every width without horizontal overflow', async ({ page }) => {
  for (const v of VIEWPORTS) {
    await open(page, v.w, v.h);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${v.w}px`).toBeLessThanOrEqual(1);
    await expect(page.locator('[data-testid^="grid-tile-"]')).toHaveCount(12);
  }
});

test('tapping a poster selects it, tapping again clears it', async ({ page }) => {
  await open(page);
  const like = page.getByTestId('grid-like-100');
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('title-grid-submit')).toContainText('Use these 1');
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('title-grid-submit')).toBeDisabled();
});

test('"Seen it" opens a rating without leaving the grid', async ({ page }) => {
  await open(page);
  await page.getByTestId('grid-seen-101').click();
  await expect(page.getByTestId('grid-ratings-101')).toBeVisible();
  await expect(page.locator('dialog, [role="dialog"]')).toHaveCount(0);
  await page.getByTestId('grid-rate-101-loved').click();
  await expect(page.getByTestId('grid-seen-101')).toContainText('Loved');
});

test('says out loud that ignoring a title costs nothing', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('grid-no-penalty')).toContainText('not a dislike');
});

test('nothing is submitted until you ask, and never a negative', async ({ page }) => {
  const posts: string[] = [];
  await page.route('**/dev/title-grid', (r) => r.continue());
  page.on('request', (r) => {
    if (r.method() === 'POST') posts.push(r.postData() ?? '');
  });

  await open(page);
  await page.getByTestId('grid-like-100').click();
  await page.getByTestId('grid-like-102').click();
  expect(posts, 'tapping must not write anything on its own').toHaveLength(0);

  await page.getByTestId('title-grid-submit').click();
  await expect(page.getByTestId('title-grid-done')).toBeVisible();

  const body = posts.join('\n');
  // The two chosen titles are in there; nothing else is, and no negative
  // attraction appears anywhere.
  expect(body).toContain('Test Title 1');
  expect(body).toContain('Test Title 3');
  expect(body).not.toContain('Test Title 2');
  expect(body).not.toContain('not_interested');
  expect(body).not.toContain('absolutely_not');
});

test('offers a way out when none of the twelve are recognised', async ({ page }) => {
  await open(page);
  const shuffle = page.getByTestId('title-grid-shuffle');
  await expect(shuffle).toBeVisible();
  await expect(shuffle).toContainText('12 more');
  await shuffle.click();
  await expect(page.getByTestId('title-grid')).toBeVisible();
});

test('every control is a real tap target on the smallest phone', async ({ page }) => {
  await open(page, 320, 568);
  const buttons = page.getByTestId('title-grid').locator('button:visible');
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const box = await buttons.nth(i).boundingBox();
    if (!box) continue;
    expect(box.height, `button ${i}`).toBeGreaterThanOrEqual(32);
  }
});

test('an API failure says so instead of showing an empty grid', async ({ page }) => {
  await page.route('**/api/calibration*', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Nope.' }) }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/title-grid', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('title-grid-error')).toBeVisible();
});
