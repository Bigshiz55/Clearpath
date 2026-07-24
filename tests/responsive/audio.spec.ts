import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Verified-audio harness (/dev/audio): asserts the verified list and the separated
 * "Possible matches — English audio not yet verified" section render at mobile and
 * desktop with no clipping, that every card carries a visible status label, that
 * verified cards show only VERIFIED status, that unverified cards are never marked
 * verified, and that Judge Verity never appears (required test #14). Screenshots go
 * to test-results/audio/ for visual review.
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'audio');
fs.mkdirSync(SHOTS, { recursive: true });

const WIDTHS = [360, 390, 768, 1280];
const HEIGHT = 1200;

async function noHorizontalScroll(page: Page) {
  const { scrollW, innerW } = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }));
  expect(scrollW, `scrollWidth ${scrollW} ≤ viewport ${innerW}`).toBeLessThanOrEqual(innerW + 1);
}

for (const width of WIDTHS) {
  test(`Audio verification @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto('/dev/audio', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(SHOTS, `audio-${width}.png`), fullPage: true });

    await noHorizontalScroll(page);

    // Both sections render.
    await expect(page.locator('[data-testid="verified-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="possible-section"]')).toBeVisible();

    // The separated section carries the exact honest label.
    const possibleHeading = await page.locator('[data-testid="possible-section"] h2').innerText();
    expect(possibleHeading.toLowerCase()).toContain('not yet verified');

    // Every card shows exactly one visible status label.
    const cards = page.locator('[data-testid="audio-card"]');
    const n = await cards.count();
    expect(n, 'has audio cards').toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      const badge = card.locator('[data-testid="audio-status"]');
      await expect(badge).toHaveCount(1);
      await expect(badge).toBeVisible();
      // Status text is inside the card bounds (no clipping).
      const cb = (await card.boundingBox())!;
      const bb = (await badge.boundingBox())!;
      expect(bb.x + bb.width, 'status inside card').toBeLessThanOrEqual(cb.x + cb.width + 1);
    }

    // Verified section: every card is VERIFIED, and only there.
    const verifiedStatuses = await page.locator('[data-testid="verified-section"] [data-testid="audio-status"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
    expect(verifiedStatuses.length).toBeGreaterThan(0);
    expect(verifiedStatuses.every((s) => s === 'VERIFIED_ENGLISH_AUDIO'), `verified only: ${verifiedStatuses.join(',')}`).toBe(true);

    // Possible section: NEVER marked verified.
    const possibleStatuses = await page.locator('[data-testid="possible-section"] [data-testid="audio-status"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
    expect(possibleStatuses.length).toBeGreaterThan(0);
    expect(possibleStatuses.some((s) => s === 'VERIFIED_ENGLISH_AUDIO'), 'no verified in possible').toBe(false);

    // Required test #14: Judge Verity never appears in search/recommendations.
    const body = (await page.locator('body').innerText()).toLowerCase();
    expect(body, 'no Judge Verity').not.toContain('judge verity');
  });
}
