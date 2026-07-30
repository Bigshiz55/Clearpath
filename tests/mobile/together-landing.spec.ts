import { test, expect } from '@playwright/test';

/**
 * TONIGHT, TOGETHER — one page, one action (Stage 1 acceptance).
 *
 * The page described Live Court twice and offered three competing entry
 * cards. These tests pin the corrected hierarchy: no duplicated description
 * copy, exactly one filled button above the fold, the other modes at link
 * weight, and a centered column at every desktop width.
 */
const ROUTE = '/dev/together';

test('no phrase from the Live Court description appears twice', async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const text = await page.locator('main').innerText();
  // Normalize and look for any repeated 5-word shingle — a stronger check
  // than eyeballing the two paragraphs that used to overlap.
  const words = text.toLowerCase().replace(/[^\w\s']/g, ' ').split(/\s+/).filter(Boolean);
  const seen = new Map<string, number>();
  const dupes: string[] = [];
  for (let i = 0; i + 5 <= words.length; i++) {
    const shingle = words.slice(i, i + 5).join(' ');
    const prev = seen.get(shingle);
    if (prev != null && prev < i - 4) dupes.push(shingle);
    if (prev == null) seen.set(shingle, i);
  }
  expect(dupes, `repeated copy: ${[...new Set(dupes)].join(' | ')}`).toEqual([]);
});

test('exactly one filled button, with the other modes as text links', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });

  const start = page.getByTestId('start-court');
  await expect(start).toBeVisible();
  await expect(start).toHaveText('Start a Court');
  // Above the fold at 1440×900.
  const box = await start.boundingBox();
  expect(box!.y + box!.height).toBeLessThan(900);

  // The one FILLED button: among visible buttons/links, only start-court has
  // an opaque background fill.
  const filled = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('main button, main a')) {
      if (!el.offsetParent) continue;
      const bg = getComputedStyle(el).backgroundColor;
      const m = bg.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) continue;
      const alpha = m[4] == null ? 1 : Number(m[4]);
      if (alpha >= 0.9) out.push((el.textContent || '').trim().slice(0, 30));
    }
    return out;
  });
  expect(filled, `filled controls: ${filled.join(', ')}`).toEqual(['Start a Court']);

  // Secondary modes are links, not cards — and disclose in place.
  await expect(page.getByTestId('open-crews')).toBeVisible();
  await expect(page.getByTestId('open-device')).toBeVisible();
  await page.getByTestId('open-device').click();
  await expect(page.getByTestId('together-secondary')).toContainText('stored just on this phone');
});

for (const w of [1440, 1920, 2560]) {
  test(`the content column is horizontally centered @ ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    const box = await page.locator('main > div').first().boundingBox();
    const leftGap = box!.x;
    const rightGap = w - (box!.x + box!.width);
    expect(Math.abs(leftGap - rightGap), `left ${leftGap} vs right ${rightGap}`).toBeLessThanOrEqual(24);
  });
}

test('no custom Back/Home/Forward row anywhere on the page', async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Go back to the previous page')).toHaveCount(0);
  await expect(page.getByLabel('Go to the home page')).toHaveCount(0);
});

test('fits a phone with no sideways scroll @ 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('start-court')).toBeVisible();
});
