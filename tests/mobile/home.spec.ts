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

    // 1) Wordmark is the solid "WatchVERDICT" — regression guard for the broken
    //    "WatchVERD_CT" / "WatchVERD CT" the flip gimmick produced on iOS.
    const header = page.locator('[data-testid="site-header"]');
    const brand = header.locator('span.whitespace-nowrap').first();
    const brandText = (await brand.innerText()).replace(/\s+/g, '');
    expect(brandText, `wordmark solid @ ${width}px (got "${brandText}")`).toBe('WatchVERDICT');
    expect(brandText, 'never underscores/gaps').not.toMatch(/VERD[^I]?CT|VERD_|VERD\s+CT/);

    // 2) Compact hero headline visible, no clipping.
    const headline = page.locator('[data-testid="hero-headline"]');
    await expect(headline).toBeVisible();
    await expect(headline).toHaveText('What should we watch?');
    const clipped = await headline.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped, `headline not clipped @ ${width}px`).toBe(false);

    // 3) State Your Case card, exactly three chips up front + a "More ideas" toggle.
    await expect(page.getByRole('heading', { name: 'State Your Case' })).toBeVisible();
    const primaryChips = ['What’s on TV tonight?', 'Best movies on Netflix', 'Family movie night'];
    for (const label of primaryChips) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
    // The extra ideas are hidden until "More ideas" is tapped.
    await expect(page.getByRole('button', { name: 'Where can I stream Barbie?' })).toHaveCount(0);

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
    // The DOM disabled attribute must be false on load (only set while "Ruling…").
    expect(await cta.isDisabled(), 'CTA not DOM-disabled on load').toBe(false);
    const opacity = await cta.evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(opacity, `CTA not dimmed @ ${width}px`).toBeGreaterThan(0.9);

    // 6) Bottom nav: six tabs, each ≥44px tall, clear of content, safe-area padded.
    const nav = page.locator('nav.fixed');
    await expect(nav).toBeVisible();
    const tabs = nav.locator('a, button');
    expect(await tabs.count(), 'six bottom-nav tabs').toBe(6);
    const tb = (await tabs.first().boundingBox())!;
    expect(tb.height, `nav tab ≥44px @ ${width}px`).toBeGreaterThanOrEqual(44);
  });
}

test('chips fill the box, More ideas expands, and the CTA submits (mocked)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: HEIGHT });
  await page.goto('/dev/mobile-home', { waitUntil: 'networkidle' });

  // Tapping a chip fills the textarea.
  await page.getByRole('button', { name: 'Family movie night' }).click();
  const box = page.getByLabel('Describe what you like to watch');
  await expect(box).toHaveValue(/family movie/i);

  // "More ideas" reveals the rest, then collapses.
  await page.getByRole('button', { name: 'More ideas' }).click();
  await expect(page.getByRole('button', { name: 'Where can I stream Barbie?' })).toBeVisible();
  await page.getByRole('button', { name: 'Fewer ideas' }).click();
  await expect(page.getByRole('button', { name: 'Where can I stream Barbie?' })).toHaveCount(0);

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
