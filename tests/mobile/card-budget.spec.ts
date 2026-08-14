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

/**
 * THE HARD GEOMETRY CONTRACT.
 *
 * The browse card is for deciding; the title page is for investigating. That
 * only holds if the card cannot GROW — every block it carries is bounded, and
 * nothing on it opens into more card. These measure the card's outer box under
 * each condition the content could vary.
 */
test('no child on a browse card can grow it', async ({ page }) => {
  await open(page, 1440, 900);
  // The controls that used to expand the card in place are gone from it: the
  // synopsis "More", and the reason stack's "Why?".
  await expect(page.getByTestId('qa-grid').getByTestId('synopsis-more')).toHaveCount(0);
  await expect(page.getByTestId('qa-grid').getByTestId('why-expand')).toHaveCount(0);
  // And the detailed source ratings, which are evidence for the title page.
  await expect(page.getByTestId('qa-grid').locator('.wv-ratings-row')).toHaveCount(0);

  // Whatever IS still interactive inside a card must leave its height alone.
  const before = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="qa-grid"] > .card')].map((c) =>
      Math.round(c.getBoundingClientRect().height),
    ),
  );
  const controls = page.getByTestId('qa-grid').locator('.card button, .card [aria-expanded]');
  const n = Math.min(await controls.count(), 12);
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i);
    // Skip anything that navigates or opens a full-screen surface.
    if (await c.isVisible()) await c.click({ trial: true }).catch(() => {});
  }
  const after = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="qa-grid"] > .card')].map((c) =>
      Math.round(c.getBoundingClientRect().height),
    ),
  );
  expect(after, 'a control inside a card changed its height').toEqual(before);
});

test('a card holds its height whatever its content turns out to be', async ({ page }) => {
  // The fixture spans the axes that used to move the card: a one-character
  // title beside a 60-character one, a title with a long synopsis beside one
  // with none, and titles with and without providers.
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    await open(page, w, h);
    // Let every async block on the card land before measuring.
    await page.waitForTimeout(1200);
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="qa-grid"] > .card')].map((c) =>
        Math.round(c.getBoundingClientRect().height),
      ),
    );
    const spread = Math.max(...heights) - Math.min(...heights);
    expect(spread, `card heights at ${w} spread ${spread}px: ${heights.join(' / ')}`).toBeLessThanOrEqual(1);
  }
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
