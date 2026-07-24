import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Cinematic ONE-TILE discovery quiz (drives /dev/dna-quiz — the REAL DnaQuiz in
 * a faithful app-shell facsimile). Proves: one-tile at every phone→ultrawide
 * size (no scroll, no overflow, four EQUAL buttons, poster + title visible),
 * the interruption-free flow, the intent mapping (Looks Good doesn't save; Save
 * does; Skip is negative; Seen It → rating), and the live Watch-DNA meter.
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'mobile');
fs.mkdirSync(SHOTS, { recursive: true });

const TARGETS = [
  { w: 320, h: 568 }, { w: 375, h: 667 }, { w: 390, h: 844 }, { w: 430, h: 932 },
  { w: 768, h: 1024 }, { w: 834, h: 1112 },
  { w: 1024, h: 768 }, { w: 1280, h: 800 }, { w: 1440, h: 900 }, { w: 1920, h: 1080 },
];
const LANDSCAPE = [{ w: 667, h: 375 }, { w: 844, h: 390 }, { w: 932, h: 430 }];
const ACT_IDS = ['act-looks-good', 'act-save', 'act-skip', 'act-seen'] as const;

async function box(page: Page, testid: string) {
  const b = await page.getByTestId(testid).first().boundingBox();
  if (!b) throw new Error(`no box for ${testid}`);
  return b;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('dna-quiz')).toBeVisible();
});

// ── Intent semantics + interruption-free flow ───────────────────────────────

test('(intent) Looks Good = interest, does NOT save, advances at once', async ({ page }) => {
  const title0 = await page.getByTestId('quiz-title').innerText();
  await page.getByTestId('act-looks-good').click();
  await expect(page.getByTestId('quiz-title')).not.toHaveText(title0);
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs[0]).toMatchObject({ recognition: 'unseen', attraction: 'interested' });
  expect(subs[0]!.watchlist ?? false).toBeFalsy();
});

test('(intent) Save records must_watch AND saves to the watchlist', async ({ page }) => {
  await page.getByTestId('act-save').click();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs[0]).toMatchObject({ recognition: 'unseen', attraction: 'must_watch', watchlist: true });
});

test('(intent) Skip records a negative signal and advances', async ({ page }) => {
  const title0 = await page.getByTestId('quiz-title').innerText();
  await page.getByTestId('act-skip').click();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs[0]).toMatchObject({ recognition: 'unseen', attraction: 'not_interested' });
  await expect(page.getByTestId('quiz-title')).not.toHaveText(title0);
});

test('(intent) Seen It opens the rating step; a rating records Experience + advances', async ({ page }) => {
  await expect(page.getByTestId('rating-step')).toHaveCount(0);
  await page.getByTestId('act-seen').click();
  await expect(page.getByTestId('rating-step')).toBeVisible();
  for (const g of ['rate-loved', 'rate-liked', 'rate-okay', 'rate-disliked']) await expect(page.getByTestId(g)).toBeVisible();
  const title0 = await page.getByTestId('quiz-title').innerText();
  await page.getByTestId('rate-loved').click();
  await expect(page.getByTestId('quiz-grid')).toBeVisible();
  await expect(page.getByTestId('quiz-title')).not.toHaveText(title0);
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs[0]).toMatchObject({ recognition: 'seen', rating: 'loved' });
});

test('(no-interrupt) no modal/chip/reason prompt appears between cards', async ({ page }) => {
  await page.getByTestId('act-looks-good').click();
  await page.getByTestId('act-skip').click();
  await page.getByTestId('act-seen').click();
  await page.getByTestId('rate-loved').click();
  await expect(page.getByTestId('quiz-grid')).toBeVisible();
  await expect(page.getByTestId('quiz-intro')).toHaveCount(0);
  await expect(page.getByTestId('rating-step')).toHaveCount(0);
  await expect(page.getByText(/why|what made|held it back/i)).toHaveCount(0);
});

test('(dna) the confidence meter rises as titles are rated', async ({ page }) => {
  const before = await page.getByTestId('dna-confidence').innerText();
  await page.getByTestId('act-looks-good').click();
  await page.getByTestId('act-save').click();
  await expect(page.getByTestId('dna-confidence')).not.toHaveText(before);
});

test('(cinematic) a blurred backdrop is rendered behind the card', async ({ page }) => {
  expect(await page.locator('.wv-cine-bg').count()).toBeGreaterThanOrEqual(1);
  expect(await page.locator('.wv-cine-scrim').count()).toBe(1);
});

test('(flow) duplicate taps do NOT create duplicate evidence', async ({ page }) => {
  await page.getByTestId('act-skip').dblclick();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs.length).toBe(1);
});

test('(flow) Undo restores the previous title', async ({ page }) => {
  const title0 = await page.getByTestId('quiz-title').innerText();
  await page.getByTestId('act-looks-good').click();
  await expect(page.getByTestId('quiz-title')).not.toHaveText(title0);
  await page.getByRole('button', { name: 'Undo last answer' }).click();
  const undos = await page.evaluate(() => window.__quizUndos ?? []);
  expect(undos.length).toBe(1);
  await expect(page.getByTestId('quiz-title')).toHaveText(title0);
});

test('(a11y) the four actions + Undo have accessible names', async ({ page }) => {
  for (const label of ['Looks Good', 'Save', 'Skip', 'Seen It']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${label}$`) })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Undo last answer' })).toBeVisible();
});

// ── One-tile viewport proof, phone → ultrawide ──────────────────────────────

for (const { w, h } of TARGETS) {
  test(`(one-tile) ${w}×${h} — poster + title + 4 equal buttons, no scroll, no overflow`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('dna-quiz')).toBeVisible();

    const doc = await page.evaluate(() => ({
      sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight,
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    }));
    expect(doc.sh, `no vertical scroll @ ${w}×${h}`).toBeLessThanOrEqual(doc.ch + 1);
    expect(doc.sw, `no horizontal overflow @ ${w}×${h}`).toBeLessThanOrEqual(doc.cw + 1);

    for (const id of ['quiz-poster', 'quiz-title'] as const) {
      const b = await box(page, id);
      expect(b.height, `${id} has height @ ${w}×${h}`).toBeGreaterThan(0);
      expect(b.y + b.height, `${id} within viewport @ ${w}×${h}`).toBeLessThanOrEqual(h + 1);
    }

    const mobile = w < 640;
    const navTop = mobile ? (await box(page, 'mock-bottomnav')).y : h;
    const boxes = [] as { w: number; h: number; x: number; y: number }[];
    for (const id of ACT_IDS) {
      const b = await box(page, id);
      boxes.push({ w: Math.round(b.width), h: Math.round(b.height), x: b.x, y: b.y });
      expect(b.height, `${id} ≥48px @ ${w}×${h}`).toBeGreaterThanOrEqual(48);
      expect(b.x, `${id} left in-bounds`).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width, `${id} right in-bounds @ ${w}×${h}`).toBeLessThanOrEqual(w + 1);
      expect(b.y + b.height, `${id} above nav / in viewport @ ${w}×${h}`).toBeLessThanOrEqual(navTop + 1);
    }
    const widths = boxes.map((b) => b.w); const heights = boxes.map((b) => b.h);
    expect(Math.max(...widths) - Math.min(...widths), `equal widths @ ${w}×${h}`).toBeLessThanOrEqual(1);
    expect(Math.max(...heights) - Math.min(...heights), `equal heights @ ${w}×${h}`).toBeLessThanOrEqual(1);
    expect(new Set(boxes.map((b) => Math.round(b.y))).size, `2 rows @ ${w}×${h}`).toBe(2);

    await page.screenshot({ path: path.join(SHOTS, `dna-quiz-${w}x${h}.png`), fullPage: false });
  });
}

// ── Landscape degrades gracefully ───────────────────────────────────────────

for (const { w, h } of LANDSCAPE) {
  test(`(landscape) ${w}×${h} — four equal buttons on screen, no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('dna-quiz')).toBeVisible();
    const doc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(doc.sw).toBeLessThanOrEqual(doc.cw + 1);
    const boxes = [] as { w: number; h: number }[];
    for (const id of ACT_IDS) {
      const b = await box(page, id);
      boxes.push({ w: Math.round(b.width), h: Math.round(b.height) });
      expect(b.height).toBeGreaterThanOrEqual(48);
      expect(b.y + b.height, `${id} visible @ landscape ${w}×${h}`).toBeLessThanOrEqual(h + 1);
    }
    expect(Math.max(...boxes.map((b) => b.w)) - Math.min(...boxes.map((b) => b.w))).toBeLessThanOrEqual(1);
    expect(Math.max(...boxes.map((b) => b.h)) - Math.min(...boxes.map((b) => b.h))).toBeLessThanOrEqual(1);
    await page.screenshot({ path: path.join(SHOTS, `dna-quiz-landscape-${w}x${h}.png`), fullPage: false });
  });
}
