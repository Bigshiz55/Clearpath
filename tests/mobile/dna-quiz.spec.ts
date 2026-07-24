import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ONE-TILE DNA quiz UI (drives the /dev/dna-quiz harness — the REAL DnaQuiz
 * inside a faithful copy of the app shell). Proves the P0 mobile requirement:
 * on every target phone size the artwork, title, and FOUR EQUAL buttons are all
 * visible at once, nothing hides behind the bottom nav, and the page does not
 * scroll. Plus the functional flow: 4-choice mapping, advance, undo, progress,
 * duplicate-tap safety, long title / missing poster.
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'mobile');
fs.mkdirSync(SHOTS, { recursive: true });

const TARGETS = [
  { w: 320, h: 568 },
  { w: 375, h: 667 },
  { w: 390, h: 844 },
  { w: 393, h: 852 },
  { w: 430, h: 932 },
  { w: 390, h: 668 }, // reduced Safari-chrome height
];
const RATE_IDS = ['rate-loved', 'rate-liked', 'rate-disliked', 'rate-unseen'] as const;

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

// ── Functional flow ────────────────────────────────────────────────────────

test('(flow) all four choices map into the DNA model correctly', async ({ page }) => {
  await page.getByTestId('rate-loved').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  await page.getByTestId('rate-liked').click();
  await page.getByTestId('rate-disliked').click();
  await page.getByTestId('rate-unseen').click();

  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs).toHaveLength(4);
  expect(subs[0]).toMatchObject({ recognition: 'seen', rating: 'loved' });
  expect(subs[1]).toMatchObject({ recognition: 'seen', rating: 'liked' });
  expect(subs[2]).toMatchObject({ recognition: 'seen', rating: 'disliked' });
  expect(subs[3]!.recognition).toBe('unseen');
  expect(subs[3]!.rating).toBeUndefined(); // "Haven't seen it" carries no taste rating
});

test('(flow) rated titles advance the progress; "Haven\'t seen" does not', async ({ page }) => {
  const stage0 = await page.getByTestId('quiz-stage').innerText();
  await page.getByTestId('rate-loved').click();
  await expect(page.getByTestId('quiz-stage')).not.toHaveText(stage0); // count went up
  const stage1 = await page.getByTestId('quiz-stage').innerText();
  await page.getByTestId('rate-unseen').click();
  await expect(page.getByTestId('quiz-stage')).toHaveText(stage1); // unseen didn't bump the count
});

test('(flow) duplicate taps do NOT create duplicate evidence', async ({ page }) => {
  await page.getByTestId('rate-loved').dblclick();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs.length, 'exactly one write despite the double tap').toBe(1);
});

test('(flow) Undo restores the previous title and reverses the write', async ({ page }) => {
  const stage0 = await page.getByTestId('quiz-stage').innerText();
  const title0 = await page.getByTestId('quiz-title').innerText();
  await page.getByTestId('rate-loved').click();
  await expect(page.getByTestId('quiz-stage')).not.toHaveText(stage0);
  await expect(page.getByTestId('quiz-title')).not.toHaveText(title0); // advanced

  await page.getByRole('button', { name: 'Undo last answer' }).click();
  const undos = await page.evaluate(() => window.__quizUndos ?? []);
  expect(undos.length).toBe(1);
  await expect(page.getByTestId('quiz-stage')).toHaveText(stage0); // count restored
  await expect(page.getByTestId('quiz-title')).toHaveText(title0); // back to prior title
});

test('(flow) no scroll-position drift between titles', async ({ page }) => {
  const before = await page.evaluate(() => window.scrollY);
  await page.getByTestId('rate-loved').click();
  await page.getByTestId('rate-liked').click();
  const after = await page.evaluate(() => window.scrollY);
  expect(after, 'viewport does not drift as titles advance').toBe(before);
});

test('(content) long title + missing poster stay inside the tile', async ({ page }) => {
  await page.getByTestId('rate-unseen').click(); // → Breaking Bad
  await page.getByTestId('rate-unseen').click(); // → the very long, poster-less title
  await expect(page.getByTestId('quiz-title')).toContainText('Ridiculously Long');
  const vp = page.viewportSize()!;
  const title = await box(page, 'quiz-title');
  expect(title.y + title.height, 'long title still above the fold').toBeLessThanOrEqual(vp.height + 1);
  for (const id of RATE_IDS) {
    const b = await box(page, id);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 1);
  }
});

test('(a11y) four buttons are labelled and Undo has an accessible name', async ({ page }) => {
  for (const label of ['Loved it', 'Liked it', 'Didn’t like it', 'Haven’t seen it']) {
    await expect(page.getByRole('button', { name: new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Undo last answer' })).toBeVisible();
  expect(await page.locator('[aria-live="polite"]').count()).toBeGreaterThanOrEqual(1);
});

// ── One-tile viewport proof, at every target size ───────────────────────────

for (const { w, h } of TARGETS) {
  test(`(one-tile) ${w}×${h} — artwork + title + 4 equal buttons visible, no scroll, above bottom nav`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('dna-quiz')).toBeVisible();

    // No page scroll (active quiz must fit) and no horizontal overflow.
    const doc = await page.evaluate(() => ({
      sh: document.documentElement.scrollHeight,
      ch: document.documentElement.clientHeight,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(doc.sh, `no vertical scroll @ ${w}×${h}`).toBeLessThanOrEqual(doc.ch + 1);
    expect(doc.sw, `no horizontal overflow @ ${w}×${h}`).toBeLessThanOrEqual(doc.cw + 1);

    // Artwork + title within the viewport.
    for (const id of ['quiz-poster', 'quiz-title'] as const) {
      const b = await box(page, id);
      expect(b.height, `${id} has height @ ${w}×${h}`).toBeGreaterThan(0);
      expect(b.y + b.height, `${id} bottom within viewport @ ${w}×${h}`).toBeLessThanOrEqual(h + 1);
    }

    // Four buttons: equal dimensions, ≥48px, inside viewport, above the bottom nav.
    const nav = await box(page, 'mock-bottomnav');
    const boxes = [] as { w: number; h: number; x: number; y: number }[];
    for (const id of RATE_IDS) {
      const b = await box(page, id);
      boxes.push({ w: Math.round(b.width), h: Math.round(b.height), x: b.x, y: b.y });
      expect(b.height, `${id} ≥48px @ ${w}×${h}`).toBeGreaterThanOrEqual(48);
      expect(b.x, `${id} left in-bounds`).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width, `${id} right in-bounds @ ${w}×${h}`).toBeLessThanOrEqual(w + 1);
      expect(b.y + b.height, `${id} above bottom nav @ ${w}×${h}`).toBeLessThanOrEqual(nav.y + 1);
    }
    // All equal width & height.
    const widths = boxes.map((b) => b.w);
    const heights = boxes.map((b) => b.h);
    expect(Math.max(...widths) - Math.min(...widths), `equal widths @ ${w}×${h}`).toBeLessThanOrEqual(1);
    expect(Math.max(...heights) - Math.min(...heights), `equal heights @ ${w}×${h}`).toBeLessThanOrEqual(1);

    // It really is a 2×2 grid (two rows).
    const rowYs = Array.from(new Set(boxes.map((b) => Math.round(b.y))));
    expect(rowYs.length, `2 rows @ ${w}×${h}`).toBe(2);

    await page.screenshot({ path: path.join(SHOTS, `dna-quiz-${w}x${h}.png`), fullPage: false });
  });
}

// ── Landscape must degrade gracefully: four equal buttons stay on screen ─────
const LANDSCAPE = [
  { w: 667, h: 375 },
  { w: 844, h: 390 },
  { w: 932, h: 430 },
];
for (const { w, h } of LANDSCAPE) {
  test(`(landscape) ${w}×${h} — four equal buttons on screen, no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('dna-quiz')).toBeVisible();

    const doc = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(doc.sw, `no horizontal overflow @ landscape ${w}×${h}`).toBeLessThanOrEqual(doc.cw + 1);

    const boxes = [] as { w: number; h: number }[];
    for (const id of RATE_IDS) {
      const b = await box(page, id);
      boxes.push({ w: Math.round(b.width), h: Math.round(b.height) });
      expect(b.height, `${id} ≥48px @ landscape ${w}×${h}`).toBeGreaterThanOrEqual(48);
      expect(b.y + b.height, `${id} visible (not below fold) @ landscape ${w}×${h}`).toBeLessThanOrEqual(h + 1);
    }
    const widths = boxes.map((b) => b.w);
    const heights = boxes.map((b) => b.h);
    expect(Math.max(...widths) - Math.min(...widths), `equal widths @ landscape ${w}×${h}`).toBeLessThanOrEqual(1);
    expect(Math.max(...heights) - Math.min(...heights), `equal heights @ landscape ${w}×${h}`).toBeLessThanOrEqual(1);

    await page.screenshot({ path: path.join(SHOTS, `dna-quiz-landscape-${w}x${h}.png`), fullPage: false });
  });
}
