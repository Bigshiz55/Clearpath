import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = path.join(process.cwd(), 'test-results', 'responsive');
fs.mkdirSync(SHOTS, { recursive: true });

// Every required device width, plus a couple of tablet/desktop sizes.
//  320 — very narrow Android            375 — iPhone SE / mini
//  360 — narrow Android (Galaxy S)      390 — iPhone 13/14/15
//  393 — iPhone 16 / Pixel 5            402 — iPhone 16 Pro
//  412 — Pixel 6/7/8                    414 — iPhone Plus
//  430 — iPhone Pro Max
const WIDTHS = [320, 360, 375, 390, 393, 402, 412, 414, 430, 768, 1024, 1280];
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

    // 4) IMDb is visible wherever IMDb data exists (5 of the 8 cards carry it),
    //    never clipped, and its full "IMDb 8.x" text is present (no truncation).
    const imdb = page.locator('[data-rating="imdb"]');
    const imdbCount = await imdb.count();
    expect(imdbCount, 'IMDb chips present').toBeGreaterThan(0);
    for (let i = 0; i < imdbCount; i++) {
      const chip = imdb.nth(i);
      await expect(chip).toBeVisible();
      // The label + numeric value are both fully rendered, never clipped away.
      await expect(chip).toContainText('IMDb');
      await expect(chip).toContainText(/\d\.\d/);
      // The chip is not horizontally clipped by an ancestor (scrollWidth ≈ clientWidth).
      const clipped = await chip.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(clipped, `IMDb chip #${i} not clipped at ${width}px`).toBe(false);
    }

    // 4b) Priority layout: within a card that shows both the critics % and IMDb,
    //     IMDb sits on its OWN row BELOW the % scores (never squeezed beside them).
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      const critics = card.locator('[data-rating="critics"]');
      const cardImdb = card.locator('[data-rating="imdb"]');
      if ((await critics.count()) && (await cardImdb.count())) {
        const cr = (await critics.first().boundingBox())!;
        const ib = (await cardImdb.first().boundingBox())!;
        expect(ib.y, `IMDb below critics row at ${width}px`).toBeGreaterThanOrEqual(cr.y + cr.height - 2);
      }
    }

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
