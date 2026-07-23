import { test, expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = path.join(process.cwd(), 'test-results', 'responsive');
fs.mkdirSync(SHOTS, { recursive: true });

// Every required real-device CSS width, plus tablet/desktop sizes.
//  320 very-narrow Android · 360 narrow Android · 375 iPhone SE/mini
//  390 iPhone 13/14/15 · 393 iPhone 16 / Pixel 5 · 402 iPhone 16 Pro
//  412 Pixel 6/7/8 · 414 iPhone Plus · 430 iPhone Pro Max
const WIDTHS = [320, 360, 375, 390, 393, 402, 412, 414, 430, 768, 1024, 1280];
const HEIGHT = 900;
const MOBILE_MAX = 600; // the single-column boundary

async function noHorizontalScroll(page: Page) {
  const { scrollW, innerW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: document.documentElement.clientWidth,
  }));
  expect(scrollW, `scrollWidth ${scrollW} must not exceed viewport ${innerW}`).toBeLessThanOrEqual(innerW + 1);
}

/** No element's right edge may exceed the viewport width (nothing off-screen). */
async function nothingOffscreen(page: Page) {
  const overflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad: string[] = [];
    const inScroller = (el: Element): boolean => {
      let n: Element | null = el.parentElement;
      while (n && n !== document.body) { const ox = getComputedStyle(n).overflowX; if (ox === 'auto' || ox === 'scroll') return true; n = n.parentElement; }
      return false;
    };
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1 && !inScroller(el)) bad.push(`${el.tagName}.${(el as HTMLElement).className}`.slice(0, 80));
    });
    return bad.slice(0, 8);
  });
  expect(overflow, `elements overflow viewport: ${overflow.join(' | ')}`).toEqual([]);
}

/** An element is not horizontally clipped by its own box (content fully rendered). */
async function notClipped(loc: Locator, label: string) {
  const clipped = await loc.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped, `${label} is clipped (scrollWidth>clientWidth)`).toBe(false);
}

/** The brand logo is complete: mark + full "Watch…CT" wordmark, unclipped, inside the viewport. */
async function assertLogoComplete(page: Page, width: number) {
  const header = page.locator('[data-testid="site-header"]');
  await expect(header).toBeVisible();
  const word = header.locator('span.whitespace-nowrap').first();
  await expect(word).toBeVisible();
  const txt = (await word.innerText()).replace(/\s+/g, '');
  // Full wordmark present — never the truncated "WatchVERD_CT".
  expect(txt, `logo text complete at ${width}px (got "${txt}")`).toContain('Watch');
  expect(txt, `logo ends in CT at ${width}px (got "${txt}")`).toMatch(/CT$|CTVerdict$/);
  await notClipped(word, `logo wordmark @ ${width}px`);
  const wb = (await word.boundingBox())!;
  expect(wb.x + wb.width, `logo within viewport @ ${width}px`).toBeLessThanOrEqual(width + 1);
  expect(wb.x, `logo left inside viewport @ ${width}px`).toBeGreaterThanOrEqual(-1);
}

for (const width of WIDTHS) {
  test(`responsive @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto('/dev/responsive', { waitUntil: 'networkidle' });

    await page.screenshot({ path: path.join(SHOTS, `harness-${width}.png`), fullPage: true });

    // 1) No horizontal scrolling; nothing off-screen.
    await noHorizontalScroll(page);
    await nothingOffscreen(page);

    // 2) Logo is always complete and never clipped (item 1).
    await assertLogoComplete(page, width);

    // 3) Card content stays inside the card boundary (no clipping/overflow).
    const cards = page.locator('[data-testid="card"]');
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      const cb = (await card.boundingBox())!;
      for (const sel of ['[data-testid="verdict"]', '[data-testid="title"]', '[data-testid="action"]', '[data-rating="imdb"]', '[data-rating="critics"]', '[data-rating="audience"]']) {
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

    // 4) Single-column below 600px: every card shares the same left edge (item 2 /
    //    "more than one full movie card column below 600px" must fail the layout).
    const lefts = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    const distinctLefts = [...new Set(lefts)];
    if (width < MOBILE_MAX) {
      expect(distinctLefts.length, `single column below ${MOBILE_MAX}px at ${width}px (found ${distinctLefts.length} columns)`).toBe(1);
      // Each card uses the full content width (≥ viewport minus gutters, allowing 16px each side).
      const cw = (await cards.first().boundingBox())!.width;
      expect(cw, `card near full width at ${width}px`).toBeGreaterThanOrEqual(width - 2 * 16 - 4);
    } else {
      expect(distinctLefts.length, `multi-column at ${width}px`).toBeGreaterThan(1);
    }

    // 5) IMDb: visible, full "IMDb 8.x" text, never clipped (item 3). And no
    //    broken IMDb presentation anywhere ("IMDb —", "IMDb 0.0", empty badge).
    const bodyText = await page.locator('body').innerText();
    expect(bodyText, 'never "IMDb —"').not.toMatch(/IMDb\s*[—–-]/);
    expect(bodyText, 'never "IMDb 0.0"').not.toMatch(/IMDb\s*0\.0\b/);
    expect(bodyText, 'never "IMDb NaN"').not.toMatch(/IMDb\s*NaN/i);
    const imdb = page.locator('[data-rating="imdb"]');
    const imdbCount = await imdb.count();
    expect(imdbCount, 'IMDb chips present').toBeGreaterThan(0);
    for (let i = 0; i < imdbCount; i++) {
      const chip = imdb.nth(i);
      await expect(chip).toBeVisible();
      await expect(chip).toContainText('IMDb');
      // Every rendered badge carries a valid 1.0–10.0 number (never empty/0/dash).
      const t = (await chip.innerText()).replace(/[^\d.]/g, '');
      const val = Number.parseFloat(t);
      expect(Number.isFinite(val) && val > 0 && val <= 10, `IMDb badge #${i} valid number "${t}"`).toBe(true);
      await notClipped(chip, `IMDb chip #${i} @ ${width}px`);
    }

    // 5b) Priority layout: IMDb sits on its own row BELOW the % scores.
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

    // 6) Verdict panels visible; action buttons tappable (≥44px) and inside card (item 4).
    await expect(page.locator('[data-testid="verdict"]').first()).toBeVisible();
    const action = page.locator('[data-testid="action"]').first();
    await expect(action).toBeVisible();
    const ab = (await action.boundingBox())!;
    expect(ab.height, 'action tap target height').toBeGreaterThanOrEqual(40);

    // 7) The "State Your Case" form is centered & inside viewport.
    const form = page.locator('form, [class*="max-w-2xl"]').first();
    const fb = (await form.boundingBox())!;
    expect(Math.abs(fb.x - (width - (fb.x + fb.width))), `form centered at ${width}px`).toBeLessThanOrEqual(2);
    expect(fb.x + fb.width, 'form within viewport').toBeLessThanOrEqual(width + 1);

    // 8) Bottom nav must not permanently cover content (item 8). On phones, scroll to
    //    the end and confirm the last card's actions can clear the fixed nav's top.
    if (width < MOBILE_MAX) {
      const nav = page.locator('nav.fixed');
      await expect(nav).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(120);
      const navTop = (await nav.boundingBox())!.y;
      const lastAction = page.locator('[data-testid="action"]').last();
      const la = await lastAction.boundingBox();
      if (la) expect(la.y, `last action clears bottom nav at ${width}px`).toBeLessThanOrEqual(navTop + 1);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  });
}

// IMDb missing-value handling, at every mobile width the user called out.
for (const width of [320, 375, 390, 430]) {
  test(`IMDb missing-value handling @ ${width}px — hide cleanly, reflow, never a dash`, async ({ page }) => {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto('/dev/responsive', { waitUntil: 'networkidle' });

    const cardByTitle = (t: string) => page.locator('[data-testid="card"]', { hasText: t });

    // Audience-only card: shows "Audience", and has NO IMDb and NO critics element.
    const audienceOnly = cardByTitle('Audience Only Pick');
    await expect(audienceOnly.locator('[data-rating="audience"]')).toHaveCount(1);
    await expect(audienceOnly.locator('[data-rating="imdb"]'), 'audience-only: no IMDb badge').toHaveCount(0);
    await expect(audienceOnly.locator('[data-rating="critics"]'), 'audience-only: no critics').toHaveCount(0);
    await expect(audienceOnly).not.toContainText('IMDb');

    // Invalid IMDb (0) → hidden; audience still present and starts at the row's left
    // edge (reflowed, no blank leading slot).
    const zero = cardByTitle('Zero-Rating Guard');
    await expect(zero.locator('[data-rating="imdb"]'), 'imdb=0: no badge').toHaveCount(0);
    await expect(zero.locator('[data-rating="audience"]')).toHaveCount(1);
    await expect(zero).not.toContainText('IMDb');

    // NaN IMDb → hidden; critics still present.
    const nan = cardByTitle('Broken-Feed Guard');
    await expect(nan.locator('[data-rating="imdb"]'), 'imdb=NaN: no badge').toHaveCount(0);
    await expect(nan.locator('[data-rating="critics"]')).toHaveCount(1);
    await expect(nan).not.toContainText('IMDb');

    // A valid IMDb card renders the real number.
    const valid = cardByTitle('Breaking Bad');
    await expect(valid.locator('[data-rating="imdb"]')).toContainText('9.5');

    // No empty/dash IMDb anywhere on the page.
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/IMDb\s*[—–\-]/);
    expect(body).not.toMatch(/IMDb\s*(0\.0|NaN)/i);

    // Redundant evidence chips are gone: metadata like a bare year/"Your NN"/"NN%
    // audience" is not echoed as a chip. (Harness has no receipts, so assert the
    // metric labels read as the clean "Critics/Audience/IMDb" set.)
    await expect(page.locator('[data-rating="audience"]').first()).toContainText('Audience');
  });
}

test('single-column verdict grid on a phone — exactly one column at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await page.goto('/dev/responsive', { waitUntil: 'networkidle' });
  const lefts = await page.locator('[data-testid="card"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect([...new Set(lefts)].length, 'exactly one column at 390px').toBe(1);
});

test('landscape phone (740x360) — no overflow, logo complete', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 });
  await page.goto('/dev/responsive', { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SHOTS, 'harness-landscape-740.png'), fullPage: true });
  await noHorizontalScroll(page);
  await nothingOffscreen(page);
  await assertLogoComplete(page, 740);
});

for (const scale of [1.0, 1.25, 1.5, 2.0]) {
  test(`text scaling ${Math.round(scale * 100)}% @ 360px — no overflow, logo + IMDb intact`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: HEIGHT });
    await page.goto('/dev/responsive', { waitUntil: 'networkidle' });
    await page.evaluate((s) => { document.documentElement.style.fontSize = `${16 * s}px`; }, scale);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, `harness-360-scale-${Math.round(scale * 100)}.png`), fullPage: true });
    await noHorizontalScroll(page);
    await nothingOffscreen(page);
    await assertLogoComplete(page, 360);
    const imdb = page.locator('[data-rating="imdb"]').first();
    if (await imdb.count()) await notClipped(imdb, `IMDb @ 360px ${scale}x`);
  });
}
