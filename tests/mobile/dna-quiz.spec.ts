import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Watch DNA card flow (drives the /dev/dna-quiz harness — the REAL DnaQuiz with a
 * mock write path). Proves the polish contract:
 *   • Four primary buttons — Looks good / Watchlist / Not interested / Seen it —
 *     with poster + title, all visible at once, no scrolling.
 *   • "Seen it" reveals a same-sized rating grid IN PLACE (zero layout shift).
 *   • Equal button geometry, ≥48px, on every supported viewport (phones → iPad →
 *     desktop). Plus event mappings, duplicate-tap safety, Undo (incl. watchlist).
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'mobile');
fs.mkdirSync(SHOTS, { recursive: true });

const PRIMARY = ['btn-looks-good', 'btn-watchlist', 'btn-not-interested', 'btn-seen'] as const;
const RATINGS = ['rate-loved', 'rate-liked', 'rate-okay', 'rate-disliked'] as const;

// Every viewport the flow must fit on without scrolling (req 11).
const VIEWPORTS = [
  { name: 'small-320x568', w: 320, h: 568 },
  { name: 'iPhone-SE-375x667', w: 375, h: 667 },
  { name: 'iPhone-14-390x844', w: 390, h: 844 },
  { name: 'iPhone-15Pro-393x852', w: 393, h: 852 },
  { name: 'iPhone-ProMax-430x932', w: 430, h: 932 },
  { name: 'iPad-portrait-768x1024', w: 768, h: 1024 },
  { name: 'iPad-landscape-1024x768', w: 1024, h: 768 },
  { name: 'desktop-1280x800', w: 1280, h: 800 },
];

async function noScroll(page: Page, w: number, h: number) {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight,
  }));
  expect(m.sw, `no horizontal scroll @ ${w}×${h}`).toBeLessThanOrEqual(m.cw + 1);
  expect(m.sh, `no vertical scroll @ ${w}×${h}`).toBeLessThanOrEqual(m.ch + 1);
}
async function fullyVisible(page: Page, testid: string, vh: number) {
  const box = await page.getByTestId(testid).boundingBox();
  expect(box, `${testid} has a layout box`).toBeTruthy();
  expect(box!.y, `${testid} not above viewport`).toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height, `${testid} bottom within viewport (${vh}px)`).toBeLessThanOrEqual(vh + 1);
}
/** Assert a set of buttons render at identical width and height (±1px). */
async function equalButtons(page: Page, ids: readonly string[], label: string) {
  const boxes = [];
  for (const id of ids) boxes.push((await page.getByTestId(id).boundingBox())!);
  const w0 = boxes[0]!.width, h0 = boxes[0]!.height;
  for (const b of boxes) {
    expect(Math.abs(b.width - w0), `equal width ${label}`).toBeLessThanOrEqual(1);
    expect(Math.abs(b.height - h0), `equal height ${label}`).toBeLessThanOrEqual(1);
    expect(b.height, `≥48px ${label}`).toBeGreaterThanOrEqual(48);
  }
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('dna-quiz')).toBeVisible();
});

test('(7) the four primary buttons + poster + title are visible at once, no scroll', async ({ page }) => {
  await expect(page.getByTestId('quiz-title')).toBeVisible();
  for (const id of PRIMARY) {
    await expect(page.getByTestId(id)).toBeVisible();
    await fullyVisible(page, id, 844);
  }
  await fullyVisible(page, 'quiz-title', 844);
  await noScroll(page, 390, 844);
});

test('(8) "Seen it" opens the rating sub-state IN PLACE — no layout shift', async ({ page }) => {
  const before = (await page.getByTestId('quiz-actions').boundingBox())!;
  await page.getByTestId('btn-seen').click();
  for (const id of RATINGS) await expect(page.getByTestId(id)).toBeVisible();
  const after = (await page.getByTestId('quiz-actions').boundingBox())!;
  expect(Math.abs(after.y - before.y), 'action zone Y stable').toBeLessThanOrEqual(1);
  expect(Math.abs(after.height - before.height), 'action zone height stable').toBeLessThanOrEqual(1);
  await noScroll(page, 390, 844);
});

test('(9) no automatic follow-up interrupts the flow — rating advances to the next card', async ({ page }) => {
  await page.getByTestId('btn-seen').click();
  await page.getByTestId('rate-loved').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  // Next card shows the primary options again — no reason prompt / interstitial.
  await expect(page.getByTestId('btn-looks-good')).toBeVisible();
  await expect(page.getByTestId('rate-loved')).toHaveCount(0);
});

test('event mappings: Looks good / Watchlist / Not interested / Seen→Loved', async ({ page }) => {
  await page.getByTestId('btn-looks-good').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  await page.getByTestId('btn-watchlist').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  await page.getByTestId('btn-not-interested').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  await page.getByTestId('btn-seen').click();
  await page.getByTestId('rate-loved').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();

  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs.map((s) => s.intent)).toEqual(['looks_good', 'watchlist', 'not_interested', 'seen']);
  expect(subs[1]!.intent).toBe('watchlist'); // req 13: Watchlist is its own intent (saves server-side)
  expect(subs[0]!.rating).toBeUndefined(); // req 12: Looks good carries no rating (no watchlist save)
  expect(subs[3]!).toMatchObject({ intent: 'seen', rating: 'loved' });
});

test('(16) duplicate taps do NOT create duplicate events', async ({ page }) => {
  await page.getByTestId('btn-looks-good').dblclick();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  const subs = await page.evaluate(() => window.__quizSubmits ?? []);
  expect(subs.length, 'exactly one write despite the double tap').toBe(1);
});

test('(15) Undo restores the previous card and count; a Watchlist save is reversed too', async ({ page }) => {
  const stageBefore = await page.getByTestId('quiz-stage').innerText();
  const titleBefore = await page.getByTestId('quiz-title').innerText();
  await page.getByTestId('btn-watchlist').click();
  await expect(page.getByTestId('save-ok')).toBeVisible();
  await expect(page.getByTestId('quiz-stage')).not.toHaveText(stageBefore);
  await page.getByRole('button', { name: 'Undo last answer' }).click();
  await expect(page.getByTestId('quiz-stage')).toHaveText(stageBefore); // count restored
  await expect(page.getByTestId('quiz-title')).toHaveText(titleBefore); // card restored
  const undos = await page.evaluate(() => window.__quizUndos ?? []);
  const wlUndos = await page.evaluate(() => window.__quizWatchlistUndos ?? []);
  expect(undos.length).toBe(1);
  expect(wlUndos.length, 'watchlist save was reversed on undo').toBe(1);
});

test('long titles and missing posters stay on one screen', async ({ page }) => {
  await page.getByTestId('btn-looks-good').click(); // -> Breaking Bad
  await expect(page.getByTestId('save-ok')).toBeVisible();
  await page.getByTestId('btn-looks-good').click(); // -> the very long, poster-less title
  await expect(page.getByTestId('quiz-title')).toContainText('Ridiculously Long');
  for (const id of PRIMARY) await fullyVisible(page, id, 844);
  await noScroll(page, 390, 844);
});

test('(10/12) accessible names, groups, and a live region', async ({ page }) => {
  await expect(page.getByRole('button', { name: /Looks good/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Watchlist/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Not interested/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo last answer' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Have you seen this?' })).toBeVisible();
  expect(await page.locator('[aria-live="polite"]').count()).toBeGreaterThanOrEqual(1);
});

for (const v of VIEWPORTS) {
  test(`(11) ${v.name}: one screen, ≥48px, four equal buttons (primary + rating)`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('dna-quiz')).toBeVisible();

    await noScroll(page, v.w, v.h);
    for (const id of PRIMARY) await fullyVisible(page, id, v.h);
    await fullyVisible(page, 'quiz-title', v.h);
    await equalButtons(page, PRIMARY, `primary @ ${v.name}`);
    await page.screenshot({ path: path.join(SHOTS, `dna-quiz-${v.name}.png`) });

    // Rating sub-state must also fit and be equal.
    await page.getByTestId('btn-seen').click();
    for (const id of RATINGS) await fullyVisible(page, id, v.h);
    await equalButtons(page, RATINGS, `rating @ ${v.name}`);
    await noScroll(page, v.w, v.h);
  });
}
