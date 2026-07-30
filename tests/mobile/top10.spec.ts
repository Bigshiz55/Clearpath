import { test, expect, type Page } from '@playwright/test';

/**
 * THE TOP 10 RAIL.
 *
 * The shape is familiar; the claim is not. Every rival prints a number — this
 * one shows the arithmetic that produced it, and refuses to draw a breakdown
 * that does not add up. That refusal is the thing worth testing: a chart that
 * does not reconcile is worse than no chart, because it looks like proof.
 */
async function open(page: Page, w = 390, h = 844) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/dev/top10', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('top10-rail')).toBeVisible();
}

test('shows ten, never more', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-testid^="rail-item-"]')).toHaveCount(10);
});

test('the score opens its own working, in place', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('rail-work-501')).toHaveCount(0);
  await page.getByTestId('rail-score-501').click();
  const work = page.getByTestId('rail-work-501');
  await expect(work).toBeVisible();
  await expect(page.locator('dialog, [role="dialog"]')).toHaveCount(0);
});

test('the arithmetic on screen actually adds up', async ({ page }) => {
  await open(page);
  await page.getByTestId('rail-score-501').click();
  const work = page.getByTestId('rail-work-501');
  // IMDb 78 × 50% = 39.0, Rotten Tomatoes 90 × 50% = 45.0 → 84.0, +5 → 89.
  await expect(work).toContainText('IMDb');
  await expect(work).toContainText('39.0');
  await expect(work).toContainText('45.0');
  await expect(work).toContainText('84.0');
  await expect(work).toContainText('89');
});

test('the taste adjustment is its own line, not folded into the blend', async ({ page }) => {
  await open(page);
  await page.getByTestId('rail-score-501').click();
  const work = page.getByTestId('rail-work-501');
  await expect(work).toContainText('Your taste');
  await expect(work).toContainText('+5.0');
});

test('a missing source is named rather than quietly dropped', async ({ page }) => {
  await open(page);
  await page.getByTestId('rail-score-501').click();
  await expect(page.getByTestId('rail-missing-501')).toContainText('Metacritic');
});

test('REFUSES to draw a breakdown it cannot reconcile', async ({ page }) => {
  await open(page);
  await page.getByTestId('rail-score-502').click();
  await expect(page.getByTestId('rail-nowork-502')).toContainText('Not enough source data');
  await expect(page.getByTestId('rail-work-502')).not.toContainText('×');
});

test('a title with no working at all still shows its score honestly', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('rail-score-503')).toContainText('64');
  await page.getByTestId('rail-score-503').click();
  await expect(page.getByTestId('rail-nowork-503')).toBeVisible();
});

test('opening one closes the other — one explanation at a time', async ({ page }) => {
  await open(page);
  await page.getByTestId('rail-score-501').click();
  await expect(page.getByTestId('rail-work-501')).toBeVisible();
  await page.getByTestId('rail-score-502').click();
  await expect(page.getByTestId('rail-work-501')).toHaveCount(0);
  await expect(page.getByTestId('rail-work-502')).toBeVisible();
});

test('the rail scrolls itself instead of widening the page', async ({ page }) => {
  for (const v of [
    { w: 320, h: 568 },
    { w: 390, h: 844 },
    { w: 768, h: 1024 },
    { w: 1440, h: 900 },
  ]) {
    await open(page, v.w, v.h);
    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(pageOverflow, `${v.w}px page`).toBeLessThanOrEqual(1);
    // …and the rail itself genuinely has more to the right.
    const railOverflow = await page.getByTestId('top10-items').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(railOverflow, `${v.w}px rail`).toBeGreaterThan(0);
  }
});

test('every control is a real tap target on the smallest phone', async ({ page }) => {
  await open(page, 320, 568);
  const buttons = page.getByTestId('top10-rail').locator('button:visible');
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const box = await buttons.nth(i).boundingBox();
    if (!box) continue;
    expect(box.height, `button ${i}`).toBeGreaterThanOrEqual(36);
  }
});

test('the W is on rail posters too, so a pick can go straight to the docket', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('w-check-501')).toBeVisible();
  await page.getByTestId('w-check-501').click();
  await expect(page.getByTestId('w-check-501')).toHaveAttribute('aria-pressed', 'true');
});
