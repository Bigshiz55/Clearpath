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

/** Top-left corner of every card in the grid, in document coordinates. */
async function layout(page: Page): Promise<{ x: number; y: number }[]> {
  return page.getByTestId('qa-grid').locator('> div').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + window.scrollX), y: Math.round(r.y + window.scrollY) };
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
