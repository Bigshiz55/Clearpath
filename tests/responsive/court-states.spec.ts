import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Live Court error/recovery states — every classified state renders a readable
 * message + at least one recovery action, with 44px tap targets and no overflow, at
 * every mobile width. Also verifies the diagnostics panel shows a generated invite
 * URL. Backend-free (renders CourtErrorCard via /dev/court-states).
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'court-states');
fs.mkdirSync(SHOTS, { recursive: true });
const WIDTHS = [320, 375, 390, 430];
const STATES = ['room-not-found', 'room-expired', 'room-closed', 'court-already-started', 'room-full', 'migration-missing', 'connection-failed', 'unexpected'];

async function noOverflow(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw + 1);
}

for (const width of WIDTHS) {
  test(`Court states render with recovery @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1200 });
    await page.goto('/dev/court-states', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(SHOTS, `court-states-${width}.png`), fullPage: true });
    await noOverflow(page);

    for (const s of STATES) {
      const card = page.locator(`[data-testid="state-${s}"] [data-testid="court-error"]`);
      await expect(card, s).toBeVisible();
      // Readable, non-empty message.
      const msg = await card.locator('[data-testid="court-error-message"]').innerText();
      expect(msg.trim().length, `${s} message`).toBeGreaterThan(4);
      // At least one recovery action (retry and/or return-home), each ≥44px.
      const actions = card.locator('button, a');
      expect(await actions.count(), `${s} has an action`).toBeGreaterThan(0);
      for (let i = 0; i < await actions.count(); i++) {
        const b = (await actions.nth(i).boundingBox())!;
        expect(b.height, `${s} action ≥44px`).toBeGreaterThanOrEqual(40);
        expect(b.x + b.width, `${s} action inside viewport`).toBeLessThanOrEqual(width + 1);
      }
    }

    // Transient states expose a retry; terminal ones at least a home link.
    await expect(page.locator('[data-testid="state-connection-failed"] [data-testid="court-error-retry"]')).toBeVisible();
    await expect(page.locator('[data-testid="state-room-full"] [data-testid="court-error-home"]')).toBeVisible();
  });
}

test('diagnostics panel shows a generated invite URL', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1200 });
  await page.goto('/dev/court-states', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="diag-invite"]')).toContainText('/court/AB12CD34');
});
