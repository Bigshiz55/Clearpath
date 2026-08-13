import { test, expect, type Page } from '@playwright/test';

/**
 * THE BROWSE CARD'S INFORMATION BUDGET.
 *
 * A card answers four questions and no more:
 *
 *   WHAT IS IT?            media, title, compact metadata
 *   WILL I LIKE IT?        the WatchVerd1ct score/verdict, one concise reason
 *   WHERE CAN I WATCH IT?  the provider row
 *   WHAT CAN I DO?         FOR / AGAINST / SAVE, and More info
 *
 * Everything deeper — the full synopsis, every reason, the cautions, the
 * detailed ratings, expanded availability, cast, the deeper DNA explanation —
 * lives one level down, on the title page, behind "More info".
 *
 * These assertions are about the SHAPE of the card rather than its contents:
 * variable-length content must be clamped, and a row of cards must line up.
 * A row whose cards each start their score at a different height is the thing
 * that made the grid read as overloaded even when each card was individually
 * reasonable.
 */
async function open(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/dev/visual-qa', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
}

/** Cards grouped into visual rows by their top edge. */
async function rows(page: Page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid="qa-grid"] > .card')];
    const byTop = new Map<number, { top: number; height: number; titleBottom: number }[]>();
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      const t = c.querySelector('.wv-card-body > a, .wv-card-body > button, .wv-card-body') as HTMLElement;
      const tr = t.getBoundingClientRect();
      const key = Math.round(r.top);
      if (!byTop.has(key)) byTop.set(key, []);
      byTop.get(key)!.push({
        top: Math.round(r.top),
        height: Math.round(r.height),
        titleBottom: Math.round(tr.bottom),
      });
    }
    return [...byTop.values()];
  });
}

test('cards in one row are the same height', async ({ page }) => {
  await open(page, 1440, 900);
  for (const row of await rows(page)) {
    if (row.length < 2) continue;
    const heights = [...new Set(row.map((c) => c.height))];
    expect(heights, `a row holds cards of ${heights.join(' / ')}px`).toHaveLength(1);
  }
});

test('a one-line title and a three-line title start their body at the same height', async ({ page }) => {
  await open(page, 1440, 900);
  // The fixture deliberately holds "A" beside "The Extraordinarily Long and
  // Unabbreviated Title of a Motion Picture" — the case that used to push
  // every block below it out of alignment with its neighbours.
  for (const row of await rows(page)) {
    if (row.length < 2) continue;
    const bottoms = [...new Set(row.map((c) => c.titleBottom))];
    expect(bottoms, `titles in a row end at ${bottoms.join(' / ')}px`).toHaveLength(1);
  }
});

test('variable-length content is clamped, not left to run', async ({ page }) => {
  await open(page, 1440, 900);
  const clamps = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="qa-grid"] > .card')].map((c) => {
      const title = c.querySelector('.wv-card-body div') as HTMLElement | null;
      if (!title) return null;
      const s = getComputedStyle(title);
      return { clamp: s.webkitLineClamp, overflow: s.overflow };
    }),
  );
  for (const c of clamps) {
    if (!c) continue;
    expect(Number(c.clamp), 'a title is unclamped and can run to any length').toBeLessThanOrEqual(2);
  }
});

test('More info is present, a real target, and points at the title page', async ({ page }) => {
  await open(page, 390, 844);
  const more = page.getByTestId('card-more-info').first();
  await expect(more).toBeVisible();
  const box = (await more.boundingBox())!;
  expect(box.height, `More info is ${box.height}px tall`).toBeGreaterThanOrEqual(44);
  // It goes to the surface that already holds the deep detail — not to a
  // second detail implementation built beside the card.
  await expect(more).toHaveAttribute('href', /\/app\/title\/(movie|tv)\/\d+/);
});

test('the grid never scrolls sideways at any width', async ({ page }) => {
  for (const [w, h] of [[1440, 900], [1280, 800], [834, 1112], [390, 844]] as const) {
    await open(page, w, h);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over, `horizontal overflow at ${w}`).toBeLessThanOrEqual(1);
  }
});
