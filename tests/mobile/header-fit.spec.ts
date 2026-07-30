import { test, expect, type Page } from '@playwright/test';

/**
 * THE HEADER FITS THE PHONE IT IS ON.
 *
 * The persistent search button was sized at 390px — "a logo and three controls
 * at 390px and no more" — and never measured narrower. It does not fit at 375,
 * 360 or 320: the wordmark ran under the search button and printed "VERD1CT"
 * through a control, worst at 320 where the overlap was 66px.
 *
 * Two things have to hold at once, which is why the test asserts both: the
 * brand must never overlap the controls, AND the brand must not simply vanish
 * everywhere to make that true.
 */
async function header(page: Page, w: number) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
  await expect(page.locator('header').first()).toBeVisible();
}

const brand = (page: Page) => page.locator('header a[href="/app"]').first();
/** Search · account · overflow — the header's right-hand cluster. */
const controls = (page: Page) => page.locator('header > div > div').last();

for (const w of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
  test(`at ${w}px the brand never runs under the header controls`, async ({ page }) => {
    await header(page, w);
    const b = (await brand(page).boundingBox())!;
    const c = (await controls(page).boundingBox())!;
    expect(
      Math.round(b.x + b.width),
      `brand ends at ${Math.round(b.x + b.width)}, controls start at ${Math.round(c.x)}`,
    ).toBeLessThanOrEqual(Math.round(c.x));
  });
}

test('the wordmark is still there on a normal phone', async ({ page }) => {
  await header(page, 390);
  // 390 is the width most phones actually are. Yielding the wordmark is for
  // 320/360 only — if this ever fails, the fix has quietly cost the brand its
  // name on the main mobile viewport.
  await expect(brand(page)).toContainText('VERD1CT');
});

test('below 360 the mark carries the brand on its own', async ({ page }) => {
  await header(page, 320);
  // Not "the logo disappeared" — the app mark is still there and still links
  // home. Only the lettering steps aside.
  await expect(brand(page).locator('svg')).toBeVisible();
});
