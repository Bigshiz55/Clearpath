import { test, expect, type Page } from '@playwright/test';

/**
 * THE FIRST SCREEN A NEW PERSON SEES.
 *
 * It used to be "pick a username" — admin for a product they had not yet seen
 * do anything. It now opens on what the app is for, and the username is derived
 * from the display name so the common path is type-once.
 */
const PHONES = [
  { w: 320, h: 568 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
];

async function open(page: Page, w = 390, h = 844) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/dev/onboarding', { waitUntil: 'networkidle' });
}

test('opens on what the app does, not on a form', async ({ page }) => {
  await open(page);
  const welcome = page.getByTestId('onboarding-welcome');
  await expect(welcome).toBeVisible();
  // No inputs on the first screen at all.
  expect(await welcome.locator('input, select').count()).toBe(0);
  await expect(page.getByTestId('onboarding-start')).toBeVisible();
});

test('the welcome screen names the three things you can actually do', async ({ page }) => {
  await open(page);
  const text = await page.getByTestId('onboarding-welcome').innerText();
  expect(text).toMatch(/plain words/i);
  expect(text).toMatch(/learns what you like/i);
  expect(text).toMatch(/verd1ct/i);
});

test('no progress bar on the welcome step — a bar implies a form', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('onboarding-welcome')).toBeVisible();
  // Named hook, not a utility class — `.h-1.5` matches unrelated elements, and
  // a test that passes for the wrong reason is worse than no test.
  await expect(page.getByTestId('onboarding-progress')).toHaveCount(0);
  await page.getByTestId('onboarding-start').click();
  await expect(page.getByTestId('onboarding-progress')).toBeVisible();
});

test('the username fills itself in from the name, and stays editable', async ({ page }) => {
  await open(page);
  await page.getByTestId('onboarding-start').click();
  // Pre-filled from the account name rather than left blank.
  await expect(page.locator('#username')).toHaveValue('scottturner');

  await page.locator('#name').fill('Jane Doe');
  await expect(page.locator('#username')).toHaveValue('janedoe');

  // Once the user edits it themselves, typing the name must not overwrite it.
  await page.locator('#username').fill('mine');
  await page.locator('#name').fill('Jane Q Doe');
  await expect(page.locator('#username')).toHaveValue('mine');
});

for (const { w, h } of PHONES) {
  test(`the welcome screen fits and every control is tappable @ ${w}x${h}`, async ({ page }) => {
    await open(page, w, h);
    const start = page.getByTestId('onboarding-start');
    const box = await start.boundingBox();
    expect(box!.height, 'start button height').toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no sideways scroll').toBeLessThanOrEqual(1);
  });
}
