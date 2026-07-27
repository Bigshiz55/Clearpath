import { test, expect, type Page } from '@playwright/test';

/**
 * THE QUICK TASTE QUIZ, DRIVEN FOR REAL.
 *
 * Runs against `/dev/taste-quiz`, which mounts the actual component. What is
 * being proved here is the interaction, not the pixels: four answers everywhere,
 * a dense list on a laptop and one card on a phone, "Depends" that clarifies
 * inline instead of interrupting, an undo that genuinely reverses, a refresh
 * that does not cost the quiz, and a panel that never reports a dozen answers
 * as a finished profile.
 */
const PHONES = [
  { w: 320, h: 568 },
  { w: 360, h: 740 },
  { w: 375, h: 667 },
  { w: 390, h: 844 },
];
const WIDE = [
  { w: 768, h: 1024 },
  { w: 1024, h: 768 },
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
];

async function open(page: Page, w = 1280, h = 800) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/dev/taste-quiz', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('taste-quiz')).toBeVisible();
}

async function currentRowId(page: Page): Promise<string> {
  const row = page.locator('[data-testid^="quiz-row-"][data-current="true"]').first();
  const id = await row.getAttribute('data-testid');
  return (id ?? '').replace('quiz-row-', '');
}

test('offers exactly four answers on every statement', async ({ page }) => {
  await open(page);
  const rows = page.locator('[data-testid^="quiz-row-"]');
  const n = await rows.count();
  expect(n).toBeGreaterThanOrEqual(10);
  for (let i = 0; i < n; i++) {
    const group = rows.nth(i).locator('[role="group"] button');
    await expect(group).toHaveCount(4);
  }
});

test('shows a dense list on a laptop — six or more statements at once', async ({ page }) => {
  await open(page, 1440, 900);
  const rows = page.locator('[data-testid^="quiz-row-"]:visible');
  expect(await rows.count()).toBeGreaterThanOrEqual(6);
});

test('shows one card at a time on a phone', async ({ page }) => {
  for (const v of PHONES) {
    await open(page, v.w, v.h);
    const visible = page.locator('[data-testid^="quiz-row-"]:visible');
    expect(await visible.count(), `${v.w}px`).toBe(1);
  }
});

test('never overflows horizontally at any width', async ({ page }) => {
  for (const v of [...PHONES, ...WIDE]) {
    await open(page, v.w, v.h);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${v.w}px`).toBeLessThanOrEqual(1);
  }
});

test('every answer button is a real tap target on the smallest phone', async ({ page }) => {
  await open(page, 320, 568);
  const buttons = page.getByTestId('taste-quiz').locator('button:visible');
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const box = await buttons.nth(i).boundingBox();
    if (!box) continue;
    expect(box.height, `button ${i}`).toBeGreaterThanOrEqual(36);
  }
});

test('answering advances and records progress', async ({ page }) => {
  await open(page);
  const first = await currentRowId(page);
  await page.getByTestId(`answer-${first}-exactly`).click();
  await expect(page.getByTestId('quiz-progress')).toContainText('1 of');
  expect(await currentRowId(page)).not.toBe(first);
});

test('the keyboard answers the highlighted statement', async ({ page }) => {
  await open(page);
  const first = await currentRowId(page);
  await page.keyboard.press('1');
  await expect(page.getByTestId(`quiz-row-${first}`)).toHaveAttribute('data-answered', 'true');
  await expect(page.getByTestId('quiz-progress')).toContainText('1 of');
});

test('"Depends" clarifies inline — chips appear, no dialog, nothing blocks', async ({ page }) => {
  await open(page);
  // Walk forward until a statement that actually offers chips is current.
  let id = await currentRowId(page);
  for (let i = 0; i < 12; i++) {
    await page.getByTestId(`answer-${id}-depends`).click();
    if (await page.getByTestId(`chips-${id}`).isVisible()) break;
    id = await currentRowId(page);
  }
  await expect(page.getByTestId(`chips-${id}`)).toBeVisible();
  await expect(page.locator('dialog, [role="dialog"]')).toHaveCount(0);
  // The answer is already recorded — the chips are optional refinement.
  await expect(page.getByTestId(`quiz-row-${id}`)).toHaveAttribute('data-answered', 'true');
  await page.getByTestId(`chips-done-${id}`).click();
  expect(await currentRowId(page)).not.toBe(id);
});

test('Back genuinely reverses the last answer', async ({ page }) => {
  await open(page);
  const first = await currentRowId(page);
  await page.getByTestId(`answer-${first}-exactly`).click();
  await expect(page.getByTestId('quiz-progress')).toContainText('1 of');
  await page.getByTestId('quiz-back').click();
  await expect(page.getByTestId('quiz-progress')).toContainText('0 of');
  await expect(page.getByTestId(`quiz-row-${first}`)).toHaveAttribute('data-answered', 'false');
});

test('a refresh does not cost the quiz', async ({ page }) => {
  await open(page);
  const first = await currentRowId(page);
  await page.getByTestId(`answer-${first}-exactly`).click();
  const second = await currentRowId(page);
  await page.getByTestId(`answer-${second}-not_me`).click();
  await expect(page.getByTestId('quiz-progress')).toContainText('2 of');

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('quiz-progress')).toContainText('2 of');
  await expect(page.getByTestId(`quiz-row-${first}`)).toHaveAttribute('data-answered', 'true');
});

test('coverage and confidence are two different numbers, and neither oversells', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('quiz-live-dna')).toBeVisible();
  await expect(page.getByTestId('dna-label')).toHaveText('Starting');

  const rows = page.locator('[data-testid^="quiz-row-"]');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const id = await currentRowId(page);
    if (!id) break;
    await page.getByTestId(`answer-${id}-exactly`).click();
  }

  // A dozen emphatic answers is a real start and nothing more. The label must
  // say so — this is the claim the whole panel exists to keep honest.
  await expect(page.getByTestId('dna-label')).not.toHaveText('Highly Calibrated');
  const coverage = await page.getByTestId('dna-coverage').innerText();
  const confidence = await page.getByTestId('dna-confidence').innerText();
  expect(coverage).toMatch(/\d+%/);
  expect(confidence).toMatch(/\d+%/);
});

test('the reveal shows what was heard, in the user’s own answers, and can be corrected', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 5; i++) {
    const id = await currentRowId(page);
    if (!id) break;
    await page.getByTestId(`answer-${id}-exactly`).click();
  }
  await page.getByTestId('quiz-finish').click();
  await expect(page.getByTestId('taste-quiz-reveal')).toBeVisible();
  await expect(page.getByTestId('reveal-lines').locator('li').first()).toBeVisible();

  // Signed out, the harness must say nothing was saved rather than imply it was.
  await expect(page.getByTestId('quiz-signin-note')).toBeVisible();

  await page.getByTestId('reveal-resume').click();
  await expect(page.getByTestId('taste-quiz')).toBeVisible();
});

test('the reveal survives a quiz that taught us nothing', async ({ page }) => {
  await open(page);
  // Skip everything, answer one statement that moves no dial.
  const id = await currentRowId(page);
  await page.getByTestId(`answer-${id}-mostly`).click();
  await page.getByTestId('quiz-finish').click();
  await expect(page.getByTestId('taste-quiz-reveal')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('undefined');
});
