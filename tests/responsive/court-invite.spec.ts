import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Live Court "Send invite" — AUTOMATED BROWSER VERIFICATION (Chromium). Playwright
 * cannot open the real iOS share sheet or Messages app, so this covers only what a
 * browser can: that tapping calls navigator.share() with the correct room URL
 * directly from the click, AbortError is a silent no-op, a non-abort error falls
 * back to clipboard, a failed clipboard opens the manual modal, an invalid URL shows
 * a visible error, the tap target isn't blocked, and the mobile layout doesn't
 * overflow at 320/375/390. The share-sheet/Messages hand-off is MANUAL — see
 * docs/court-imessage-invite.md.
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'court-invite');
fs.mkdirSync(SHOTS, { recursive: true });

const URL = 'https://clearpath-pearl-chi.vercel.app/court/ABCD';
const CLIP = 'Help us decide what to watch tonight. Join my WatchVERD1CT Court: ' + URL;
const WIDTHS = [320, 375, 390];

async function go(page: Page, mode: string, width = 390) {
  await page.setViewportSize({ width, height: 820 });
  await page.goto(`/dev/court-invite?mode=${mode}`, { waitUntil: 'networkidle' });
}
const btn = (page: Page) => page.locator('[data-testid="court-send-invite"]');

test('tap invokes navigator.share with the correct room URL, from the click', async ({ page }) => {
  await go(page, 'share');
  await btn(page).click();
  await expect.poll(() => page.evaluate(() => window.__shareCalls)).toBe(1);
  expect(await page.evaluate(() => window.__lastShare)).toEqual({
    title: 'Join my WatchVERD1CT Court',
    text: 'Help us decide what to watch tonight. Join my WatchVERD1CT Court:',
    url: URL,
  });
  await expect(page.locator('[data-testid="court-invite-modal"]')).toHaveCount(0);
});

test('AbortError (dismiss) shows no failure — no error, no modal', async ({ page }) => {
  await go(page, 'cancel');
  await btn(page).click();
  await expect.poll(() => page.evaluate(() => window.__shareCalls)).toBe(1);
  await page.waitForTimeout(150);
  await expect(page.locator('[data-testid="court-invite-error"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="court-invite-modal"]')).toHaveCount(0);
  await expect(btn(page)).toContainText('Send invite');
});

test('non-AbortError falls back to clipboard with the copied confirmation', async ({ page }) => {
  await go(page, 'error');
  await btn(page).click();
  await expect(page.locator('[data-testid="court-invite-toast"]')).toContainText('paste it into Messages');
  expect(await page.evaluate(() => window.__lastClip)).toBe(CLIP);
});

test('unsupported share → clipboard + copied confirmation', async ({ page }) => {
  await go(page, 'unsupported');
  await btn(page).click();
  await expect(page.locator('[data-testid="court-invite-toast"]')).toContainText('Invite link copied');
});

test('failed clipboard opens the manual invite modal with Open Messages (sms:)', async ({ page }) => {
  await go(page, 'clipfail');
  await btn(page).click();
  await expect(page.locator('[data-testid="court-invite-modal"]')).toBeVisible();
  const sms = page.locator('[data-testid="court-open-messages"]');
  const href = (await sms.getAttribute('href'))!;
  expect(href.startsWith('sms:&body=')).toBe(true);
  expect(decodeURIComponent(href.replace('sms:&body=', ''))).toBe(CLIP);
  expect(href).not.toMatch(/\s/);
  await expect(page.locator('[data-testid="court-copy-full"]')).toBeVisible();
  await expect(page.locator('[data-testid="court-manual-close"]')).toBeVisible();
});

test('an invalid/undefined room URL shows a visible error and never shares', async ({ page }) => {
  await go(page, 'missing');
  await btn(page).click();
  await expect(page.locator('[data-testid="court-invite-error"]')).toContainText('not ready');
  expect(await page.evaluate(() => window.__shareCalls)).toBe(0);
});

test('rapid taps never open two share sheets; button never permanently disabled', async ({ page }) => {
  await go(page, 'hang');
  const b = btn(page);
  await b.click();
  await b.click({ force: true });
  await b.click({ force: true });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__shareCalls)).toBe(1);
  await expect(b).not.toBeDisabled(); // never uses the disabled attribute
  // The time-bounded guard releases the button within ~1.5s even though share hangs.
  await expect.poll(() => b.innerText(), { timeout: 3000 }).toContain('Send invite');
});

for (const width of WIDTHS) {
  test(`layout + tap target @ ${width}px — no overflow, 52px button, URL row contained`, async ({ page }) => {
    await go(page, 'share', width);
    await page.screenshot({ path: path.join(SHOTS, `court-invite-${width}.png`), fullPage: true });

    // No horizontal overflow.
    const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(sw, `no horizontal scroll @ ${width}`).toBeLessThanOrEqual(cw + 1);

    // Button is a real, ≥52px, unobstructed <button type=button>.
    const b = btn(page);
    await expect(b).toBeVisible();
    expect(await b.evaluate((el) => el.tagName)).toBe('BUTTON');
    expect(await b.getAttribute('type')).toBe('button');
    const bb = (await b.boundingBox())!;
    expect(bb.height, 'button ≥52px').toBeGreaterThanOrEqual(52);
    const blocked = await b.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !(el === top || el.contains(top));
    });
    expect(blocked, 'no invisible element blocks the button').toBe(false);
    expect(await b.evaluate((el) => getComputedStyle(el).pointerEvents)).not.toBe('none');
    expect(await b.evaluate((el) => getComputedStyle(el).touchAction)).toBe('manipulation');

    // The URL row is one line, inside the card, and doesn't overlap the button.
    const card = page.locator('[data-testid="court-invite-url"]').locator('xpath=ancestor::*[contains(@class,"rounded-xl")][1]');
    const url = page.locator('[data-testid="court-invite-url"]');
    const ub = (await url.boundingBox())!;
    const cardBox = (await card.boundingBox())!;
    expect(ub.x + ub.width, 'URL inside card').toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
    expect(ub.y, 'URL row below the button').toBeGreaterThan(bb.y + bb.height - 1);
    // The Copy control works.
    await page.locator('[data-testid="court-copy-url"]').click();
    await expect(page.locator('[data-testid="court-invite-toast"]')).toBeVisible();
  });
}
