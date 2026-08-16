import { test, expect, type Page } from '@playwright/test';

/**
 * WHAT'S ON TODAY — the real component over stored-shape rows, in a real
 * browser. The claims:
 *   • sections render only where the data supports them;
 *   • Movies Today carries ONLY provider-classified movies;
 *   • scores appear ONLY on engine-matched titles (no invented numbers);
 *   • rendering and interacting performs ZERO requests to any listings
 *     source — the page reads stored truth.
 */

const LISTING_HOSTS = /tvmedia|tvpassport|tvguide|zap2it|titantv|ontvtonight|gracenote/i;

async function open(page: Page): Promise<string[]> {
  const outbound: string[] = [];
  page.on('request', (r) => {
    if (LISTING_HOSTS.test(r.url())) outbound.push(r.url());
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/dev/whats-on-today', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('whats-on-today')).toBeVisible();
  return outbound;
}

test('sections render from stored rows — supported sections only', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('wot-on-now')).toBeVisible();
  await expect(page.getByTestId('wot-movies-today')).toBeVisible();
  await expect(page.getByTestId('wot-sports-today')).toBeVisible();
  await expect(page.getByTestId('wot-premieres')).toBeVisible();
  await expect(page.getByTestId('wot-worth-watching')).toBeVisible();
});

test('Movies Today lists only provider-classified movies', async ({ page }) => {
  await open(page);
  const movies = page.getByTestId('wot-movies-today');
  await expect(movies).toContainText('Running Matinee');
  await expect(movies).toContainText('Prime Time Film');
  await expect(movies).not.toContainText('Unscored Drama');
  await expect(movies).not.toContainText('Evening Kickoff');
});

test('scores wear only on matched titles — unmatched rows carry no number', async ({ page }) => {
  await open(page);
  const worth = page.getByTestId('wot-worth-watching');
  await expect(worth).toContainText('Prime Time Film');
  await expect(worth).toContainText('Scored Sitcom');
  await expect(worth).not.toContainText('Unscored Drama');
  await expect(page.getByTestId('wot-score')).toHaveCount(2);
});

test('zero requests to any listings source while rendering and refreshing', async ({ page }) => {
  const outbound = await open(page);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('whats-on-today')).toBeVisible();
  expect(outbound).toEqual([]);
});
