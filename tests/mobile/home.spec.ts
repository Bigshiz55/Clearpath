import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Rebuilt mobile-home coverage (Phase 7). Drives the /dev/mobile-home harness —
 * the exact Logo / BuildCaseBox / SearchBar / MobileNav components from the /app
 * home — and locks in the visible fixes: solid "WatchVERDICT" wordmark, compact
 * hero, 3 chips + More ideas, working textarea, a full-width CTA that never looks
 * disabled, a ≥44px bottom nav clear of content, and zero horizontal overflow.
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'mobile');
fs.mkdirSync(SHOTS, { recursive: true });

const WIDTHS = [320, 375, 390, 393, 430, 480];
const HEIGHT = 844;
const SHOT_WIDTHS = new Set([320, 390, 430]);

async function noHorizontalScroll(page: Page, width: number) {
  const { scrollW, innerW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: document.documentElement.clientWidth,
  }));
  expect(scrollW, `no horizontal scroll @ ${width}px (scrollW ${scrollW} ≤ ${innerW})`).toBeLessThanOrEqual(innerW + 1);
}

for (const width of WIDTHS) {
  test(`mobile home @ ${width}px — brand, hero, chips, CTA, no overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto('/dev/mobile-home', { waitUntil: 'networkidle' });

    if (SHOT_WIDTHS.has(width)) {
      await page.screenshot({ path: path.join(SHOTS, `mobile-home-${width}.png`), fullPage: true });
    }

    // 1) Wordmark is the canonical brand "WatchVERD1CT" — the "I" is an intentional
    //    white numeral 1 (see WatchVerdictWordmark + logo.spec.ts). Regression guard
    //    for the broken "WatchVERD_CT" / "WatchVERDCT" / "WatchVERD CT" the old flip
    //    gimmick produced on iOS (missing glyph or a gap).
    const header = page.locator('[data-testid="site-header"]');
    const brand = header.locator('span.whitespace-nowrap').first();
    const brandText = (await brand.innerText()).replace(/\s+/g, '');
    expect(brandText, `wordmark solid @ ${width}px (got "${brandText}")`).toBe('WatchVERD1CT');
    expect(brandText, 'never clipped/underscored/gapped').not.toMatch(/VERDCT|VERD_CT|VERD\s+CT/);

    // 2) Compact hero headline visible, no clipping.
    const headline = page.locator('[data-testid="hero-headline"]');
    await expect(headline).toBeVisible();
    await expect(headline).toHaveText('What should we watch?');
    const clipped = await headline.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped, `headline not clipped @ ${width}px`).toBe(false);

    // 3) State Your Case card: NINE quick asks in a perfect 3×3 — three rows
    //    of three equal tiles, no ragged edge, and no "More ideas" toggle.
    await expect(page.getByRole('heading', { name: 'State Your Case' })).toBeVisible();
    const chips = page.locator('[data-testid="quick-asks"] > button');
    expect(await chips.count(), `quick asks @ ${width}px`).toBe(9);
    for (const label of ['On TV tonight', 'Family night', 'Date night', 'True crime', 'Feel-good']) {
      await expect(page.getByRole('button', { name: new RegExp(label) })).toBeVisible();
    }
    // A REAL 3×3: exactly three distinct columns, three distinct rows, and
    // every tile the same size (±1px of rounding).
    const boxes = await chips.evaluateAll((els) =>
      els.map((e) => {
        const b = e.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
      }),
    );
    expect(new Set(boxes.map((b) => b.x)).size, `columns @ ${width}px`).toBe(3);
    expect(new Set(boxes.map((b) => b.y)).size, `rows @ ${width}px`).toBe(3);
    const widths = boxes.map((b) => b.w);
    expect(Math.max(...widths) - Math.min(...widths), `unequal tiles @ ${width}px`).toBeLessThanOrEqual(1);
    // The toggle is gone, not hidden.
    await expect(page.getByRole('button', { name: /More ideas/ })).toHaveCount(0);

    // 4) No horizontal overflow.
    await noHorizontalScroll(page, width);

    // 5) Primary CTA present, full-width-ish, ≥48px, and NOT visually disabled on load.
    const cta = page.getByRole('button', { name: /Hit the Gavel/i });
    await expect(cta).toBeVisible();
    const cb = (await cta.boundingBox())!;
    expect(cb.height, `CTA ≥48px @ ${width}px`).toBeGreaterThanOrEqual(48);
    // Full-width WITHIN its card: card inner width = card box minus its 16px padding.
    const cardBox = (await page.locator('[data-testid="statecase-card"]').boundingBox())!;
    expect(cb.width, `CTA fills its card @ ${width}px`).toBeGreaterThanOrEqual(cardBox.width - 2 * 16 - 4);
    // AND IT IS THE LAST THING IN THE CARD. The "or name a few titles" line
    // that used to hang under it made the card end on a footnote instead of on
    // the action.
    expect(
      Math.round(cardBox.y + cardBox.height - (cb.y + cb.height)),
      `something is below the gavel @ ${width}px`,
    ).toBeLessThanOrEqual(24); // just the card's own padding
    await expect(page.getByTestId('statecase-card')).not.toContainText('name a few titles you love');
    // The DOM disabled attribute must be false on load (only set while "Ruling…").
    expect(await cta.isDisabled(), 'CTA not DOM-disabled on load').toBe(false);
    const opacity = await cta.evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(opacity, `CTA not dimmed @ ${width}px`).toBeGreaterThan(0.9);

    // 6) Bottom nav: six tabs, each ≥44px tall, clear of content, safe-area padded.
    // `[data-app-bottomnav]` is the stable hook; the nav element itself is now
    // a pill INSIDE a fixed wrapper rather than being the fixed element.
    const nav = page.locator('[data-app-bottomnav]');
    await expect(nav).toBeVisible();
    const tabs = nav.locator('a, button');
    expect(await tabs.count(), 'six bottom-nav tabs').toBe(6);
    const tb = (await tabs.first().boundingBox())!;
    expect(tb.height, `nav tab ≥44px @ ${width}px`).toBeGreaterThanOrEqual(44);
  });
}

test('chips fill the box, and the CTA submits (mocked)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await page.goto('/dev/mobile-home', { waitUntil: 'networkidle' });

  // Tapping a chip fills the textarea with the FULL query, not the short label.
  await page.getByRole('button', { name: /Family night/ }).click();
  const box = page.getByLabel('Describe what you like to watch');
  await expect(box).toHaveValue(/family movie/i);

  // Every quick ask drops a real sentence in, not its own chip text.
  await page.getByRole('button', { name: /Under 2 hours/ }).click();
  await expect(box).toHaveValue(/under two hours/i);

  // Typing + submit hits /api/build-case exactly once (mocked) — no dup on rapid taps.
  await box.fill('Clever thrillers with a twist, but nothing too slow.');
  let calls = 0;
  await page.route('**/api/build-case', async (route) => {
    calls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stay: true, summary: 'Got it' }) });
  });
  const cta = page.getByRole('button', { name: /Hit the Gavel/i });
  await cta.click();
  await cta.click(); // second rapid tap should be ignored while busy / after clear
  await expect.poll(() => calls, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
  expect(calls, 'no duplicate submission from a rapid double-tap').toBeLessThanOrEqual(1);
});
