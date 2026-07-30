import { test, expect, type Page } from '@playwright/test';

/**
 * THE DOCKET AND THE VERD1CT.
 *
 * The claim under test is that this produces a DECISION, not another ranked
 * list: one winner, one backup, a stated reason the runner-up lost, and every
 * excluded candidate carrying the reason it was excluded. A shortlist that
 * quietly drops something you deliberately added is how a verdict loses trust.
 */

/** Facts per title, so the ranking has something real to separate. */
const FACTS: Record<number, { match: number; conf: number; general: number; runtime: string; where: string[] }> = {
  101: { match: 88, conf: 0.9, general: 82, runtime: '1h 45m', where: ['Netflix'] },
  102: { match: 60, conf: 0.9, general: 78, runtime: '2h 10m', where: ['Hulu'] },
  103: { match: 55, conf: 0.5, general: 70, runtime: '3h 30m', where: ['Max'] },
  104: { match: 72, conf: 0.8, general: 74, runtime: '1h 50m', where: [] },
  105: { match: 40, conf: 0.6, general: 55, runtime: '1h 30m', where: ['Prime'] },
  106: { match: 50, conf: 0.4, general: 60, runtime: '2h 0m', where: ['Netflix'] },
  107: { match: 45, conf: 0.4, general: 58, runtime: '1h 40m', where: ['Hulu'] },
  108: { match: 42, conf: 0.4, general: 57, runtime: '1h 35m', where: ['Max'] },
  109: { match: 41, conf: 0.4, general: 56, runtime: '1h 25m', where: ['Prime'] },
};

async function open(page: Page, w = 1280, h = 900) {
  await page.route('**/api/dna/**', async (route) => {
    const id = Number(new URL(route.request().url()).pathname.split('/').pop());
    const f = FACTS[id];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ dna: f ? { score: f.match, confidence: f.conf, sampleSize: 20 } : null }),
    });
  });
  await page.route('**/api/quicklook/**', async (route) => {
    const id = Number(new URL(route.request().url()).pathname.split('/').pop());
    const f = FACTS[id];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(f ? { runtime: f.runtime, where: f.where, standardScore: f.general } : {}),
    });
  });
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/dev/verdict', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('harness-grid')).toBeVisible();
}

async function put(page: Page, ...ids: number[]) {
  for (const id of ids) await page.getByTestId(`w-check-${id}`).click();
}

test('the W is on every poster and toggles', async ({ page }) => {
  await open(page);
  const w = page.getByTestId('w-check-101');
  await expect(w).toHaveAttribute('aria-pressed', 'false');
  await w.click();
  await expect(w).toHaveAttribute('aria-pressed', 'true');
  await w.click();
  await expect(w).toHaveAttribute('aria-pressed', 'false');
});

test('the tray is invisible until there is a docket', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('docket-tray')).toHaveCount(0);
  await put(page, 101);
  await expect(page.getByTestId('docket-tray')).toBeVisible();
});

test('it will not call a verdict on fewer than three', async ({ page }) => {
  await open(page);
  await put(page, 101, 102);
  await expect(page.getByTestId('docket-status')).toContainText('1 more');
  await expect(page.getByTestId('docket-deliver')).toHaveCount(0);
  await put(page, 103);
  await expect(page.getByTestId('docket-deliver')).toBeVisible();
});

test('the docket caps, and says why instead of doing nothing', async ({ page }) => {
  await open(page);
  await put(page, 101, 102, 103, 104, 105, 106, 107, 108);
  await page.getByTestId('w-check-109').click();
  await expect(page.getByTestId('w-check-refused')).toContainText('8 is the limit');
  await expect(page.getByTestId('w-check-109')).toHaveAttribute('aria-pressed', 'false');
});

test('ONE winner, ONE backup, and why the runner-up lost', async ({ page }) => {
  await open(page);
  await put(page, 101, 102, 105);
  await expect(page.getByTestId('verdict-winner')).toBeVisible();
  // 101 has both the best taste match and a service you have.
  await expect(page.getByTestId('verdict-winner')).toContainText('Alpha');
  await expect(page.getByTestId('verdict-backup')).toBeVisible();
  const margin = await page.getByTestId('verdict-margin').innerText();
  expect(margin.length).toBeGreaterThan(10);
  // It is a decision, not a leaderboard: the rest are collapsed.
  await expect(page.getByTestId('verdict-also-ran')).toHaveCount(0);
  await expect(page.getByTestId('verdict-also-ran-toggle')).toBeVisible();
});

test('a title you cannot stream costs itself something but is not hidden', async ({ page }) => {
  await open(page);
  await put(page, 104, 105, 109);
  await expect(page.getByTestId('verdict-winner')).toBeVisible();
  // 104 is on nothing, and still wins on the strength of the match — the app
  // does not decide your budget for you.
  await expect(page.getByTestId('verdict-winner')).toContainText('Delta');
  await expect(page.getByTestId('verdict-ruled-out')).toHaveCount(0);
});

test('the also-rans open on request', async ({ page }) => {
  await open(page);
  await put(page, 101, 102, 105, 106);
  await page.getByTestId('verdict-also-ran-toggle').click();
  await expect(page.getByTestId('verdict-also-ran')).toBeVisible();
});

test('the docket survives a reload — it is tonight’s question', async ({ page }) => {
  await open(page);
  await put(page, 101, 102, 103);
  await page.reload({ waitUntil: 'networkidle' });
  // The count lives on the badge; the words carry the state. Asserting them
  // separately is what lets the copy change without the test lying.
  await expect(page.getByTestId('docket-count')).toHaveText('3');
  await expect(page.getByTestId('docket-status')).toContainText('Ready');
  await expect(page.getByTestId('w-check-101')).toHaveAttribute('aria-pressed', 'true');
});

test('clearing the docket puts everything back', async ({ page }) => {
  await open(page);
  await put(page, 101, 102, 103);
  // Clear lives inside the expanded panel on the compact floating widget.
  await page.getByTestId('docket-toggle').click();
  await page.getByTestId('docket-clear').click();
  await expect(page.getByTestId('docket-tray')).toHaveCount(0);
  await expect(page.getByTestId('w-check-101')).toHaveAttribute('aria-pressed', 'false');
});

test('taking one off the tray takes it off the poster too', async ({ page }) => {
  await open(page);
  await put(page, 101, 102, 103);
  await page.getByTestId('docket-toggle').click();
  await page.getByTestId('docket-remove-102').click();
  await expect(page.getByTestId('w-check-102')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('docket-count')).toHaveText('2');
  await expect(page.getByTestId('docket-status')).toContainText('1 more');
});

test('no overflow at any width, and the tray is reachable everywhere', async ({ page }) => {
  // One navigation, then resize — re-opening would toggle the same W checks
  // back OFF, because the docket deliberately survives a reload.
  await open(page, 1440, 900);
  await put(page, 101, 102, 103);
  await expect(page.getByTestId('docket-tray')).toBeVisible();

  for (const v of [
    { w: 320, h: 568 },
    { w: 375, h: 667 },
    { w: 390, h: 844 },
    { w: 768, h: 1024 },
    { w: 1440, h: 900 },
  ]) {
    await page.setViewportSize({ width: v.w, height: v.h });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${v.w}px`).toBeLessThanOrEqual(1);
    const box = await page.getByTestId('docket-tray').boundingBox();
    expect(box, `${v.w}px tray`).not.toBeNull();
    expect(box!.width, `${v.w}px tray width`).toBeLessThanOrEqual(v.w);
  }
});
