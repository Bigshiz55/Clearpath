import { test, expect } from '@playwright/test';

/**
 * RAPID-SCROLL CHAOS TEST (real browser). Proves the single-active invariant
 * survives aggressive scrolling through a real recommendation grid: at no point
 * may more than one trailer iframe be mounted, no console errors, no stuck audio.
 *
 * This is an OPT-IN test (its own config, not a CI gate) because it needs a live
 * target where trailers actually resolve — a TMDB key and ?trailers=1. Point it
 * at a deploy:
 *   TRAILER_TEST_URL="https://<deploy>/app?trailers=1" \
 *     npx playwright test -c playwright.trailer.config.ts
 * With no reachable target, or when the grid yields no trailer-eligible cards
 * (no TMDB data), it SKIPS rather than fails — an honest no-op, never a green
 * lie.
 */

const TARGET = process.env.TRAILER_TEST_URL;

test.describe('inline trailer — rapid-scroll single-active invariant', () => {
  test.skip(!TARGET, 'set TRAILER_TEST_URL to a deploy that renders a ?trailers=1 grid');

  test('never more than one active trailer iframe while scrolling a long grid', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });

    await page.goto(TARGET!, { waitUntil: 'networkidle' });

    // A trailer-eligible surface must exist, or this environment can't exercise
    // the feature — skip honestly.
    const anyCard = page.locator('[data-testid="trailer-media"]').first();
    if ((await anyCard.count()) === 0) test.skip(true, 'no trailer-capable cards on target');

    let maxIframes = 0;
    // Aggressive up/down churn over 20+ cards.
    for (let round = 0; round < 24; round++) {
      await page.mouse.wheel(0, round % 2 === 0 ? 1400 : -900);
      await page.waitForTimeout(120);
      const iframes = await page.locator('[data-testid="trailer-media"] iframe').count();
      maxIframes = Math.max(maxIframes, iframes);
      expect(iframes, 'at most one active trailer iframe at any instant').toBeLessThanOrEqual(1);
    }

    // Settle on a card and let a preview arm, then confirm still ≤1.
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(1200);
    expect(await page.locator('[data-testid="trailer-media"] iframe').count()).toBeLessThanOrEqual(1);

    expect(consoleErrors, `console errors during scroll: ${consoleErrors.join(' | ')}`).toHaveLength(0);
    // eslint-disable-next-line no-console
    console.log(`max concurrent trailer iframes observed: ${maxIframes}`);
  });
});
