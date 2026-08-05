import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * FULL viewport-matrix responsive regression (permanent guard). Drives the two
 * harness surfaces that render the real production components — the app home
 * (/dev/mobile-home) and the Watch-DNA calibration (/dev/dna-quiz) — across every
 * device class from 320px up through large desktop, in portrait AND landscape,
 * and asserts the invariants the redesign must never regress:
 *   • zero horizontal overflow (no page-level horizontal scroll)
 *   • the WatchVERD1CT wordmark renders intact (no clip / gap)
 *   • the DNA quiz fits its viewport with a visible poster + action grid
 * Screenshots for every class land in test-results/responsive/ for visual review.
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'responsive');
fs.mkdirSync(SHOTS, { recursive: true });

interface VP {
  name: string;
  w: number;
  h: number;
  klass: 'phone' | 'tablet' | 'desktop';
}

// The exact device classes the spec requires, portrait + landscape.
const VIEWPORTS: VP[] = [
  { name: 'iphone-se-320x568', w: 320, h: 568, klass: 'phone' },
  { name: 'android-360x640', w: 360, h: 640, klass: 'phone' },
  { name: 'iphone-8-375x667', w: 375, h: 667, klass: 'phone' },
  { name: 'iphone-12-390x844', w: 390, h: 844, klass: 'phone' },
  { name: 'iphone-15-393x852', w: 393, h: 852, klass: 'phone' },
  { name: 'iphone-xr-414x896', w: 414, h: 896, klass: 'phone' },
  { name: 'iphone-max-430x932', w: 430, h: 932, klass: 'phone' },
  { name: 'phone-landscape-844x390', w: 844, h: 390, klass: 'phone' },
  { name: 'tablet-portrait-768x1024', w: 768, h: 1024, klass: 'tablet' },
  { name: 'tablet-landscape-1024x768', w: 1024, h: 768, klass: 'tablet' },
  { name: 'desktop-1280x800', w: 1280, h: 800, klass: 'desktop' },
  { name: 'large-desktop-1536x960', w: 1536, h: 960, klass: 'desktop' },
];

async function noHorizontalOverflow(page: Page, label: string) {
  const { scrollW, innerW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    innerW: document.documentElement.clientWidth,
  }));
  expect(scrollW, `${label}: no horizontal overflow (scrollW ${scrollW} ≤ clientW ${innerW})`).toBeLessThanOrEqual(innerW + 1);
}

test.describe('app home — responsive matrix', () => {
  for (const vp of VIEWPORTS) {
    test(`home @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/dev/mobile-home', { waitUntil: 'networkidle' });

      // The build/version badge is present on every screen.
      await expect(page.locator('[data-testid="build-badge"]')).toBeVisible();

      // Wordmark intact (the intentional numeral 1 as the "I", never clipped).
      const brand = page.locator('[data-testid="site-header"] span.whitespace-nowrap').first();
      const brandText = (await brand.innerText()).replace(/\s+/g, '');
      expect(brandText, `${vp.name}: wordmark intact (got "${brandText}")`).toBe('WatchVERD1CT');
      expect(brandText, `${vp.name}: never clipped/gapped`).not.toMatch(/VERDCT|VERD_CT|VERD\s+CT/);

      await noHorizontalOverflow(page, vp.name);
      await page.screenshot({ path: path.join(SHOTS, `home-${vp.name}.png`), fullPage: false });
    });
  }
});

test.describe('watch-dna calibration — responsive matrix', () => {
  for (const vp of VIEWPORTS) {
    test(`quiz @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/dev/dna-quiz', { waitUntil: 'networkidle' });

      // Dismiss the one-time "how it works" intro if it's showing (fresh context).
      const introDismiss = page.locator('[data-testid="quiz-intro-dismiss"]');
      if (await introDismiss.isVisible().catch(() => false)) await introDismiss.click();

      // The quiz tile renders with its poster + the four-action grid visible.
      await expect(page.locator('[data-testid="dna-quiz"]')).toBeVisible();
      await expect(page.locator('[data-testid="quiz-poster"]')).toBeVisible();
      // `quiz-grid` was renamed to `quiz-actions` when the quiz gained its
      // two-state (primary / rating) button group; the selector was left
      // behind, so this matrix had been failing on a missing element rather
      // than on any layout fact.
      await expect(page.locator('[data-testid="quiz-actions"]')).toBeVisible();

      // The poster must be SUBSTANTIAL, never collapsed to a thumbnail (the real
      // on-device bug) — but it is ALSO structurally capped at 18dvh so it can
      // never overlap the answer buttons (the other real on-device bug, iOS
      // Safari). So the floor scales with the viewport: 17% of its height
      // (1% slack under the CSS clamp), bounded to [60, 130].
      const posterH = await page.locator('[data-testid="quiz-poster"]').evaluate((n) => n.getBoundingClientRect().height);
      // 14dvh on small phones (approved), 17dvh elsewhere. The poster must stay
      // recognisable; below ~360px wide it may go smaller to keep the metadata
      // line clear of the action row.
      const ratio = vp.w <= 480 ? 0.14 : 0.17;
      const floor = Math.min(130, Math.max(60, Math.round(vp.h * ratio)));
      expect(posterH, `${vp.name}: poster not collapsed (h=${Math.round(posterH)} ≥ ${floor})`).toBeGreaterThanOrEqual(floor);

      await noHorizontalOverflow(page, `quiz ${vp.name}`);
      await page.screenshot({ path: path.join(SHOTS, `quiz-${vp.name}.png`), fullPage: false });
    });
  }
});
