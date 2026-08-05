import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * SIMPLE VIEW MUST NOT RETURN. Simple View was a parallel reduced interface
 * (`wv_simple` → `data-simple='1'` → a CSS block that scaled the rem base and
 * HID content via `[data-simple-hide]`). A pre-paint script in the root layout
 * restored the flag on every load, so anyone who had ever opened Vintage Mode
 * kept reopening the whole app in Simple View.
 *
 * These are the mission's TESTS A–G: the full view must be the only view, on a
 * fresh device, with a legacy flag seeded, via URL parameter, on mobile, after
 * refresh, and after navigating away and back.
 */

const SHOTS = 'test-results/no-simple-view';

/** The invariant: no reduced-mode attribute, and no rem-scaling from it. */
async function assertFullView(page: Page, where: string) {
  const attr = await page.evaluate(() => document.documentElement.getAttribute('data-simple'));
  expect(attr, `${where}: data-simple must never be set`).toBeNull();
  const rootFont = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
  expect(rootFont, `${where}: Simple View's 20px rem scaling must not be active`).toBe('16px');
  // Nothing may be hidden by the removed opt-out hook.
  const hidden = await page.evaluate(() => document.querySelectorAll('[data-simple-hide]').length);
  expect(hidden, `${where}: [data-simple-hide] elements must not exist`).toBe(0);
}

/** The legacy flag must be gone from every storage surface. */
async function assertFlagsCleared(page: Page, where: string) {
  const state = await page.evaluate(() => ({
    local: localStorage.getItem('wv_simple'),
    session: sessionStorage.getItem('wv_simple'),
    cookie: document.cookie.includes('wv_simple=1'),
  }));
  expect(state.local, `${where}: localStorage wv_simple must be cleared`).toBeNull();
  expect(state.session, `${where}: sessionStorage wv_simple must be cleared`).toBeNull();
  expect(state.cookie, `${where}: wv_simple cookie must be cleared`).toBe(false);
}

test.describe('TEST A — fresh user', () => {
  test('a device with no stored preferences gets the full view', async ({ page }) => {
    await page.goto('/dev/visual-qa');
    await assertFullView(page, 'fresh user');
    // The full card content is present (nothing reduced away).
    await expect(page.getByTestId('qa-grid').locator('.card').first()).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'A-fresh-full-view.png') });
  });
});

test.describe('TEST B — legacy Simple View setting is migrated away', () => {
  test('a seeded wv_simple flag is cleared before paint and the full view renders', async ({ page }) => {
    // Seed the legacy preference exactly as the old app wrote it.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('wv_simple', '1');
        sessionStorage.setItem('wv_simple', '1');
        document.cookie = 'wv_simple=1; path=/';
      } catch { /* ignore */ }
    });
    await page.goto('/dev/visual-qa');
    await assertFullView(page, 'legacy flag');
    await assertFlagsCleared(page, 'legacy flag');

    // And it must STAY cleared on the next navigation (not resurrected).
    await page.goto('/dev/finder');
    await assertFullView(page, 'legacy flag after navigation');
    await assertFlagsCleared(page, 'legacy flag after navigation');
  });
});

test.describe('TEST C — legacy URL parameters', () => {
  for (const q of ['?simple=1', '?view=simple', '?viewMode=compact', '?simpleView=true', '?cardMode=minimal']) {
    test(`"${q}" renders the full view and the parameter is stripped`, async ({ page }) => {
      await page.goto(`/dev/visual-qa${q}`);
      await assertFullView(page, `url ${q}`);
      const url = page.url();
      expect(url, `${q} must be stripped from the URL`).not.toMatch(/simple|viewMode|cardMode|view=simple/i);
    });
  }
});

test.describe('TEST D — mobile never falls back', () => {
  for (const w of [320, 375, 430]) {
    test(`full view at ${w}px with usable cards`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await page.addInitScript(() => { try { localStorage.setItem('wv_simple', '1'); } catch { /* ignore */ } });
      await page.goto('/dev/visual-qa');
      await assertFullView(page, `mobile ${w}px`);
      await assertFlagsCleared(page, `mobile ${w}px`);
      // Cards remain fully usable — actions present and at tap size.
      const card = page.getByTestId('qa-grid').locator('.card').first();
      await expect(card).toBeVisible();
      const forBtn = card.getByRole('button', { name: /For it — more like this/ });
      await expect(forBtn).toBeVisible();
      expect((await forBtn.boundingBox())!.height).toBeGreaterThanOrEqual(43);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `overflow at ${w}px`).toBeLessThanOrEqual(0);
      if (w === 375) await page.screenshot({ path: path.join(SHOTS, 'D-mobile-full-view.png'), fullPage: true });
    });
  }
});

test.describe('TEST E — refresh', () => {
  test('the full view survives a reload', async ({ page }) => {
    await page.goto('/dev/visual-qa');
    await assertFullView(page, 'before refresh');
    await page.reload();
    await assertFullView(page, 'after refresh');
  });
});

test.describe('TEST F — returning user', () => {
  test('navigating away and back keeps the full view', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('wv_simple', '1'); } catch { /* ignore */ } });
    await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
    await page.goto('/dev/finder', { waitUntil: 'networkidle' });
    // `goBack()` resolves on the navigation COMMIT, not on the client render
    // that follows it, so the first `page.evaluate` inside assertFullView was
    // racing the App Router and dying with "Execution context was destroyed,
    // most likely because of a navigation". Wait for the restored page to be
    // the one actually under measurement.
    await page.goBack({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="qa-grid"]');
    await assertFullView(page, 'returning user');
    await assertFlagsCleared(page, 'returning user');
  });
});

test.describe('TEST G — no way back in', () => {
  test('no Simple View control exists anywhere in the UI', async ({ page }) => {
    for (const route of ['/dev/visual-qa', '/dev/finder', '/dev/court', '/dev/mobile-home']) {
      await page.goto(route);
      const text = (await page.locator('body').innerText()).toLowerCase();
      expect(text, `${route} must not offer Simple View`).not.toContain('simple view');
      const toggles = await page.getByRole('button', { name: /simple/i }).count();
      expect(toggles, `${route} must have no Simple View toggle`).toBe(0);
    }
  });

  test('the reduced-mode stylesheet is gone — setting the attribute manually does nothing', async ({ page }) => {
    await page.goto('/dev/visual-qa');
    const before = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    // Even if something set the old attribute, no CSS should respond to it.
    await page.evaluate(() => document.documentElement.setAttribute('data-simple', '1'));
    const after = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    expect(after, 'the data-simple CSS block must no longer exist').toBe(before);
  });
});
