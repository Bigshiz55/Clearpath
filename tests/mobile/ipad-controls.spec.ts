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
  await page.route('**/api/quicklook/**', (r) =>
    r.fulfill({
      json: {
        id: 1000, mediaType: 'movie', title: 'Se7en', year: 1995, overview: 'A synopsis.',
        backdropUrl: null, posterUrl: null, trailerUrl: null, genres: [], contentRating: null,
        status: null, runtime: null, score: 84, standardScore: 84,
        ratings: { standardScore: 84, audience: 78 }, where: [],
      },
    }),
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
  // 10px below 414, not 11: the label gives up a point there so AGAINST is not
  // jammed against its own border in a 171px row (see `.wv-act-label` in
  // globals.css and on-tv-highlights.spec.ts). The height floor — the thing
  // this test is actually about — is unchanged at 44.
  expect(m.fontSize, 'phone label').toBeCloseTo(10, 0);
});

test('an iPad gets a bigger control than a phone', async ({ page }) => {
  await open(page, 390, 844);
  const phone = await actionMetrics(page);
  await open(page, 1024, 1366);
  const ipad = await actionMetrics(page);

  expect(ipad.height, 'iPad button height').toBeGreaterThan(phone.height);
  expect(ipad.fontSize, 'iPad label size').toBeGreaterThan(phone.fontSize);
  // Above the 44px floor, but no longer 52+: "make them slightly shorter and
  // give them a little more breathing room above them". A taller button is not
  // a more tappable one past ~48px; the air around it is what makes it usable.
  expect(ipad.height, 'iPad button is comfortably above the touch floor').toBeGreaterThanOrEqual(48);
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


/**
 * "Use the extra real estate to increase ratings."
 *
 * The evidence under the score — Rotten Tomatoes, the audience score, IMDb —
 * was drawn at the size it needs to be on a 390px phone, on a card nearly 500px
 * wide. Those numbers are the reason to trust the VERD1CT above them, so on a
 * screen with room they should be read at a glance, not squinted at.
 */
/**
 * MOVED SURFACE, SAME RULE. The card-redesign pass took the source-rating chips
 * off the browse card (they are the working behind the number, and on a grid
 * column they wrapped to their own row) and into More Info. "Too small on iPad"
 * applies wherever they are drawn, so the measurement follows them.
 */
async function ratingsRow(page: Page) {
  await page.getByTestId('qa-grid').locator('> div').first().getByTestId('card-more-info').click();
  const modal = page.getByTestId('quicklook');
  await expect(modal).toBeVisible();
  await page.waitForTimeout(300);
  const row = modal.locator('.wv-ratings-row').first();
  await expect(row).toBeVisible();
  return row;
}

async function ratingsMetrics(page: Page) {
  const row = await ratingsRow(page);
  return row.evaluate((el) => ({ fontSize: parseFloat(getComputedStyle(el).fontSize) }));
}

test('the ratings row is bigger on an iPad than on a phone', async ({ page }) => {
  await open(page, 390, 844);
  const phone = await ratingsMetrics(page);
  await open(page, 1024, 1366);
  const ipad = await ratingsMetrics(page);

  expect(ipad.fontSize, 'iPad ratings text').toBeGreaterThan(phone.fontSize);

  // Type size ONLY. Row height is not a property of this fix: it depends on
  // whether the chips wrap, which depends on how many ratings the title
  // actually has. Measured with a full set it is 54px on a phone (two lines)
  // and 24px on an iPad (one) — bigger text AND shorter — and with a sparse
  // set it is 24px at both. An assertion on height would have failed the fix
  // for succeeding in one case and been meaningless in the other.
});

test('and bigger again on a wide screen', async ({ page }) => {
  await open(page, 1024, 1366);
  const ipad = await ratingsMetrics(page);
  await open(page, 1366, 1024);
  const wide = await ratingsMetrics(page);
  expect(wide.fontSize).toBeGreaterThanOrEqual(ipad.fontSize);
});

test('the bigger ratings still fit inside their panel at every width', async ({ page }) => {
  for (const [w, h] of [[1024, 1366], [1280, 900], [1440, 900]] as const) {
    await open(page, w, h);
    const row = await ratingsRow(page);
    const panel = page.getByTestId('quicklook').locator('> div').first();
    const [panelBox, rowBox] = [await panel.boundingBox(), await row.boundingBox()];
    // IMDb escaping its container is the old bug this row already had once.
    expect(rowBox!.x + rowBox!.width, `ratings overflow their panel at ${w}px`)
      .toBeLessThanOrEqual(panelBox!.x + panelBox!.width + 1);
  }
});
