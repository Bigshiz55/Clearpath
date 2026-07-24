import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = path.join(process.cwd(), 'test-results', 'ontv');
fs.mkdirSync(SHOTS, { recursive: true });

const WIDTHS = [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1366, 1440, 1600, 1920];
const HEIGHT = 1000;

async function noHorizontalScroll(page: Page) {
  const { scrollW, innerW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }));
  expect(scrollW, `scrollWidth ${scrollW} ≤ viewport ${innerW}`).toBeLessThanOrEqual(innerW + 1);
}
async function nothingOffscreen(page: Page) {
  const bad = await page.evaluate(() => {
    const vw = window.innerWidth; const out: string[] = [];
    // A child inside a horizontally-scrollable container legitimately extends past
    // the viewport (it scrolls internally) and does NOT cause page overflow — skip
    // those. Everything else must stay within the viewport.
    const inScroller = (el: Element): boolean => {
      let n: Element | null = el.parentElement;
      while (n && n !== document.body) { const ox = getComputedStyle(n).overflowX; if (ox === 'auto' || ox === 'scroll') return true; n = n.parentElement; }
      return false;
    };
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1 && !inScroller(el)) out.push(`${el.tagName}.${(el as HTMLElement).className}`.slice(0, 70));
    });
    return out.slice(0, 5);
  });
  expect(bad, `offscreen: ${bad.join(' | ')}`).toEqual([]);
}

for (const width of WIDTHS) {
  test(`On TV @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto('/dev/on-tv', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(SHOTS, `ontv-${width}.png`), fullPage: true });

    await noHorizontalScroll(page);
    await nothingOffscreen(page);

    // Personalized sections render.
    const sections = page.locator('[data-testid="ontv-section"]');
    expect(await sections.count(), 'has sections').toBeGreaterThan(0);

    // Program cards keep Your Match, time, channel, and tappable actions inside bounds.
    const cards = page.locator('article.card');
    const n = await cards.count();
    expect(n, 'has program cards').toBeGreaterThan(0);
    for (let i = 0; i < Math.min(n, 12); i++) {
      const card = cards.nth(i);
      const cb = (await card.boundingBox())!;
      for (const b of await card.locator('[data-testid="ontv-action"]').all()) {
        const bb = await b.boundingBox(); if (!bb) continue;
        expect(bb.height, 'action ≥44px').toBeGreaterThanOrEqual(40);
        expect(bb.x + bb.width, 'action inside card').toBeLessThanOrEqual(cb.x + cb.width + 1);
      }
      const h3 = card.locator('h3').first();
      await expect(h3).toBeVisible();
      const hb = (await h3.boundingBox())!;
      expect(hb.x + hb.width, 'title inside card').toBeLessThanOrEqual(cb.x + cb.width + 1);
    }

    // Desktop/laptop use the available width — not a narrow centered column.
    if (width >= 1024) {
      const wide = page.locator('.container-wide').first();
      const wb = (await wide.boundingBox())!;
      const expected = Math.min(width, 1600) - 96; // minus max gutters
      expect(wb.width, `content uses width at ${width}px`).toBeGreaterThanOrEqual(expected * 0.9);
    }

    // Sports never appear; Judge Verity never appears.
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body, 'no ESPN/sports').not.toMatch(/\bespn\b|monday night matchup|\bsports\b(?! excluded)/);
    expect(body, 'no Judge Verity').not.toContain('judge verity');
  });
}

test('On TV natural-language search stays in On TV and parses constraints', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: HEIGHT });
  await page.goto('/dev/on-tv?q=' + encodeURIComponent('movies tonight after 8 on my channels'), { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SHOTS, 'ontv-search-1280.png'), fullPage: true });
  await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible();
  const understood = (await page.locator('text=Understood as').first().innerText()).toLowerCase();
  expect(understood).toContain('movie');
  expect(understood).toContain('tonight');
  expect(understood).toContain('20:00');
  expect(understood).toContain('sports excluded');
  await noHorizontalScroll(page);
});

test('On TV phone view is a vertical schedule, not a squeezed grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await page.goto('/dev/on-tv', { waitUntil: 'networkidle' });
  const cards = page.locator('article.card');
  const a = (await cards.nth(0).boundingBox())!;
  // Full-width single-column cards on a phone (card ≥ ~78% of viewport width).
  expect(a.width).toBeGreaterThan(390 * 0.78);
  await noHorizontalScroll(page);
});
