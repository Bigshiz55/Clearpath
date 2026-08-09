import { test, expect, type Page } from '@playwright/test';

/**
 * "Don't like them auto moving the order after you pick. That way you can undo
 * too."
 *
 * Tapping FOR or AGAINST used to fade the card out and `display: none` it. The
 * grid then collapsed the hole, so every card after it jumped up a slot while
 * you were still looking at them — and with the card gone, a mis-tap was final.
 *
 * These measure the actual geometry: rule a card in the middle of the grid and
 * assert that NOTHING moved, and that the ruling can be taken back.
 *
 * Runs against `/dev/visual-qa`, which mounts the real PosterCard in the real
 * `.poster-grid` with the ratings endpoint stubbed (the harness has no TMDB key).
 */
async function open(page: Page, w = 390, h = 844) {
  await page.setViewportSize({ width: w, height: h });
  await page.route('**/api/ratings/**', (r) =>
    r.fulfill({ json: { ratings: { standardScore: 84, audience: 78 }, overview: 'A synopsis.' } }),
  );
  await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
}

/** Top-left corner and height of every card, in document coordinates. */
async function layout(page: Page): Promise<{ x: number; y: number; h: number }[]> {
  return page.getByTestId('qa-grid').locator('> div').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + window.scrollX), y: Math.round(r.y + window.scrollY), h: Math.round(r.height) };
    }),
  );
}

test('ruling a card does not move any other card', async ({ page }) => {
  await open(page);
  const cards = page.getByTestId('qa-grid').locator('> div');
  const before = await layout(page);
  test.skip(before.length < 3, 'needs at least three cards to detect a reflow');

  // Rule the SECOND card — the one with cards after it to be displaced.
  await cards.nth(1).getByTestId('card-verdict-for').click();
  await expect(cards.nth(1).getByTestId('card-verdict-for')).toHaveAttribute('data-active', 'true');

  // Same number of cards, and every one still starts where it started.
  expect(await cards.count(), 'card count').toBe(before.length);
  const after = await layout(page);
  for (let i = 0; i < before.length; i++) {
    expect(after[i], `card ${i} moved`).toEqual(before[i]);
  }
});

test('a ruled card does not even change its own height', async ({ page }) => {
  await open(page);
  const card = page.getByTestId('qa-grid').locator('> div').nth(1);
  const before = (await card.boundingBox())!.height;
  await card.getByTestId('card-verdict-for').click();
  await expect(card.getByTestId('card-verdict-for')).toHaveAttribute('data-active', 'true');
  const after = (await card.boundingBox())!.height;
  // A status line under the action row cost 42px here and pushed the rest of
  // the page down. The ruling has to be carried by the button itself.
  expect(Math.round(after), 'card height after ruling').toBe(Math.round(before));
});

test('the ruled card is still on screen, visible, and occupying its slot', async ({ page }) => {
  await open(page);
  const card = page.getByTestId('qa-grid').locator('> div').nth(1);
  await card.getByTestId('card-verdict-against').click();

  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box!.height, 'ruled card still has height').toBeGreaterThan(40);
  const style = await card.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { display: cs.display, opacity: cs.opacity };
  });
  expect(style.display).not.toBe('none');
  expect(Number(style.opacity)).toBeGreaterThan(0.5);
});

test('a ruling can be undone, and the card returns to neutral', async ({ page }) => {
  await open(page);
  const card = page.getByTestId('qa-grid').locator('> div').first();
  const forBtn = card.getByTestId('card-verdict-for');

  await forBtn.click();
  await expect(forBtn).toHaveAttribute('data-active', 'true');
  // The ruling is announced to assistive tech and the button says how to undo.
  await expect(card.getByTestId('card-verdict-status')).toHaveText(/Ruled FOR/);
  await expect(forBtn).toHaveAttribute('aria-label', /undo/i);

  // The ruled button IS the undo — there is no separate control, because a
  // separate control needs a row, and a row changes the card's height.
  await forBtn.click();
  await expect(forBtn).toHaveAttribute('data-active', 'false');
  await expect(card.getByTestId('card-verdict-status')).toHaveText('');
});

test('undo is discoverable without reading the label', async ({ page }) => {
  await open(page);
  const card = page.getByTestId('qa-grid').locator('> div').first();
  const against = card.getByTestId('card-verdict-against');

  // The gavel becomes a return arrow, so the state and the way out of it are
  // both visible at a glance.
  const gavelBefore = await against.locator('svg path').count();
  await against.click();
  await expect(against).toHaveAttribute('data-active', 'true');
  const arrowAfter = await against.locator('svg path').count();
  expect(arrowAfter, 'the icon changed on ruling').not.toBe(gavelBefore);

  await against.click();
  await expect(against).toHaveAttribute('data-active', 'false');
});

test('switching sides replaces the ruling rather than holding both', async ({ page }) => {
  await open(page);
  const card = page.getByTestId('qa-grid').locator('> div').first();

  await card.getByTestId('card-verdict-for').click();
  await expect(card.getByTestId('card-verdict-for')).toHaveAttribute('data-active', 'true');

  await card.getByTestId('card-verdict-against').click();
  await expect(card.getByTestId('card-verdict-against')).toHaveAttribute('data-active', 'true');
  await expect(card.getByTestId('card-verdict-for')).toHaveAttribute('data-active', 'false');
});

test('saving does not remove the card either', async ({ page }) => {
  await open(page);
  const cards = page.getByTestId('qa-grid').locator('> div');
  const before = await cards.count();

  const save = cards.first().getByRole('button', { name: /^Save$/i });
  test.skip((await save.count()) === 0, 'this harness card has no save button');
  await save.click();
  // A beat longer than the old 450ms + 300ms fade, so a reintroduced hide fails.
  await page.waitForTimeout(1000);

  expect(await cards.count()).toBe(before);
  await expect(cards.first()).toBeVisible();
});


/**
 * THE OTHER WAY TILES MOVE — and the one the earlier fix missed entirely.
 *
 * Ruling a card was made zero-reflow, and measured as such. Tiles still moved.
 * They were not moving because of the tap: each card fetches its ratings and
 * synopsis after paint, and BOTH rendered smaller while loading than after.
 * The ratings skeleton was a 16px bar that became a 24px row; the synopsis
 * rendered nothing at all and then added two lines. Every card in the grid grew
 * ~54px a few hundred milliseconds in, so the row below dropped out from under
 * your thumb while you were reaching for a button.
 *
 * Worse, the ratings row WRAPPED when the cell was narrow, so its height also
 * depended on the card's width and on how many ratings the title happened to
 * have — 24px here, 54px there, and changing on arrival.
 *
 * The earlier tests could not see any of this: they stub the endpoint to
 * resolve instantly and wait for networkidle before measuring, so every card
 * was already settled by the first measurement.
 */
const LATE = 'A former Prohibition-era gangster returns to the Lower East Side of Manhattan thirty years later.';

async function openWithLateData(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  let n = 0;
  await page.route('**/api/ratings/**', async (r) => {
    // Staggered, like a real grid: each card lands at a different moment.
    await new Promise((res) => setTimeout(res, 400 + (n++ % 4) * 250));
    await r.fulfill({
      json: { ratings: { standardScore: 84, audience: 78, rtAudience: 81, tomatometer: 90, imdb: 7.8 }, overview: LATE },
    });
  });
  await page.goto('/dev/visual-qa');
  await expect(page.getByTestId('qa-grid')).toBeVisible();
}

for (const [w, h] of [[320, 800], [390, 900], [1024, 1200], [1366, 900]] as const) {
  test(`no tile moves while the grid's data arrives @ ${w}`, async ({ page }) => {
    await openWithLateData(page, w, h);
    const atPaint = await layout(page);
    await page.waitForTimeout(2500);
    const settled = await layout(page);

    expect(settled.length).toBe(atPaint.length);
    for (let i = 0; i < atPaint.length; i++) {
      const [a, b] = [atPaint[i]!, settled[i]!];
      // ONE PIXEL OF TOLERANCE, AND ONLY ONE. The poster holds a 2:3 ratio of a
      // percentage width, so its height is fractional at most viewport widths;
      // rounding those fractions can move a card in the fifth row by a pixel
      // when the text above it changes. The defect this test exists for was
      // FIFTY-FOUR pixels — every card in the grid growing two lines a few
      // hundred milliseconds after paint, so the row below dropped out from
      // under a thumb already reaching for a button. A pixel is not that.
      expect(Math.abs(b.y - a.y), `card ${i} moved ${b.y - a.y}px once its data landed`).toBeLessThanOrEqual(1);
      expect(b.x, `card ${i} moved sideways`).toBe(a.x);
      expect(Math.abs(b.h - a.h), `card ${i} changed height by ${b.h - a.h}px`).toBeLessThanOrEqual(1);
    }
  });
}

/**
 * A BUTTON IS NEVER NARROWER THAN THE WORD ON IT.
 *
 * Found while measuring the On TV strip, but it was never confined to it: the
 * verdict buttons were `flex-1 min-w-0`, and a flex item with `min-width: 0`
 * may shrink below its own content. In a 320px poster card each button was
 * given 50px to hold an 11px "AGAINST" that measures 57 — so the word rendered
 * 3.5px outside its own border on both sides, on the main grid, on the most
 * common small phone. The floor is `.wv-act { min-width: fit-content }`, and
 * `.wv-act-row` drops the decorative icons before it lets a word be cut.
 */
for (const w of [320, 360, 390, 414] as const) {
  test(`no verdict label escapes its own button @ ${w}`, async ({ page }) => {
    await open(page, w, 900);
    const card = page.getByTestId('qa-grid').locator('> div').first();
    for (const id of ['card-verdict-for', 'card-verdict-against']) {
      const btn = card.getByTestId(id);
      const [b, l] = [await btn.boundingBox(), await btn.locator('.wv-act-label').boundingBox()];
      expect(l!.x, `${id} label starts left of its border`).toBeGreaterThanOrEqual(b!.x);
      expect(l!.x + l!.width, `${id} label ends past its border`).toBeLessThanOrEqual(b!.x + b!.width);
    }
  });
}

/**
 * WIDTHS MOVED, RULE UNCHANGED.
 *
 * This walked 320 / 390 / 1024. The three rating chips are `sm`-and-up on a
 * result card now — a two-across phone tile gives this row ~102px, which fits
 * "IMDb 6" and calls it a rating (see `.wv-score-ratings` in globals.css) — so
 * at 320 and 390 there is no row to measure and `boundingBox()` returned null.
 *
 * The rule being tested is that the row NEVER WRAPS, so its height cannot vary
 * with the card's width or with how many ratings a title happens to have. That
 * needs two widths at the same type size plus one at the deliberate `lg`
 * scale-up, which is exactly what 768 / 900 / 1024 are.
 */
test('the ratings row is one line at every width, so its height cannot vary', async ({ page }) => {
  const heights: number[] = [];
  for (const [w, h] of [[768, 900], [900, 900], [1024, 1200]] as const) {
    await openWithLateData(page, w, h);
    await page.waitForTimeout(2000);
    const card = page.getByTestId('qa-grid').locator('> div').first();
    const row = card.locator('.wv-ratings-row').first();
    const [cardBox, rowBox] = [await card.boundingBox(), await row.boundingBox()];
    heights.push(Math.round(rowBox!.height));
    // The wrap was the original fix for IMDb escaping the panel. A three-column
    // grid has to keep that guarantee without buying it with a variable height.
    expect(rowBox!.x + rowBox!.width, `ratings escape the card at ${w}px`).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
  }
  // One line everywhere: 768 and 900 must agree, and only the deliberate
  // large-screen scale-up at `lg` may differ.
  expect(heights[0]).toBe(heights[1]);
});
