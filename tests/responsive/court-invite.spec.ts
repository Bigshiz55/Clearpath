import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Live Court iMessage-first invite — AUTOMATED BROWSER VERIFICATION (Chromium).
 * Playwright CANNOT drive the real iOS share sheet or Messages app, so this covers
 * only what a browser can: URL generation, that share() is called from the tap with
 * the right payload, cancel handling, the polished fallback modal and its actions
 * (Copy Invite Link · Open Messages [sms:] · Copy Full Invitation), copy
 * confirmations, dedupe, and 390px layout. The share-sheet/Messages hand-off itself
 * is covered by the MANUAL iPhone steps in docs/court-imessage-invite.md.
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'court-invite');
fs.mkdirSync(SHOTS, { recursive: true });

const URL = 'https://watchverdict.app/court/ABCD';
const MESSAGE = 'Join me in WatchVerdict Live Court (room ABCD). We’ll each pick our favorites, then WatchVerdict will combine our taste and choose what we should watch tonight.';
const PHONE = { width: 390, height: 800 };

async function go(page: Page, mode: string) {
  await page.setViewportSize(PHONE);
  await page.goto(`/dev/court-invite?mode=${mode}`, { waitUntil: 'networkidle' });
}
const inviteBtn = (page: Page) => page.locator('[data-testid="court-send-invite"]');

test('Invite is a real, enabled, unobstructed <button> at 390px', async ({ page }) => {
  await go(page, 'share');
  const btn = inviteBtn(page);
  await expect(btn).toBeVisible();
  await expect(btn).toBeEnabled();
  expect(await btn.evaluate((el) => el.tagName)).toBe('BUTTON');
  expect(await btn.getAttribute('type')).toBe('button');
  const covered = await btn.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !(el === top || el.contains(top));
  });
  expect(covered, 'not covered by another element').toBe(false);
  expect(await btn.evaluate((el) => getComputedStyle(el).pointerEvents)).not.toBe('none');
  await page.screenshot({ path: path.join(SHOTS, 'court-imessage-390.png'), fullPage: true });
});

test('tap invokes navigator.share with title + friendly message + secure production URL', async ({ page }) => {
  await go(page, 'share');
  await inviteBtn(page).click();
  await expect.poll(() => page.evaluate(() => window.__shareCalls)).toBe(1);
  const shared = await page.evaluate(() => window.__lastShare);
  expect(shared?.title).toBe('WatchVerdict Live Court');
  expect(shared?.url).toBe(URL); // production domain, secure room id
  expect(shared?.text).toBe(MESSAGE);
  await expect(page.locator('[data-testid="court-invite-modal"]')).toHaveCount(0); // native = no modal
});

test('user cancels the share sheet → no modal, button restored', async ({ page }) => {
  await go(page, 'cancel');
  await inviteBtn(page).click();
  await expect.poll(() => page.evaluate(() => window.__shareCalls)).toBe(1);
  await page.waitForTimeout(150);
  await expect(page.locator('[data-testid="court-invite-modal"]')).toHaveCount(0);
  await expect(inviteBtn(page)).toContainText('Invite');
});

test('share unsupported → polished modal with Open Messages / Copy link / Copy full', async ({ page }) => {
  await go(page, 'unsupported');
  await inviteBtn(page).click();
  const modal = page.locator('[data-testid="court-invite-modal"]');
  await expect(modal).toBeVisible();

  // Open Messages is a real sms: deep link with the encoded message + URL.
  const sms = page.locator('[data-testid="court-open-messages"]');
  await expect(sms).toBeVisible();
  const href = (await sms.getAttribute('href'))!;
  expect(href.startsWith('sms:&body=')).toBe(true);
  const body = decodeURIComponent(href.replace('sms:&body=', ''));
  expect(body).toContain(MESSAGE);
  expect(body).toContain(URL);
  expect(href).not.toMatch(/\s/); // properly URL-encoded

  await expect(page.locator('[data-testid="court-manual-copy"]')).toBeVisible();
  await expect(page.locator('[data-testid="court-copy-full"]')).toBeVisible();
});

test('share throws → same polished modal fallback', async ({ page }) => {
  await go(page, 'error');
  await inviteBtn(page).click();
  await expect(page.locator('[data-testid="court-invite-modal"]')).toBeVisible();
});

test('Copy invite link and Copy full invitation confirm clearly', async ({ page }) => {
  await go(page, 'unsupported');
  await inviteBtn(page).click();
  await page.locator('[data-testid="court-manual-copy"]').click();
  await expect(page.locator('[data-testid="court-modal-toast"]')).toContainText('Invite link copied');
  expect(await page.evaluate(() => window.__lastClip)).toBe(URL);

  await page.locator('[data-testid="court-copy-full"]').click();
  await expect(page.locator('[data-testid="court-modal-toast"]')).toContainText('Invitation copied');
  const full = await page.evaluate(() => window.__lastClip);
  expect(full).toContain(MESSAGE);
  expect(full).toContain(URL);
});

test('rapid taps never open two share sheets', async ({ page }) => {
  await go(page, 'hang');
  const btn = inviteBtn(page);
  await btn.click();
  await btn.click({ force: true });
  await btn.click({ force: true });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__shareCalls)).toBe(1);
  await expect(btn).toContainText('Opening Messages');
  await expect(btn).toBeDisabled();
});

test('QR stays inside its card with the URL below it (no overlap) @ 390px', async ({ page }) => {
  await go(page, 'share');
  const qr = page.locator('[data-testid="court-qr"]');
  await expect(qr).toBeVisible();
  const card = page.locator('.card');
  const qb = (await qr.boundingBox())!;
  const cb = (await card.boundingBox())!;
  expect(qb.x).toBeGreaterThanOrEqual(cb.x - 1);
  expect(qb.x + qb.width).toBeLessThanOrEqual(cb.x + cb.width + 1);
  expect(qb.width).toBeLessThanOrEqual(280 + 1);
  const url = page.locator('[data-testid="court-invite-url"]');
  const ub = (await url.boundingBox())!;
  expect(ub.y).toBeGreaterThanOrEqual(qb.y + qb.height - 1);
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw + 1);
});
