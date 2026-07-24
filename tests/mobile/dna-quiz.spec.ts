import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ONE-TILE discovery quiz (drives the /dev/dna-quiz harness — the REAL DnaQuiz
 * inside a faithful app-shell facsimile). Proves the P0 mobile rule: artwork +
 * title + four EQUAL action buttons visible together, no scroll, above the
 * bottom nav — plus the intent semantics: Looks Good never auto-saves, Add to
 * Watchlist does, Not Interested is negative, and Seen It opens the rating step.
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
const LANDSCAPE = [
  { w: 667, h: 375 },
  { w: 844, h: 390 },
  { w: 932, h: 430 },
];
/** The four primary action buttons. */
const ACT_IDS = ['act-looks-good', 'act-watchlist', 'act-not-interested', 'act-seen'] as const;

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

// ── Intent semantics ────────────────────────────────────────────────────────

test('(intent) Looks Good = interest signal, but does NOT save to the watchlist', async ({ page }) => {
  await page.getByTestId('act-looks-good').click();
  await expect(page.getByTestId('save-ok')).toHaveText(/Looks good/);
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  const wl = await page.evaluate(() => window.__quizWatchlist ?? []);
  expect(subs).toHaveLength(1);
  expect(subs[0]).toMatchObject({ recognition: 'unseen', attraction: 'interested' });
  expect(subs[0]!.watchlist ?? false, 'Looks Good never auto-saves').toBeFalsy();
  expect(wl, 'nothing added to the watchlist').toHaveLength(0);
});

test('(intent) the "Looks good" chip lets you save WITHOUT recording a second signal', async ({ page }) => {
  await page.getByTestId('act-looks-good').click(); // answers The Matrix (id 603), advances
  await expect(page.getByTestId('lg-chip')).toBeVisible();
  await page.getByTestId('lg-chip-add').click();
  await expect(page.getByText('On your list ✓')).toBeVisible(); // save resolved
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  const wl = await page.evaluate(() => window.__quizWatchlist ?? []);
  expect(subs.length, 'no extra DNA event from the chip').toBe(1);
  expect(wl).toHaveLength(1);
  expect(wl[0]!.tmdbId, 'chip saved the PREVIOUS title').toBe(603);
});

test('(intent) Add to Watchlist saves AND records a stronger signal + confirmation', async ({ page }) => {
  await page.getByTestId('act-watchlist').click();
  await expect(page.getByTestId('save-ok')).toHaveText(/Added to watchlist/);
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs[0]).toMatchObject({ recognition: 'unseen', attraction: 'must_watch', watchlist: true });
});

test('(intent) Not Interested records a negative signal and advances', async ({ page }) => {
  const title0 = await page.getByTestId('quiz-title').innerText();
  await page.getByTestId('act-not-interested').click();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs[0]).toMatchObject({ recognition: 'unseen', attraction: 'not_interested' });
  await expect(page.getByTestId('quiz-title')).not.toHaveText(title0); // advanced
});

test('(intent) Seen It opens the quick-rating step; a rating records Experience', async ({ page }) => {
  await expect(page.getByTestId('rating-step')).toHaveCount(0);
  await page.getByTestId('act-seen').click();
  await expect(page.getByTestId('rating-step')).toBeVisible();
  for (const g of ['rate-loved', 'rate-liked', 'rate-okay', 'rate-disliked']) {
    await expect(page.getByTestId(g)).toBeVisible();
  }
  await page.getByTestId('rate-loved').click();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs[0]).toMatchObject({ recognition: 'seen', rating: 'loved' });
});

test('(intent) Seen It → Back returns to the primary actions without recording', async ({ page }) => {
  await page.getByTestId('act-seen').click();
  await page.getByTestId('rate-back').click();
  await expect(page.getByTestId('quiz-grid')).toBeVisible();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs).toHaveLength(0);
});

// ── Flow ────────────────────────────────────────────────────────────────────

test('(flow) progress advances on every decision; Undo restores', async ({ page }) => {
  const stage0 = await page.getByTestId('quiz-stage').innerText();
  await page.getByTestId('act-looks-good').click();
  await expect(page.getByTestId('quiz-stage')).not.toHaveText(stage0);
  await page.getByRole('button', { name: 'Undo last answer' }).click();
  const undos = await page.evaluate(() => window.__quizUndos ?? []);
  expect(undos.length).toBe(1);
  await expect(page.getByTestId('quiz-stage')).toHaveText(stage0);
});

test('(flow) duplicate taps do NOT create duplicate evidence', async ({ page }) => {
  await page.getByTestId('act-not-interested').dblclick();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs.length, 'exactly one write despite the double tap').toBe(1);
});

test('(flow) no scroll-position drift between titles', async ({ page }) => {
  const before = await page.evaluate(() => window.scrollY);
  await page.getByTestId('act-looks-good').click();
  await page.getByTestId('act-not-interested').click();
  const after = await page.evaluate(() => window.scrollY);
  expect(after).toBe(before);
});

test('(content) long title + missing poster stay inside the tile', async ({ page }) => {
  await page.getByTestId('act-not-interested').click(); // → Breaking Bad
  await page.getByTestId('act-not-interested').click(); // → long, poster-less title
  await expect(page.getByTestId('quiz-title')).toContainText('Ridiculously Long');
  const vp = page.viewportSize()!;
  const title = await box(page, 'quiz-title');
  expect(title.y + title.height).toBeLessThanOrEqual(vp.height + 1);
  for (const id of ACT_IDS) {
    const b = await box(page, id);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 1);
  }
});

test('(a11y) the four actions and Undo have accessible names + a live region', async ({ page }) => {
  for (const label of ['Looks Good', 'Add to Watchlist', 'Not Interested', 'Seen It']) {
    await expect(page.getByRole('button', { name: new RegExp(label) })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Undo last answer' })).toBeVisible();
  expect(await page.locator('[aria-live="polite"]').count()).toBeGreaterThanOrEqual(1);
});

// ── One-tile viewport proof, every target size ──────────────────────────────

for (const { w, h } of TARGETS) {
  test(`(one-tile) ${w}×${h} — artwork + title + 4 equal buttons visible, no scroll, above bottom nav`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('dna-quiz')).toBeVisible();

    const doc = await page.evaluate(() => ({
      sh: document.documentElement.scrollHeight,
      ch: document.documentElement.clientHeight,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(doc.sh, `no vertical scroll @ ${w}×${h}`).toBeLessThanOrEqual(doc.ch + 1);
    expect(doc.sw, `no horizontal overflow @ ${w}×${h}`).toBeLessThanOrEqual(doc.cw + 1);

    for (const id of ['quiz-poster', 'quiz-title'] as const) {
      const b = await box(page, id);
      expect(b.height, `${id} has height @ ${w}×${h}`).toBeGreaterThan(0);
      expect(b.y + b.height, `${id} within viewport @ ${w}×${h}`).toBeLessThanOrEqual(h + 1);
    }

    const nav = await box(page, 'mock-bottomnav');
    const boxes = [] as { w: number; h: number; x: number; y: number }[];
    for (const id of ACT_IDS) {
      const b = await box(page, id);
      boxes.push({ w: Math.round(b.width), h: Math.round(b.height), x: b.x, y: b.y });
      expect(b.height, `${id} ≥48px @ ${w}×${h}`).toBeGreaterThanOrEqual(48);
      expect(b.x, `${id} left in-bounds`).toBeGreaterThanOrEqual(-1);
      expect(b.x + b.width, `${id} right in-bounds @ ${w}×${h}`).toBeLessThanOrEqual(w + 1);
      expect(b.y + b.height, `${id} above bottom nav @ ${w}×${h}`).toBeLessThanOrEqual(nav.y + 1);
    }
    const widths = boxes.map((b) => b.w);
    const heights = boxes.map((b) => b.h);
    expect(Math.max(...widths) - Math.min(...widths), `equal widths @ ${w}×${h}`).toBeLessThanOrEqual(1);
    expect(Math.max(...heights) - Math.min(...heights), `equal heights @ ${w}×${h}`).toBeLessThanOrEqual(1);
    const rowYs = Array.from(new Set(boxes.map((b) => Math.round(b.y))));
    expect(rowYs.length, `2 rows @ ${w}×${h}`).toBe(2);

    await page.screenshot({ path: path.join(SHOTS, `dna-quiz-${w}x${h}.png`), fullPage: false });
  });
}

// ── Landscape degrades gracefully: four equal buttons stay on screen ─────────

for (const { w, h } of LANDSCAPE) {
  test(`(landscape) ${w}×${h} — four equal buttons on screen, no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('dna-quiz')).toBeVisible();

    const doc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(doc.sw, `no horizontal overflow @ landscape ${w}×${h}`).toBeLessThanOrEqual(doc.cw + 1);

    const boxes = [] as { w: number; h: number }[];
    for (const id of ACT_IDS) {
      const b = await box(page, id);
      boxes.push({ w: Math.round(b.width), h: Math.round(b.height) });
      expect(b.height, `${id} ≥48px @ landscape ${w}×${h}`).toBeGreaterThanOrEqual(48);
      expect(b.y + b.height, `${id} visible @ landscape ${w}×${h}`).toBeLessThanOrEqual(h + 1);
    }
    const widths = boxes.map((b) => b.w);
    const heights = boxes.map((b) => b.h);
    expect(Math.max(...widths) - Math.min(...widths), `equal widths @ landscape ${w}×${h}`).toBeLessThanOrEqual(1);
    expect(Math.max(...heights) - Math.min(...heights), `equal heights @ landscape ${w}×${h}`).toBeLessThanOrEqual(1);

    await page.screenshot({ path: path.join(SHOTS, `dna-quiz-landscape-${w}x${h}.png`), fullPage: false });
  });
}
