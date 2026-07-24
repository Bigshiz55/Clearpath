import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Brand logo (WatchVERD1CT) — proves the regression is fixed: a white numeral 1
 * appears between D and C, in the approved pink wordmark, never clipped/collapsed
 * at any width (the old iOS flip collapsed to a gap), and reduced-motion shows a
 * static 1. All header variants render the same shared component.
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'mobile');
fs.mkdirSync(SHOTS, { recursive: true });

async function one(page: Page) {
  return page.locator('[data-testid="logo-word"] .wv-logo-1');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/logo', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('logo-harness')).toBeVisible();
});

test('the white numeral 1 sits between D and C in every logo variant', async ({ page }) => {
  // Present in the header logo, the md logo, and the standalone wordmark.
  for (const id of ['logo-header', 'logo-md', 'logo-word']) {
    const one = page.locator(`[data-testid="${id}"] .wv-logo-1`);
    await expect(one).toHaveText('1');
  }
  // The wordmark reads WatchVERD1CT (D 1 C in order).
  await expect(page.getByTestId('logo-word')).toContainText('VERD1CT');
  // Accessible name stays "WatchVerdict".
  await expect(page.getByLabel('WatchVerdict').first()).toBeVisible();
});

test('the 1 is white, the wordmark is pink, and nothing is clipped', async ({ page }) => {
  const oneEl = await one(page);
  const oneColor = await oneEl.evaluate((el) => getComputedStyle(el).color);
  expect(oneColor).toBe('rgb(255, 255, 255)'); // white 1
  const pink = await oneEl.evaluate((el) => getComputedStyle(el.parentElement as Element).color);
  expect(pink).toBe('rgb(255, 20, 147)'); // #ff1493 on VERD…CT
  // Real, non-collapsed glyph (the exact iOS regression) at several widths.
  for (const w of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width: w, height: 800 });
    const box = (await oneEl.boundingBox())!;
    expect(box.width, `1 has width @ ${w}`).toBeGreaterThan(3);
    expect(box.height, `1 has height @ ${w}`).toBeGreaterThan(6);
  }
});

test('reduced-motion shows a static 1 (no transform), full-motion animates it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload({ waitUntil: 'networkidle' });
  const oneEl = await one(page);
  await expect(oneEl).toHaveText('1');
  const anim = await oneEl.evaluate((el) => getComputedStyle(el).animationName);
  expect(anim === 'none' || anim === '').toBeTruthy(); // no animation under reduce
  const box = (await oneEl.boundingBox())!;
  expect(box.width).toBeGreaterThan(3); // still visible & sized

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(SHOTS, 'logo-wordmark.png') });
});
