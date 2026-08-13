import { test, expect, type Page } from '@playwright/test';

/**
 * THE TOP PICKS RAIL.
 *
 * The shape is familiar; the claim is not. Every rival prints a number — this
 * one shows the arithmetic that produced it, and refuses to draw a breakdown
 * that does not add up. That refusal is the thing worth testing: a chart that
 * does not reconcile is worse than no chart, because it looks like proof.
 *
 * ── UPDATED BY THE RANKING-RAIL REDESIGN ──────────────────────────────────
 * The claim above is untouched and every assertion about it is unchanged. What
 * changed is the presentation it hangs off: the 5.5rem grey numeral behind each
 * poster became a small rank badge ON the artwork, and the detached green
 * "89 HOW?" box became the app's own Verd1ct badge, its verdict word, and a
 * quiet "Why #N?" control.
 *
 * And one behaviour: the evidence panel opens BELOW the rail rather than inside
 * the item. Measured, the in-item panel grew the rail by 230px and pushed the
 * next five titles; the rail must not move when you ask a question about one
 * poster in it. That is asserted at the bottom of this file.
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
  // Disclosure in place, still — not a dialog to dismiss before browsing on.
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
  // The number lives on the Verd1ct badge now, not inside the control — the
  // control is the QUESTION ("Why #3?"), which is the point of the redesign.
  // What must not change: the score is still shown, and pressing the question
  // still admits there is no working behind it rather than drawing one.
  await expect(page.locator('[data-testid="rail-item-503"]')).toContainText('64');
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

// ── THE REDESIGN ──────────────────────────────────────────────────────────

test('rank is a small badge on the artwork, not typography behind it', async ({ page }) => {
  await open(page, 1440, 900);
  const chip = page.getByTestId('rail-rank-501');
  await expect(chip).toHaveText('#1');
  const box = (await chip.boundingBox())!;
  const frame = (await page.locator('[data-testid="rail-item-501"] .wv-rail-frame').boundingBox())!;
  // Small: the old numeral was 5.5rem (88px) of line-height.
  expect(box.height, `the rank chip is ${Math.round(box.height)}px tall`).toBeLessThanOrEqual(28);
  // ON the artwork, inside the frame — not in a gutter beside it.
  expect(box.x).toBeGreaterThanOrEqual(frame.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
  expect(box.y).toBeGreaterThanOrEqual(frame.y - 1);
});

test('the score speaks the app\'s own language, not a generic green box', async ({ page }) => {
  await open(page, 1440, 900);
  const item = page.locator('[data-testid="rail-item-501"]');
  // The Verd1ct TV badge carries the number, and the call is the verdict word.
  await expect(item).toContainText('89');
  await expect(item).toContainText(/STREAM IT|WATCH IT|WORTH|MAYBE|SKIP/i);
  // The explanation is a quiet control, not "HOW?" shouted on every tile.
  await expect(page.getByTestId('rail-score-501')).toHaveText(/Why #1\?/);
  await expect(item).not.toContainText('HOW?');
});

test('THE RAIL DOES NOT GROW — opening the evidence moves no poster', async ({ page }) => {
  await open(page, 1440, 900);
  const rail = page.getByTestId('top10-items');
  const before = (await rail.boundingBox())!;
  const neighbourBefore = (await page.locator('[data-testid="rail-item-502"]').boundingBox())!;

  await page.getByTestId('rail-score-501').click();
  await expect(page.getByTestId('rail-work-501')).toBeVisible();

  const after = (await rail.boundingBox())!;
  const neighbourAfter = (await page.locator('[data-testid="rail-item-502"]').boundingBox())!;
  // Measured before the redesign: the in-item panel grew the rail by 230px.
  expect(Math.round(after.height), 'the rail grew').toBe(Math.round(before.height));
  expect(Math.round(neighbourAfter.y), 'the next title moved').toBe(Math.round(neighbourBefore.y));
  expect(Math.round(neighbourAfter.x), 'the next title moved sideways').toBe(Math.round(neighbourBefore.x));
});

test('every item shares one baseline whatever its title does', async ({ page }) => {
  await open(page, 1440, 900);
  const items = page.locator('[data-testid^="rail-item-"]');
  const n = await items.count();
  const heights: number[] = [];
  for (let i = 0; i < n; i++) heights.push(Math.round((await items.nth(i).boundingBox())!.height));
  expect(Math.max(...heights) - Math.min(...heights), `heights ${heights.join(', ')}`).toBeLessThanOrEqual(1);
});

test('a trailer plays inside the poster frame and moves nothing', async ({ page }) => {
  await page.route('**/api/trailer/**', (r) =>
    r.fulfill({ json: { trailer: { videoId: 'dQw4w9WgXcQ', official: true, type: 'Trailer', autoplayEligible: true } } }),
  );
  await page.route('https://www.youtube-nocookie.com/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0;background:#111"></body></html>' }),
  );
  await open(page, 1440, 900);
  const rail = page.getByTestId('top10-items');
  const item = page.locator('[data-testid="rail-item-501"]');
  const before = { rail: (await rail.boundingBox())!, item: (await item.boundingBox())! };

  await item.getByTestId('trailer-play').click();
  await expect(item.getByTestId('trailer-player')).toBeVisible();

  const during = { rail: (await rail.boundingBox())!, item: (await item.boundingBox())! };
  expect(Math.round(during.rail.height), 'the rail grew during preview').toBe(Math.round(before.rail.height));
  expect(Math.round(during.item.height), 'the item grew during preview').toBe(Math.round(before.item.height));
  // Rank and title stay readable while the trailer runs.
  await expect(page.getByTestId('rail-rank-501')).toBeVisible();
  await expect(item).toContainText('Reconciling Pick');
});
