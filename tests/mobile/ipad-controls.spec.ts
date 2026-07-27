import { test, expect, type Page } from '@playwright/test';

/**
 * "Too small on iPad."
 *
 * The card grid scales with the screen — at 1024pt a cell is ~470px wide — but
 * the action row underneath did not. It was drawn once, at phone scale: 11px
 * labels in 44px boxes. 44px is a TOUCH FLOOR, not a target, and sitting on it
 * with a thousand points of width available is what "too small" means.
 *
 * These measure the real rendered controls at phone, iPad and laptop widths.
 */
async function open(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.route('**/api/ratings/**', (r) =>
    r.fulfill({ json: { ratings: { standardScore: 84, audience: 78 }, overview: 'A synopsis.' } }),
  );
  await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
}

/** Height and label size of the FOR button on the first card. */
async function actionMetrics(page: Page) {
  const btn = page.getByTestId('qa-grid').locator('> div').first().getByTestId('card-verdict-for');
  const box = await btn.boundingBox();
  const fontSize = await btn.locator('span').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  return { height: box!.height, fontSize };
}

test('a phone keeps the compact control — the floor is the right size there', async ({ page }) => {
  await open(page, 390, 844);
  const m = await actionMetrics(page);
  expect(m.height, 'phone button height').toBeGreaterThanOrEqual(44);
  expect(m.fontSize, 'phone label').toBeCloseTo(11, 0);
});

test('an iPad gets a bigger control than a phone', async ({ page }) => {
  await open(page, 390, 844);
  const phone = await actionMetrics(page);
  await open(page, 1024, 1366);
  const ipad = await actionMetrics(page);

  expect(ipad.height, 'iPad button height').toBeGreaterThan(phone.height);
  expect(ipad.fontSize, 'iPad label size').toBeGreaterThan(phone.fontSize);
  expect(ipad.height, 'iPad button is comfortably above the touch floor').toBeGreaterThanOrEqual(52);
});

test('a large iPad / laptop gets bigger still', async ({ page }) => {
  await open(page, 1024, 1366);
  const ipad = await actionMetrics(page);
  await open(page, 1366, 1024);
  const big = await actionMetrics(page);
  expect(big.height).toBeGreaterThanOrEqual(ipad.height);
  expect(big.fontSize).toBeGreaterThanOrEqual(ipad.fontSize);
});

test('save scales with the verdict pair, so the row stays one piece', async ({ page }) => {
  await open(page, 1024, 1366);
  const row = page.getByTestId('qa-grid').locator('> div').first();
  const forBox = await row.getByTestId('card-verdict-for').boundingBox();
  const save = row.getByRole('button', { name: /^Save$/i });
  test.skip((await save.count()) === 0, 'this harness card has no save button');
  const saveBox = await save.boundingBox();
  // Same height — a row where one control is shorter than its neighbours reads
  // as broken rather than as a hierarchy.
  expect(Math.round(saveBox!.height)).toBe(Math.round(forBox!.height));
});

test('the labels still fit — bigger text must not wrap the row', async ({ page }) => {
  for (const [w, h] of [[1024, 1366], [1366, 1024], [1440, 900]] as const) {
    await open(page, w, h);
    const row = page.getByTestId('qa-grid').locator('> div').first().getByTestId('card-verdict-for');
    const wrapped = await row.locator('span').first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return el.getBoundingClientRect().height > parseFloat(cs.lineHeight) * 1.5;
    });
    expect(wrapped, `label wrapped at ${w}px`).toBe(false);
  }
});
