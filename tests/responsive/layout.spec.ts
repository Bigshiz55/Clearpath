import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = path.join(process.cwd(), 'test-results', 'responsive');
fs.mkdirSync(SHOTS, { recursive: true });

// Every required width, plus a couple of tablet/desktop sizes.
const WIDTHS = [320, 360, 375, 390, 393, 414, 430, 768, 1024, 1280];
const HEIGHT = 900;

async function noHorizontalScroll(page: Page) {
  const { scrollW, innerW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
  }));
  expect(scrollW, `scrollWidth ${scrollW} must not exceed viewport ${innerW}`).toBeLessThanOrEqual(innerW + 1);
}

/** No element's right edge may exceed the viewport width (nothing off-screen). */
async function nothingOffscreen(page: Page) {
  const overflow = await page.evaluate(() => {
    const vw = window.innerWidth;
    const bad: string[] = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1) bad.push(`${el.tagName}.${(el as HTMLElement).className}`.slice(0, 80));
    });
    return bad.slice(0, 5);
  });
  expect(overflow, `elements overflow viewport: ${overflow.join(' | ')}`).toEqual([]);
}

for (const width of WIDTHS) {
  test(`responsive @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto('/dev/responsive', { waitUntil: 'networkidle' });

    await page.screenshot({ path: path.join(SHOTS, `harness-${width}.png`), fullPage: true });

    // 1) No horizontal scrolling at any width.
    await noHorizontalScroll(page);
    // 2) Nothing renders outside the viewport.
    await nothingOffscreen(page);

    // 3) Card content stays inside the card boundary (no clipping/overflow).
    const cards = page.locator('[data-testid="card"]');
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      const cb = (await card.boundingBox())!;
      for (const sel of ['[data-testid="verdict"]', '[data-testid="title"]', '[data-testid="action"]', '[data-rating="imdb"]']) {
        const items = card.locator(sel);
        const c = await items.count();
        for (let j = 0; j < c; j++) {
          const b = await items.nth(j).boundingBox();
          if (!b) continue;
          expect(b.x, `${sel} left inside card`).toBeGreaterThanOrEqual(cb.x - 1);
          expect(b.x + b.width, `${sel} right inside card at ${width}px`).toBeLessThanOrEqual(cb.x + cb.width + 1);
        }
      }
    }

    // 4) IMDb is visible wherever IMDb data exists (5 of the 8 cards carry it).
    const imdb = page.locator('[data-rating="imdb"]');
    const imdbCount = await imdb.count();
    expect(imdbCount, 'IMDb chips present').toBeGreaterThan(0);
    for (let i = 0; i < imdbCount; i++) await expect(imdb.nth(i)).toBeVisible();

    // 5) Verdict panels visible.
    await expect(page.locator('[data-testid="verdict"]').first()).toBeVisible();

    // 6) Action buttons are tappable (≈44px tall, visible).
    const action = page.locator('[data-testid="action"]').first();
    await expect(action).toBeVisible();
    const ab = (await action.boundingBox())!;
    expect(ab.height, 'action tap target height').toBeGreaterThanOrEqual(40);

    // 7) The "State Your Case" form is centered (equal L/R margin) & inside viewport.
    const form = page.locator('form, [class*="max-w-2xl"]').first();
    const fb = (await form.boundingBox())!;
    const leftGap = fb.x;
    const rightGap = width - (fb.x + fb.width);
    expect(Math.abs(leftGap - rightGap), `form centered at ${width}px`).toBeLessThanOrEqual(2);
    expect(fb.x + fb.width, 'form within viewport').toBeLessThanOrEqual(width + 1);

    // 8) The gavel button is inside the panel and, on narrow phones, ~full width.
    const gavel = page.getByRole('button', { name: /gavel/i }).first();
    if (await gavel.count()) {
      const gb = (await gavel.boundingBox())!;
      expect(gb.x + gb.width, 'gavel within viewport').toBeLessThanOrEqual(width + 1);
      if (width < 640) {
        const panelInner = fb.width - 40; // panel padding allowance
        expect(gb.width, 'gavel ~full-width on mobile').toBeGreaterThan(panelInner * 0.7);
      }
    }
  });
}

test('no horizontal scroll under large accessibility font @ 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: HEIGHT });
  await page.goto('/dev/responsive', { waitUntil: 'networkidle' });
  // Simulate a large-text / 200%-ish setting by scaling the root rem.
  await page.evaluate(() => { document.documentElement.style.fontSize = '22px'; });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, 'harness-320-largefont.png'), fullPage: true });
  await noHorizontalScroll(page);
  await nothingOffscreen(page);
});
