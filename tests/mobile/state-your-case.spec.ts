import { test, expect, type Page } from '@playwright/test';

/**
 * A QUICK ASK IS A SHORTCUT, NOT A DETOUR.
 *
 * Tapping a preset chip filled the box AND focused it — and on iOS a
 * programmatic focus inside a tap gesture raises the keyboard, which covers the
 * bottom third of the screen and "Hit the Gavel" with it. The one tap that was
 * meant to be the shortcut left you unable to reach the button it was a
 * shortcut to.
 *
 * After a chip: the words are in the box, nothing is focused, the gavel is
 * reachable. The keyboard belongs to the box and arrives when you tap the box.
 *
 * Playwright cannot raise a real iOS keyboard, so the test asserts the thing
 * that CAUSES it — where focus is — plus the two outcomes that depend on it.
 */
const HARNESS = '/dev/mobile-home';

async function open(page: Page, w = 390) {
  await page.setViewportSize({ width: w, height: 844 });
  await page.goto(HARNESS, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('statecase-card')).toBeVisible();
}

const box = (page: Page) => page.getByTestId('statecase-card').locator('textarea');
const chip = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(label) });
const gavel = (page: Page) => page.getByRole('button', { name: /Hit the Gavel/i });

const focusedTag = (page: Page) => page.evaluate(() => document.activeElement?.tagName ?? 'NONE');

test('a preset fills the box without taking focus', async ({ page }) => {
  await open(page);
  await chip(page, 'Under 2 hours').click();

  await expect(box(page)).toHaveValue('A great movie under two hours');
  // THE WHOLE FIX: the textarea must not be focused, because focus is what
  // raises the keyboard.
  expect(await focusedTag(page), 'the chip focused the box — the keyboard opens').not.toBe('TEXTAREA');
});

test('and the gavel is right there, tappable', async ({ page }) => {
  await open(page);
  await chip(page, 'Under 2 hours').click();

  const cta = gavel(page);
  await expect(cta).toBeVisible();
  await expect(cta).toBeEnabled();
  // In view without scrolling — a button you have to hunt for is a button the
  // keyboard may as well have been covering.
  const b = (await cta.boundingBox())!;
  const vh = page.viewportSize()!.height;
  expect(b.y + b.height, 'the gavel is below the fold after a preset tap').toBeLessThanOrEqual(vh);
});

test('tapping the box IS what opens the keyboard', async ({ page }) => {
  await open(page);
  await chip(page, 'Family night').click();
  await box(page).click();
  expect(await focusedTag(page)).toBe('TEXTAREA');
  // And the words are still there to edit.
  await expect(box(page)).toHaveValue('A great family movie for tonight');
});

test('the chip you tapped looks chosen', async ({ page }) => {
  await open(page);
  const c = chip(page, 'Under 2 hours');
  await expect(c).toHaveAttribute('aria-pressed', 'false');
  await c.click();
  await expect(c).toHaveAttribute('aria-pressed', 'true');
  // Only one at a time — a second tap moves the state, it does not accumulate.
  await chip(page, 'Something funny').click();
  await expect(c).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('statecase-card').locator('button[aria-pressed="true"]')).toHaveCount(1);
});

test('typing over a preset drops the chosen state, because it is no longer that ask', async ({ page }) => {
  await open(page);
  await chip(page, 'Under 2 hours').click();
  await box(page).fill('A great movie under two hours, but funny');
  await expect(chip(page, 'Under 2 hours')).toHaveAttribute('aria-pressed', 'false');
});

test('the return key rules, so a covered gavel is never the only way out', async ({ page }) => {
  await open(page);
  let posted = 0;
  await page.route('**/api/build-case', (r) => {
    posted++;
    return r.fulfill({ json: { summary: 'Got it', stay: true } });
  });

  await box(page).click();
  await box(page).fill('Something clever with a twist');
  await page.keyboard.press('Enter');
  await expect.poll(() => posted, { message: 'Enter did not submit' }).toBe(1);
});

test('shift+enter is still a new line, not a ruling', async ({ page }) => {
  await open(page);
  let posted = 0;
  await page.route('**/api/build-case', (r) => {
    posted++;
    return r.fulfill({ json: { summary: 'Got it', stay: true } });
  });

  await box(page).click();
  await box(page).type('Two things');
  await page.keyboard.press('Shift+Enter');
  await box(page).type('and another');
  expect(posted, 'shift+enter submitted').toBe(0);
  expect(await box(page).inputValue()).toContain('\n');
});

/**
 * THE CARD GROWS ON A REAL DESKTOP. At 672px max-width the whole "State Your
 * Case" hero sat as a small central island on a laptop screen — acres of
 * black either side, tiny tiles nobody scaled up. `lg:` steps widen the card
 * and grow the tiles/textarea/button together; nothing below `lg` moves.
 */
test.describe('the hero card scales up on a laptop', () => {
  test('the card is meaningfully wider, and the tiles grow with it', async ({ page }) => {
    await open(page, 1440);
    const card = (await page.getByTestId('statecase-card').boundingBox())!;
    expect(card.width, 'card width at 1440px').toBeGreaterThan(700);
    const tile = (await chip(page, 'Under 2 hours').boundingBox())!;
    expect(tile.height, 'tile height grew for the laptop').toBeGreaterThan(70);
  });

  test('a phone is exactly what it was — the small card, small tiles', async ({ page }) => {
    await open(page, 390);
    const card = (await page.getByTestId('statecase-card').boundingBox())!;
    expect(card.width).toBeLessThan(370);
    const tile = (await chip(page, 'Under 2 hours').boundingBox())!;
    expect(tile.height).toBeLessThan(70);
  });

  test('no sideways scroll at 1440px with the bigger card', async ({ page }) => {
    await open(page, 1440);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(1);
  });
});
