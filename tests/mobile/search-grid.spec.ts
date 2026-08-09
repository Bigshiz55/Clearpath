import { test, expect } from '@playwright/test';

/**
 * THE SHARED RESULT GRID, MEASURED ACROSS THE VIEWPORT MATRIX.
 *
 * The master assignment's hard requirements for the shared `.poster-grid`
 * primitive (§15/§16): at phone widths NO three-across grid (≤ 2 columns), never
 * any horizontal overflow, and progressively more columns on tablet/desktop. This
 * measures the REAL rendered grid (the dev/visual-qa harness renders the exact
 * shared PosterCard + .poster-grid the search results use) at every required
 * width, and captures the 390×844 artifact.
 */

const WIDTHS = [320, 375, 390, 430, 768, 1200];

/** Count grid columns by how many children share the topmost row's Y. */
async function columnsAndOverflow(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('.poster-grid');
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (!grid) return { columns: 0, overflow, hasGrid: false };
    const kids = Array.from(grid.children) as HTMLElement[];
    if (kids.length === 0) return { columns: 0, overflow, hasGrid: true };
    const tops = kids.map((k) => Math.round(k.getBoundingClientRect().top));
    const firstTop = Math.min(...tops);
    const columns = tops.filter((t) => Math.abs(t - firstTop) <= 2).length;
    return { columns, overflow, hasGrid: true };
  });
}

test('the shared result grid: ≤2 columns on phones, no overflow, wider on desktop', async ({ page }, testInfo) => {
  const rows: string[] = [];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.goto('/dev/visual-qa');
    await page.waitForSelector('.poster-grid', { timeout: 15_000 });
    const { columns, overflow, hasGrid } = await columnsAndOverflow(page);
    rows.push(`${w}px → columns=${columns} overflow=${overflow} hasGrid=${hasGrid}`);

    // Never scroll the document sideways at any width.
    expect(overflow, `${w}px horizontal overflow`).toBeLessThanOrEqual(1);

    if (w <= 430) {
      // The hard bar: a phone must NEVER show three-across. (The shared grid is
      // deliberately single-column with horizontal cards below 640px — that is
      // ≤ 2 and satisfies the requirement.)
      expect(columns, `${w}px must be ≤ 2 columns (no three-across)`).toBeLessThanOrEqual(2);
      expect(columns, `${w}px must render at least one column`).toBeGreaterThanOrEqual(1);
    }
    if (w === 390) {
      await page.screenshot({ path: `${testInfo.outputDir}/search-grid-390x844.png`, fullPage: true });
    }
    if (w >= 768) {
      // Progressive enhancement: real columns return on wider screens.
      expect(columns, `${w}px should widen to ≥ 2 columns`).toBeGreaterThanOrEqual(2);
    }
  }
  // Surface the measured matrix in the test output for the report.
  console.log('SHARED GRID MATRIX:\n' + rows.join('\n'));
});
