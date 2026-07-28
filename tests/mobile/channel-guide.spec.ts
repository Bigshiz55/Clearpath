import { test, expect, type Page } from '@playwright/test';

/**
 * THE FULL CHANNEL GUIDE — the cable-box view of the grid we already ingest.
 *
 * "There's like 300 channels all going on at the same time. I'm sure there are
 * Hallmark movies, Lifetime movies, etc. that are on TV." There are — the app
 * ingests the full national lineup hourly, and until now the only way to see
 * any of it was a typed, filtered question. These tests drive the browsable
 * view: one row per channel, on-now first with real progress, up next with
 * clock times, and a search that finds a channel OR what is playing on it.
 */
async function open(page: Page, w = 390) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto('/dev/channel-guide', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('channel-guide')).toBeVisible();
}

const channels = (page: Page) => page.getByTestId('guide-channel');

test('one row per channel — the dead channel is dropped, not shown empty', async ({ page }) => {
  await open(page);
  // 7 networks in the fixture, one with only ended airings.
  await expect(channels(page)).toHaveCount(6);
  await expect(page.getByTestId('channel-guide')).not.toContainText('Dead Channel');
});

test('the Hallmark movie is ON NOW, with progress, and channels live now lead', async ({ page }) => {
  await open(page);
  const first = channels(page).first();
  // Live channels lead alphabetically: ESPN, Food Network, Hallmark, History, TCM… then Lifetime.
  await expect(first).toContainText('ESPN');
  const hallmark = channels(page).filter({ hasText: 'Hallmark' });
  await expect(hallmark.getByTestId('guide-on-now')).toContainText('Autumn in the City');
  await expect(hallmark.locator('text=On now')).toBeVisible();
  // Lifetime has nothing running at the fixed now — it follows the live group.
  // `text-transform: uppercase` reaches innerText, so compare normalized.
  const names = (await channels(page).locator('h3').allInnerTexts()).map((n) => n.trim().toLowerCase());
  expect(names.indexOf('lifetime')).toBeGreaterThan(names.indexOf('tcm'));
});

test('up next carries real clock times, movies marked as movies', async ({ page }) => {
  await open(page);
  const hallmark = channels(page).filter({ hasText: 'Hallmark' });
  const next = hallmark.getByTestId('guide-up-next');
  await expect(next).toContainText('A Second Chance Christmas');
  await expect(next).toContainText('🎬');
  await expect(next).toContainText(/\d{1,2}:\d{2}/);
});

test('the header sentence counts what the rows actually show', async ({ page }) => {
  await open(page);
  const stats = page.getByTestId('guide-stats');
  await expect(stats).toContainText('6 channels');
  await expect(stats).toContainText('5 on now');
  await expect(stats).toContainText('movies');
});

test('search finds a channel by name…', async ({ page }) => {
  await open(page);
  await page.getByTestId('guide-search').fill('lifetime');
  await expect(channels(page)).toHaveCount(1);
  await expect(channels(page)).toContainText('Lifetime');
});

test('…and by what is playing on it', async ({ page }) => {
  await open(page);
  await page.getByTestId('guide-search').fill('football');
  await expect(channels(page)).toHaveCount(1);
  await expect(channels(page)).toContainText('ESPN');
});

test('a search that matches nothing says so instead of drawing an empty guide', async ({ page }) => {
  await open(page);
  await page.getByTestId('guide-search').fill('zzzzz');
  await expect(page.getByTestId('guide-no-match')).toBeVisible();
  await page.getByTestId('guide-search').fill('');
  await expect(channels(page)).toHaveCount(6);
});

for (const w of [320, 390, 768, 1440]) {
  test(`no sideways scroll at ${w}px`, async ({ page }) => {
    await open(page, w);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `overflow at ${w}`).toBeLessThanOrEqual(1);
  });
}
