import { test, expect } from '@playwright/test';

/**
 * The Taste Interview is retired. These check the removal from the outside:
 * the old URL does not render an interview, nothing links to one, and no
 * unfinished voice or transcription UI is left behind.
 */

test('TEST 6: the retired URL redirects instead of showing an interview', async ({ page }) => {
  const res = await page.goto('/voice-dna');
  // It lands somewhere real, not on an error screen.
  expect(res?.status()).toBeLessThan(400);
  expect(page.url()).not.toContain('/voice-dna');
  await expect(page.getByTestId('question-prompt')).toHaveCount(0);
  await expect(page.getByTestId('start-quick')).toHaveCount(0);
});

test('TESTS 9+10: no transcription status or dead microphone control anywhere', async ({ page }) => {
  for (const route of ['/', '/import-taste']) {
    await page.goto(route);
    const body = (await page.textContent('body')) ?? '';
    expect(body, route).not.toMatch(/awaiting transcription|transcription service|answer out loud/i);
    await expect(page.getByTestId('record-button'), route).toHaveCount(0);
  }
});

test('TESTS 1-5: the interview names are absent from public pages', async ({ page }) => {
  for (const route of ['/', '/import-taste']) {
    await page.goto(route);
    const body = (await page.textContent('body')) ?? '';
    for (const banned of ['Witness Testimony', 'Taste Interview', 'Voice DNA', 'Quick Interview']) {
      expect(body, `${route} · ${banned}`).not.toContain(banned);
    }
  }
});

test('TEST 15+24: importing history still works and is not a dead link', async ({ page }) => {
  await page.goto('/import-taste');
  await expect(page.getByTestId('import-taste')).toBeVisible();
  await expect(page.getByTestId('csv-input')).toHaveCount(1);
  await expect(page.getByTestId('back-to-app')).toHaveAttribute('href', '/app');
});

test('TESTS 25-27: the retired route behaves at every width', async ({ page }) => {
  for (const [w, h] of [[320, 568], [768, 1024], [1440, 900]] as [number, number][]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/voice-dna');
    expect(page.url(), `${w}px`).not.toContain('/voice-dna');
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${w}px overflow`).toBeLessThanOrEqual(0);
  }
});
