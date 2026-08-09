import { test, expect } from '@playwright/test';

/**
 * The OLD Taste Interview (Witness Testimony / Quick Interview / the transcription
 * UI) is retired. The NEW Voice DNA interview at /voice-dna is a real, public
 * feature — its own flow is covered by voice-interview.spec.ts. These tests guard
 * only the genuine removals: the retired NAMES and the dead transcription/mic UI
 * must not reappear on the public marketing/import surfaces.
 */

test('no transcription status or dead microphone control on public pages', async ({ page }) => {
  for (const route of ['/', '/import-taste']) {
    await page.goto(route);
    const body = (await page.textContent('body')) ?? '';
    expect(body, route).not.toMatch(/awaiting transcription|transcription service|answer out loud/i);
    await expect(page.getByTestId('record-button'), route).toHaveCount(0);
  }
});

test('the retired interview names are absent from public pages', async ({ page }) => {
  for (const route of ['/', '/import-taste']) {
    await page.goto(route);
    const body = (await page.textContent('body')) ?? '';
    // NOTE: "Voice DNA" is intentionally NOT banned — it is the real, shipped
    // feature. Only the genuinely-removed old interview names are guarded.
    for (const banned of ['Witness Testimony', 'Taste Interview', 'Quick Interview']) {
      expect(body, `${route} · ${banned}`).not.toContain(banned);
    }
  }
});

test('importing history still works and is not a dead link', async ({ page }) => {
  await page.goto('/import-taste');
  await expect(page.getByTestId('import-taste')).toBeVisible();
  await expect(page.getByTestId('csv-input')).toHaveCount(1);
  await expect(page.getByTestId('back-to-app')).toHaveAttribute('href', '/app');
});
