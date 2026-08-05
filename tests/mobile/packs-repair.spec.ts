import { test, expect, type Page } from '@playwright/test';

/**
 * PACK REPAIR — the components that replaced the empty panels, rendered
 * through /dev/packs/repair with fixture props (the exact components the real
 * /packs/[slug] page uses). What these pin:
 *
 *  - the upcoming-schedule fallback shows REAL rows with honest evidence
 *    badges — verified says "Premiere", derived says "First airing in our
 *    data" (never passed off as verified), plain scheduled gets no badge;
 *  - catalog-derived franchises render in numbered release order, labelled
 *    as catalog-derived, linking to real title pages;
 *  - the stale-data notice tells the customer the data is behind instead of
 *    pretending the pack is empty;
 *  - the checklist's two empty states name their causes — never the old
 *    catch-all "Nothing ingested yet".
 *
 * Both required viewports: 1440x900 (laptop) and 390x844 (phone).
 */
async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/dev/packs/repair', { waitUntil: 'networkidle' });
}

for (const [label, width, height] of [
  ['laptop', 1440, 900],
  ['phone', 390, 844],
] as const) {
  test.describe(`${label} (${width}x${height})`, () => {
    test('upcoming schedule shows rows with honest evidence badges', async ({ page }) => {
      await open(page, width, height);
      const schedule = page.getByTestId('pack-upcoming-schedule');
      await expect(schedule).toBeVisible();
      await expect(schedule.getByTestId('pack-upcoming-row')).toHaveCount(3);

      const verified = schedule.getByTestId('pack-upcoming-row').filter({ hasText: 'Sample Verified Premiere Movie' });
      await expect(verified.getByText('Premiere', { exact: true })).toBeVisible();

      const derived = schedule.getByTestId('pack-upcoming-row').filter({ hasText: 'Sample First-Seen Movie' });
      await expect(derived.getByText('First airing in our data')).toBeVisible();
      // Derived is never passed off as a verified premiere.
      await expect(derived.getByText('Premiere', { exact: true })).toHaveCount(0);

      const scheduled = page.getByTestId('pack-upcoming-row').filter({ hasText: 'Sample Rerun Movie' });
      await expect(scheduled).toBeVisible();
      await expect(scheduled.getByText('Premiere', { exact: true })).toHaveCount(0);
      await expect(scheduled.getByText('First airing in our data')).toHaveCount(0);
    });

    test('catalog franchises: numbered release order, honest label, real title links', async ({ page }) => {
      await open(page, width, height);
      const groups = page.getByTestId('catalog-franchise');
      await expect(groups).toHaveCount(2);

      const movies = groups.filter({ hasText: 'Sample Mystery Franchise' });
      await expect(movies.getByText('catalog-derived, not editorially verified')).toBeVisible();
      const links = movies.locator('a[href^="/app/title/"]');
      await expect(links).toHaveCount(3);
      await expect(links.nth(0)).toContainText('The First Case');
      await expect(links.nth(1)).toContainText('The Second Case');
      // Unknown year sorts last, never guessed into the middle.
      await expect(links.nth(2)).toContainText('Year Unknown');
      await expect(links.nth(0)).toHaveAttribute('href', '/app/title/movie/900001');

      const series = groups.filter({ hasText: 'Sample Flagship Series' });
      await expect(series.getByText('Flagship series, from the TMDB catalog.')).toBeVisible();
      await expect(series.locator('a[href^="/app/title/tv/"]')).toHaveCount(1);
    });

    test('the stale-data notice admits staleness instead of faking emptiness', async ({ page }) => {
      await open(page, width, height);
      const notice = page.getByTestId('pack-stale-notice');
      await expect(notice).toBeVisible();
      await expect(notice).toContainText('Listings data is stale');
      await expect(notice).toContainText('real but may be behind');
    });

    test('checklist renders items and both honest empty states — never "Nothing ingested yet"', async ({ page }) => {
      await open(page, width, height);
      await expect(page.getByText('Watched 1 of 2')).toBeVisible();
      await expect(page.getByText('Sample Checklist Movie Two')).toBeVisible();

      await expect(page.getByText("This Pack's channels aren't wired up")).toBeVisible();
      await expect(page.getByText("No titles from this Pack's channels yet")).toBeVisible();
      await expect(page.getByText('Nothing ingested yet')).toHaveCount(0);
    });

    test('no sideways scroll', async ({ page }) => {
      await open(page, width, height);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `overflow at ${width}`).toBeLessThanOrEqual(1);
    });
  });
}
