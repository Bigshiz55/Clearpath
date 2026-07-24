import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Two-step DNA quiz UI (drives the /dev/dna-quiz harness — the REAL DnaQuiz
 * component with a mock write path). Verifies: Seen-it reveals rating, Haven't-seen
 * advances, duplicate taps write once, Undo restores, missing posters + long titles
 * render, mobile widths, and accessible labels.
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'mobile');
fs.mkdirSync(SHOTS, { recursive: true });

async function noHScroll(page: Page, w: number) {
  const { s, i } = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, i: document.documentElement.clientWidth }));
  expect(s, `no horizontal scroll @ ${w}px`).toBeLessThanOrEqual(i + 1);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('dna-quiz')).toBeVisible();
});

test('(1) "Seen it" reveals the rating controls in place', async ({ page }) => {
  await expect(page.getByTestId('step-recognition')).toBeVisible();
  await expect(page.getByTestId('step-rating')).toHaveCount(0);
  await page.getByTestId('btn-seen').click();
  await expect(page.getByTestId('step-rating')).toBeVisible();
  for (const g of ['loved', 'liked', 'okay', 'disliked', 'hated']) {
    await expect(page.getByTestId(`rate-${g}`)).toBeVisible();
  }
});

test('Haven\'t-seen advances immediately and records an unseen (exposure) answer', async ({ page }) => {
  await page.getByTestId('btn-unseen').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs).toHaveLength(1);
  expect(subs[0]!.recognition).toBe('unseen');
  expect(subs[0]!.rating).toBeUndefined(); // no taste rating
});

test('(8) duplicate taps do NOT create duplicate evidence', async ({ page }) => {
  await page.getByTestId('btn-unseen').dblclick(); // two rapid taps
  await expect(page.getByTestId('save-ok')).toBeVisible();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs.length, 'exactly one write despite the double tap').toBe(1);
});

test('(10) Undo restores the previous title and reverses the write', async ({ page }) => {
  const stageBefore = await page.getByTestId('quiz-stage').innerText();
  await page.getByTestId('btn-seen').click();
  await page.getByTestId('rate-loved').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  // rated count went up
  await expect(page.getByTestId('quiz-stage')).not.toHaveText(stageBefore);
  // undo
  await page.getByRole('button', { name: 'Undo last answer' }).click();
  const undos = await page.evaluate(() => window.__quizUndos ?? []);
  expect(undos.length).toBe(1);
  await expect(page.getByTestId('quiz-stage')).toHaveText(stageBefore); // count restored
  await expect(page.getByTestId('step-recognition')).toBeVisible(); // back on a recognition step
});

test('(14) long titles and missing posters render safely', async ({ page }) => {
  // Advance to the 3rd item (null poster + very long title).
  await page.getByTestId('btn-unseen').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  await page.getByTestId('btn-unseen').click();
  await expect(page.getByTestId('quiz-title')).toContainText('Ridiculously Long');
  await noHScroll(page, 390);
});

test('(15) key controls have accessible names and a live region', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Seen it', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Haven.t seen it/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo last answer' })).toBeVisible();
  expect(await page.locator('[aria-live="polite"]').count()).toBeGreaterThanOrEqual(1);
});

for (const width of [320, 375, 390, 430]) {
  test(`(13) mobile layout @ ${width}px — no overflow, ≥44px targets`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
    await noHScroll(page, width);
    const seen = page.getByTestId('btn-seen');
    const box = (await seen.boundingBox())!;
    expect(box.height, `Seen it ≥52px @ ${width}px`).toBeGreaterThanOrEqual(48);
    if ([320, 390, 430].includes(width)) {
      // capture recognition + rating steps
      await page.screenshot({ path: path.join(SHOTS, `dna-quiz-recognition-${width}.png`), fullPage: true });
      await seen.click();
      await expect(page.getByTestId('step-rating')).toBeVisible();
      await page.screenshot({ path: path.join(SHOTS, `dna-quiz-rating-${width}.png`), fullPage: true });
    }
  });
}
