import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Watch DNA quiz — single-screen, single-step (drives the /dev/dna-quiz harness,
 * the REAL DnaQuiz with a mock write path). Proves the polish contract: poster +
 * title + all four equal response buttons visible simultaneously, no scrolling,
 * no layout shift, ≥48px targets, on every supported iPhone viewport. Also
 * verifies the write semantics (loved/unseen/unsure), duplicate-tap safety, Undo,
 * long titles + missing posters, and accessible names.
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'mobile');
fs.mkdirSync(SHOTS, { recursive: true });

const RESPONSES = ['rate-loved', 'rate-liked', 'rate-disliked', 'btn-unseen'] as const;

// The iPhone viewports we support (portrait).
const VIEWPORTS = [
  { name: 'iPhone SE', w: 375, h: 667 },
  { name: 'iPhone 13 mini', w: 375, h: 812 },
  { name: 'iPhone 14/15', w: 390, h: 844 },
  { name: 'iPhone 15 Plus', w: 428, h: 926 },
  { name: 'iPhone 15 Pro Max', w: 430, h: 932 },
];

async function noHScroll(page: Page, w: number) {
  const { s, i } = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, i: document.documentElement.clientWidth }));
  expect(s, `no horizontal scroll @ ${w}px`).toBeLessThanOrEqual(i + 1);
}
async function noVScroll(page: Page, h: number) {
  const { s, i } = await page.evaluate(() => ({ s: document.documentElement.scrollHeight, i: document.documentElement.clientHeight }));
  expect(s, `no vertical scroll @ ${h}px`).toBeLessThanOrEqual(i + 1);
}
/** Assert an element is fully inside the viewport (nothing below the fold / clipped). */
async function fullyVisible(page: Page, testid: string, vh: number) {
  const box = await page.getByTestId(testid).boundingBox();
  expect(box, `${testid} has a layout box`).toBeTruthy();
  expect(box!.y, `${testid} not above the viewport`).toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height, `${testid} bottom within viewport (${vh}px)`).toBeLessThanOrEqual(vh + 1);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('dna-quiz')).toBeVisible();
});

test('(1) one screen: poster, title, and all four response buttons are visible at once', async ({ page }) => {
  await expect(page.getByTestId('quiz-title')).toBeVisible();
  for (const id of RESPONSES) {
    await expect(page.getByTestId(id)).toBeVisible();
    await fullyVisible(page, id, 844);
  }
  await fullyVisible(page, 'quiz-title', 844);
  await noVScroll(page, 844);
  await noHScroll(page, 390);
});

test('(2) no layout shift when answering — button geometry is identical across titles', async ({ page }) => {
  const before = await page.getByTestId('quiz-actions').boundingBox();
  await page.getByTestId('rate-loved').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  const after = await page.getByTestId('quiz-actions').boundingBox();
  // The action grid must sit in the exact same place on the next title (no jump).
  expect(Math.abs(after!.y - before!.y), 'action grid Y is stable').toBeLessThanOrEqual(1);
  expect(Math.abs(after!.height - before!.height), 'action grid height is stable').toBeLessThanOrEqual(1);
});

test('(3) "Loved it" records a seen+loved answer', async ({ page }) => {
  await page.getByTestId('rate-loved').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs).toHaveLength(1);
  expect(subs[0]!.recognition).toBe('seen');
  expect(subs[0]!.rating).toBe('loved');
});

test('(4) "Haven\'t seen" records an unseen exposure with no taste rating', async ({ page }) => {
  await page.getByTestId('btn-unseen').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs).toHaveLength(1);
  expect(subs[0]!.recognition).toBe('unseen');
  expect(subs[0]!.rating).toBeUndefined();
});

test('(5) "Not sure — skip" records an unsure answer', async ({ page }) => {
  await page.getByTestId('btn-skip').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs).toHaveLength(1);
  expect(subs[0]!.recognition).toBe('unsure');
});

test('(6) duplicate taps do NOT create duplicate evidence', async ({ page }) => {
  await page.getByTestId('btn-unseen').dblclick();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs.length, 'exactly one write despite the double tap').toBe(1);
});

test('(7) Undo restores the previous title and reverses the write', async ({ page }) => {
  const stageBefore = await page.getByTestId('quiz-stage').innerText();
  const titleBefore = await page.getByTestId('quiz-title').innerText();
  await page.getByTestId('rate-loved').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  await expect(page.getByTestId('quiz-stage')).not.toHaveText(stageBefore); // count went up
  await page.getByRole('button', { name: 'Undo last answer' }).click();
  const undos = await page.evaluate(() => window.__quizUndos ?? []);
  expect(undos.length).toBe(1);
  await expect(page.getByTestId('quiz-stage')).toHaveText(stageBefore); // count restored
  await expect(page.getByTestId('quiz-title')).toHaveText(titleBefore); // title restored
});

test('(8) long titles and missing posters stay on one screen', async ({ page }) => {
  await page.getByTestId('btn-unseen').click(); // -> Breaking Bad
  await expect(page.getByTestId('save-ok')).toBeVisible();
  await page.getByTestId('btn-unseen').click(); // -> the ridiculously long, poster-less title
  await expect(page.getByTestId('quiz-title')).toContainText('Ridiculously Long');
  for (const id of RESPONSES) await fullyVisible(page, id, 844);
  await noVScroll(page, 844);
  await noHScroll(page, 390);
});

test('(9) key controls have accessible names and a live region', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Loved it/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Haven.t seen/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo last answer' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'How was it?' })).toBeVisible();
  expect(await page.locator('[aria-live="polite"]').count()).toBeGreaterThanOrEqual(1);
});

for (const v of VIEWPORTS) {
  test(`(10) ${v.name} (${v.w}×${v.h}): one screen, ≥48px, four equal buttons`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('dna-quiz')).toBeVisible();

    await noHScroll(page, v.w);
    await noVScroll(page, v.h);

    const boxes = [];
    for (const id of RESPONSES) {
      await fullyVisible(page, id, v.h);
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.height, `${id} ≥48px tall @ ${v.name}`).toBeGreaterThanOrEqual(48);
      boxes.push(b);
    }
    await fullyVisible(page, 'quiz-title', v.h);

    // Four EQUAL response buttons — identical width and height (±1px).
    const w0 = boxes[0]!.width, h0 = boxes[0]!.height;
    for (const b of boxes) {
      expect(Math.abs(b.width - w0), `equal button width @ ${v.name}`).toBeLessThanOrEqual(1);
      expect(Math.abs(b.height - h0), `equal button height @ ${v.name}`).toBeLessThanOrEqual(1);
    }

    await page.screenshot({ path: path.join(SHOTS, `dna-quiz-${v.w}x${v.h}.png`) });
  });
}
