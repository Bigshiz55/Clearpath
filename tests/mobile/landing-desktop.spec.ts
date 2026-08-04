import { test, expect, type Page } from '@playwright/test';

/**
 * THE LANDING PAGE, REBUILT AROUND THE COURTROOM.
 *
 * No promise bar, no "Stop scrolling" box, one ceremonial entry: "Thousands
 * of choices. 1 Verd1ct." followed by the three-step process, then a single
 * gold "Enter the Courtroom" button. The DNA quiz and history import stay
 * reachable as quiet secondary buttons right under it — nothing lost, just
 * no longer competing with the entrance. The logo+tagline own a full
 * top-left line, and scale up further on a real desktop instead of stopping
 * at tablet size.
 */
async function open(page: Page, w = 390, h = 900) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/', { waitUntil: 'networkidle' });
}

test('the promise bar and the "stop scrolling" box are both gone', async ({ page }) => {
  await open(page, 1440);
  await expect(page.getByText('Better recommendations')).toHaveCount(0);
  await expect(page.getByText('Stop overpaying for streaming')).toHaveCount(0);
  await expect(page.getByText('Stop scrolling. Start watching the right thing.')).toHaveCount(0);
});

test('the hero reads "Thousands of choices. 1 Verd1ct." with one gold entry button', async ({ page }) => {
  await open(page, 1440);
  const headline = page.getByTestId('hero-headline');
  await expect(headline).toBeVisible();
  await expect(headline).toContainText('THOUSANDS OF CHOICES.');
  await expect(headline).toContainText('1 VERD1CT.');
  const enter = page.getByTestId('cta-enter');
  await expect(enter).toBeVisible();
  await expect(enter).toContainText('Enter the Courtroom');
  await expect(enter).toHaveAttribute('href', '/app');
});

test('never shows a header "Start watching" button alongside the gold entrance', async ({ page }) => {
  await open(page, 1440);
  await expect(page.getByText('Start watching')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('the DNA quiz and import history are still reachable, as quiet links under the button', async ({ page }) => {
  await open(page, 1440);
  const dna = page.getByTestId('cta-dna');
  const imp = page.getByTestId('cta-import');
  await expect(dna).toBeVisible();
  await expect(dna).toHaveAttribute('href', '/app/taste-quiz');
  await expect(imp).toBeVisible();
  await expect(imp).toHaveAttribute('href', '/import-taste');
});

test('the logo grows further on a real desktop than it does on a tablet', async ({ page }) => {
  // The wordmark's accessible name comes from an aria-label ("WatchVerdict")
  // on a span whose visible glyphs (including the styled numeral 1) are
  // aria-hidden — match that, not the on-screen "WatchVERD1CT" text.
  await open(page, 768);
  const tablet = (await page.locator('header').getByRole('link', { name: /WatchVerdict/i }).boundingBox())!;
  await open(page, 1512);
  const desktop = (await page.locator('header').getByRole('link', { name: /WatchVerdict/i }).boundingBox())!;
  expect(desktop.height, 'logo is bigger on a laptop than on a tablet').toBeGreaterThan(tablet.height);
});

test('no sideways scroll at 1440px or on a phone', async ({ page }) => {
  for (const w of [390, 1440]) {
    await open(page, w);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `overflow at ${w}`).toBeLessThanOrEqual(1);
  }
});
