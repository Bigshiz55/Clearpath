import { test, expect, type Page } from '@playwright/test';

/**
 * PACK PAGES — Hallmark Universe (premiere calendar) and Crime Case Files
 * (Case browser), rendered through the /dev/packs harness with the exact same
 * PremiereListOrCalendar / CaseList / PackEmptyState components the real
 * /packs/[slug] route uses, driven by fixture data instead of a live
 * Supabase session (no credentials in this environment). Covers both
 * required viewports: 1440x900 (laptop) and 390x844 (phone).
 */
async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/dev/packs', { waitUntil: 'networkidle' });
}

for (const [label, width, height] of [
  ['laptop', 1440, 900],
  ['phone', 390, 844],
] as const) {
  test.describe(`${label} (${width}x${height})`, () => {
    test('both Pack sections render with real content', async ({ page }) => {
      await open(page, width, height);
      await expect(page.getByRole('heading', { name: 'Hallmark Universe' })).toBeVisible();
      await expect(page.getByText('A Cranberry Christmas')).toBeVisible();
      await expect(page.getByText('Mystery 101: The Locked Room')).toBeVisible();

      await expect(page.getByRole('heading', { name: 'Crime Case Files' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'The Fixture Case' })).toBeVisible();
      await expect(page.getByText(/Covered across 3 networks/)).toBeVisible();
      await expect(page.getByText('You have seen 1 of 3 episodes covering this case.')).toBeVisible();
      await expect(page.getByText(/Unmatched — not yet linked to a Case/)).toBeVisible();
    });

    test('the calendar view toggle works', async ({ page }) => {
      await open(page, width, height);
      await page.getByRole('button', { name: 'Month' }).first().click();
      await expect(page.locator('text=Sun').first()).toBeVisible();
    });

    test('no sideways scroll', async ({ page }) => {
      await open(page, width, height);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `overflow at ${width}`).toBeLessThanOrEqual(1);
    });
  });
}
