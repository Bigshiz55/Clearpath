import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Court "Send invite" reliability + layout, driven through the /dev/court-invite
 * harness (deterministic fake navigator per ?mode=). Covers: share success, cancel,
 * unsupported, share error, clipboard fallback, manual modal, rapid-tap dedupe,
 * correct court URL, button clickable at 390px, and the responsive QR/URL layout.
 */
const SHOTS = path.join(process.cwd(), 'test-results', 'court-invite');
fs.mkdirSync(SHOTS, { recursive: true });

const URL = 'https://watchverdict.app/court/ABCD';
const PHONE = { width: 390, height: 800 };

async function go(page: Page, mode: string) {
  await page.setViewportSize(PHONE);
  await page.goto(`/dev/court-invite?mode=${mode}`, { waitUntil: 'networkidle' });
}
const sendBtn = (page: Page) => page.locator('[data-testid="court-send-invite"]');

test('button is a real, enabled, unobstructed <button> at 390px', async ({ page }) => {
  await go(page, 'share');
  const btn = sendBtn(page);
  await expect(btn).toBeVisible();
  await expect(btn).toBeEnabled();
  // It is a real button element, type=button.
  expect(await btn.evaluate((el) => el.tagName)).toBe('BUTTON');
  expect(await btn.getAttribute('type')).toBe('button');
  // Nothing covers it: the element at its center IS the button (or its child).
  const covered = await btn.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !(el === top || el.contains(top));
  });
  expect(covered, 'button not covered by another element').toBe(false);
  // pointer-events not disabled.
  expect(await btn.evaluate((el) => getComputedStyle(el).pointerEvents)).not.toBe('none');
  await page.screenshot({ path: path.join(SHOTS, 'court-invite-390.png'), fullPage: true });
});

test('navigator.share succeeds → shares the correct court URL, no fallback', async ({ page }) => {
  await go(page, 'share');
  await sendBtn(page).click();
  await expect.poll(() => page.evaluate(() => window.__shareCalls)).toBe(1);
  const shared = await page.evaluate(() => window.__lastShare);
  expect(shared).toEqual({ title: 'Join my WatchVerdict Court', text: 'Join my WatchVerdict Court and help decide what we should watch.', url: URL });
  await expect(page.locator('[data-testid="court-invite-toast"]')).toHaveCount(0); // native share = no toast
  expect(await page.evaluate(() => window.__clipWrites)).toBe(0);
});

test('user cancels the share sheet → no toast, no modal, no clipboard write', async ({ page }) => {
  await go(page, 'cancel');
  await sendBtn(page).click();
  await expect.poll(() => page.evaluate(() => window.__shareCalls)).toBe(1);
  await page.waitForTimeout(200);
  await expect(page.locator('[data-testid="court-invite-toast"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="court-invite-modal"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__clipWrites)).toBe(0);
  await expect(sendBtn(page)).toContainText('Send invite'); // label restored
});

test('navigator.share unsupported → clipboard fallback + "Invite link copied" toast', async ({ page }) => {
  await go(page, 'unsupported');
  await sendBtn(page).click();
  await expect(page.locator('[data-testid="court-invite-toast"]')).toBeVisible();
  await expect(page.locator('[data-testid="court-invite-toast"]')).toContainText('Invite link copied');
  expect(await page.evaluate(() => window.__clipWrites)).toBe(1);
  expect(await page.evaluate(() => window.__lastClip)).toBe(URL);
});

test('navigator.share throws a non-cancel error → clipboard fallback + toast', async ({ page }) => {
  await go(page, 'error');
  await sendBtn(page).click();
  await expect.poll(() => page.evaluate(() => window.__shareCalls)).toBe(1);
  await expect(page.locator('[data-testid="court-invite-toast"]')).toBeVisible();
  expect(await page.evaluate(() => window.__clipWrites)).toBe(1);
});

test('clipboard fails and execCommand fails → centered manual modal with URL + Copy + Close', async ({ page }) => {
  await go(page, 'clipfail');
  await sendBtn(page).click();
  const modal = page.locator('[data-testid="court-invite-modal"]');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(URL);
  await expect(page.locator('[data-testid="court-manual-copy"]')).toBeVisible();
  await expect(page.locator('[data-testid="court-manual-close"]')).toBeVisible();
  await page.locator('[data-testid="court-manual-close"]').click();
  await expect(modal).toHaveCount(0);
});

test('rapid repeated taps do NOT trigger multiple share calls', async ({ page }) => {
  await go(page, 'hang'); // share never resolves → lock stays held
  const btn = sendBtn(page);
  await btn.click();
  await btn.click({ force: true });
  await btn.click({ force: true });
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__shareCalls)).toBe(1);
  // While a share is opening the button shows the transient state and is disabled.
  await expect(btn).toContainText('Opening share');
  await expect(btn).toBeDisabled();
});

test('QR is fully inside its card and the URL sits BELOW it (no overlap)', async ({ page }) => {
  await go(page, 'share');
  // QR is shown by default in the harness.
  const qr = page.locator('[data-testid="court-qr"]');
  await expect(qr).toBeVisible();
  const card = page.locator('.card');
  const qb = (await qr.boundingBox())!;
  const cb = (await card.boundingBox())!;
  // Inside the card horizontally, and responsively sized (≤ 280px, ≤ 72vw).
  expect(qb.x).toBeGreaterThanOrEqual(cb.x - 1);
  expect(qb.x + qb.width).toBeLessThanOrEqual(cb.x + cb.width + 1);
  expect(qb.width).toBeLessThanOrEqual(280 + 1);
  expect(qb.width).toBeLessThanOrEqual(PHONE.width * 0.72 + 1);
  // URL is BELOW the QR, not overlapping it.
  const url = page.locator('[data-testid="court-invite-url"]');
  const ub = (await url.boundingBox())!;
  expect(ub.y, 'URL starts below the QR bottom').toBeGreaterThanOrEqual(qb.y + qb.height - 1);
  // No horizontal page overflow.
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw + 1);
});
