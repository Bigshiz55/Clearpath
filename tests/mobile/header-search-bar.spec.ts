import { test, expect, type Page } from '@playwright/test';

/**
 * A REAL SEARCH BOX AT THE TOP OF EVERY SCREEN.
 *
 * "There needs to be a search box at the top of every screen no matter where
 * you go — you can just put in a show or movie if you want." The icon +
 * sheet (`QuickSearchTrigger`/`QuickSearch`) already covers every width
 * including a phone's tight header, but it's an icon that OPENS a box, not a
 * box. From a real desktop width — once the header genuinely has a free
 * middle — it is now an actual typeable input, always visible, that submits
 * straight through without a modal.
 */
async function open(page: Page, w: number) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
  await expect(page.locator('header').first()).toBeVisible();
}

const bar = (page: Page) => page.getByTestId('header-search-bar');
const icon = (page: Page) => page.getByTestId('header-search');

for (const w of [1280, 1440, 1600, 1920]) {
  test(`the search box is visible in the header at ${w}px`, async ({ page }) => {
    await open(page, w);
    await expect(bar(page)).toBeVisible();
  });
}

for (const w of [768, 1024]) {
  test(`below the free-middle width (${w}px) the icon covers it instead, unchanged`, async ({ page }) => {
    await open(page, w);
    await expect(bar(page)).toBeHidden();
    await expect(icon(page)).toBeVisible();
  });
}

test('typing a title and hitting enter navigates straight there — no modal', async ({ page }) => {
  await open(page, 1440);
  const before = page.url();
  await bar(page).fill('Oppenheimer');
  await bar(page).press('Enter');
  // The dev harness carries no session, so the app's own auth gate bounces an
  // /app/ask navigation to /login?next=... — same as any other real link here
  // would. What this test is pinning is that the bar acted on Enter at all
  // (the query survives the round trip) and never opened the sheet over it.
  await expect.poll(() => page.url()).not.toBe(before);
  expect(decodeURIComponent(page.url())).toContain('Oppenheimer');
  await expect(page.getByTestId('quick-search-sheet')).toHaveCount(0);
});

test('an empty box does nothing — no navigation, no lost place', async ({ page }) => {
  await open(page, 1440);
  const before = page.url();
  await bar(page).press('Enter');
  await page.waitForTimeout(200);
  expect(page.url()).toBe(before);
});

test('the header controls never overlap the search box or each other, at every desktop width', async ({ page }) => {
  for (const w of [1280, 1440, 1600, 1920]) {
    await open(page, w);
    const nav = page.locator('header nav').first();
    const search = bar(page);
    const rightCluster = page.locator('header > div > div').last();
    const [n, s, r] = await Promise.all([nav.boundingBox(), search.boundingBox(), rightCluster.boundingBox()]);
    expect(n, `nav at ${w}`).not.toBeNull();
    expect(s, `search at ${w}`).not.toBeNull();
    expect(r, `right cluster at ${w}`).not.toBeNull();
    expect(Math.round(n!.x + n!.width), `nav ends before search at ${w}`).toBeLessThanOrEqual(Math.round(s!.x) + 1);
    expect(Math.round(s!.x + s!.width), `search ends before right cluster at ${w}`).toBeLessThanOrEqual(Math.round(r!.x) + 1);
  }
});
