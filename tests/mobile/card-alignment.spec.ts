import { test, expect, type Page } from '@playwright/test';

/**
 * FOR · AGAINST · SAVE FORM ONE BASELINE ACROSS A GRID ROW.
 *
 * The complaint: "voting rows move vertically because different cards contain
 * different amounts of metadata." A card with a two-line title, or a provider
 * its neighbour lacks, pushed its own action row down and the grid read as
 * ragged.
 *
 * The fix is structural (see PosterCard): the grid already stretches every card
 * in a row to the same height, and the action row is the card's last child with
 * `mt-auto`, so spare space collects ABOVE it. Content changes where the row
 * starts, never where it ends.
 *
 * These tests assert the PROPERTY, not a pixel: every action row in the same
 * grid row shares a bottom edge. The `/dev/visual-qa` fixture is deliberately
 * ragged — a one-word title next to a 97-character one, a title with meta and
 * one without, a null year — which is exactly the input that used to break it.
 */
async function open(page: Page, w: number, h = 1000) {
  await page.setViewportSize({ width: w, height: h });
  await page.route('**/api/ratings/**', (r) =>
    r.fulfill({ json: { ratings: { standardScore: 84, audience: 78, tomatometer: 91, imdb: 6.8 }, overview: 'A synopsis.' } }),
  );
  await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
  await page.waitForTimeout(600);
}

/** Every card's action-row bottom edge, grouped by the grid row it sits in. */
async function rowsByGridRow(page: Page) {
  return page.getByTestId('qa-grid').evaluate((grid) => {
    const out: { top: number; bottoms: number[]; titles: string[] }[] = [];
    for (const card of [...grid.children]) {
      const act = card.querySelector('[data-testid="card-action-row"]');
      if (!act) continue;
      const cardTop = Math.round(card.getBoundingClientRect().top);
      const bottom = Math.round(act.getBoundingClientRect().bottom);
      const title = (card.querySelector('.line-clamp-2')?.textContent ?? '').slice(0, 18);
      // Cards sharing a top edge (±2px) are in the same visual grid row.
      const row = out.find((r) => Math.abs(r.top - cardTop) <= 2);
      if (row) { row.bottoms.push(bottom); row.titles.push(title); }
      else out.push({ top: cardTop, bottoms: [bottom], titles: [title] });
    }
    return out;
  });
}

// Phone (two-across), tablet and two desktop widths — the row count differs at
// each, so this also proves the property does not depend on how many columns
// the grid happens to have.
for (const w of [320, 390, 430, 768, 1280, 1512] as const) {
  test(`FOR/AGAINST/SAVE share one baseline per grid row @ ${w}`, async ({ page }) => {
    await open(page, w);
    const rows = await rowsByGridRow(page);
    expect(rows.length, 'no cards with an action row were found').toBeGreaterThan(0);

    let compared = 0;
    for (const r of rows) {
      if (r.bottoms.length < 2) continue; // a lone card cannot be misaligned
      compared++;
      const spread = Math.max(...r.bottoms) - Math.min(...r.bottoms);
      expect(
        spread,
        `row at y=${r.top} is ragged by ${spread}px across [${r.titles.join(' | ')}]`,
      ).toBeLessThanOrEqual(1);
    }
    // At 320–1512 the fixture always yields at least one multi-card row; if it
    // ever does not, this test proved nothing and should say so.
    expect(compared, 'no multi-card row existed to compare').toBeGreaterThan(0);
  });
}

test('the action row is the LAST thing in the card, under the score', async ({ page }) => {
  await open(page, 390);
  const geom = await page.getByTestId('qa-grid').locator('> div').first().evaluate((card) => {
    const act = card.querySelector('[data-testid="card-action-row"]')!.getBoundingClientRect();
    const art = card.querySelector('.wv-card-art')!.getBoundingClientRect();
    const score = card.querySelector('.wv-score')?.getBoundingClientRect() ?? null;
    return {
      cardBottom: Math.round(card.getBoundingClientRect().bottom),
      actBottom: Math.round(act.bottom),
      actTop: Math.round(act.top),
      artBottom: Math.round(art.bottom),
      scoreBottom: score ? Math.round(score.bottom) : null,
    };
  });
  // Reading order: artwork → score → actions.
  expect(geom.actTop, 'the row is above the artwork').toBeGreaterThan(geom.artBottom);
  if (geom.scoreBottom != null) {
    expect(geom.actTop, 'the row is above the score').toBeGreaterThanOrEqual(geom.scoreBottom);
  }
  // And it genuinely sits ON the floor of the card, not merely near it.
  expect(geom.cardBottom - geom.actBottom, 'the row is not anchored to the card floor').toBeLessThanOrEqual(2);
});

test('a card with more content does not push its own row past a neighbour', async ({ page }) => {
  await open(page, 1280);
  // The fixture's second card carries a 97-character title; its neighbours do
  // not. That asymmetry is the original defect in one comparison.
  const rows = await rowsByGridRow(page);
  const multi = rows.find((r) => r.bottoms.length >= 2);
  expect(multi, 'needed a row with neighbours').toBeTruthy();
  expect(new Set(multi!.bottoms).size, `bottoms: ${multi!.bottoms.join(', ')}`).toBe(1);
});
