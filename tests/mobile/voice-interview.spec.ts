import { test, expect } from '@playwright/test';

/**
 * VOICE DNA — the one-button product experience, proved keyless.
 *
 * The harness has no OpenAI key, so /api/voice/session answers `fallback` and the
 * browser runs the keyless path. Headless Chromium has no SpeechRecognition, so
 * the interview drops to the typed transport — which exercises the EXACT same
 * turn loop the voice transports use: one answer in → the engine advances → the
 * next scripted line comes out. That is what these tests assert.
 *
 * This is the regression guard for the two product fixes:
 *   1. Stage 1 is rapid-fire grouped genre triples, and the staged flow (triage →
 *      drill-down → viewing prefs → title anchors) is preserved end to end.
 *   2. The turn loop never dead-ends after one answer — every typed answer yields
 *      the next question, all the way to the DNA reveal.
 */

const PHONE = { width: 390, height: 844 };

async function startInterview(page: import('@playwright/test').Page) {
  await page.setViewportSize(PHONE);
  await page.goto('/voice-dna');
  // Idle screen with the single start button.
  await expect(page.getByTestId('voice-start')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('voice-start').click();
  // Keyless → typed transport comes up.
  await expect(page.getByTestId('voice-typed-form')).toBeVisible({ timeout: 15_000 });
}

/** Type one answer and submit it. */
async function answer(page: import('@playwright/test').Page, text: string) {
  const input = page.locator('#voice-typed-input');
  await input.fill(text);
  await input.press('Enter');
}

/** The whole caption transcript so far, lower-cased. */
async function transcript(page: import('@playwright/test').Page): Promise<string> {
  return ((await page.getByTestId('live-captions').textContent()) ?? '').toLowerCase();
}

test('Stage 1 opens with a rapid-fire genre triple', async ({ page }) => {
  await startInterview(page);
  await expect
    .poll(() => transcript(page), { timeout: 10_000 })
    .toMatch(/horror.*comedy.*crime/);
});

test('every answer advances — the interview never dead-ends after one answer', async ({ page }) => {
  await startInterview(page);
  await expect.poll(() => transcript(page), { timeout: 10_000 }).toContain('horror');

  // Walk the whole script by answering each prompt. It must keep producing new
  // questions and finish at the DNA reveal — never stall on a single answer.
  const answers = [
    'crime', 'action', 'thriller', 'mystery', // Stage 1 triples
    'detectives', 'the tension', // Stage 2 drill-down
    'slow burn', 'something bleak and intense', 'no limit', 'subtitles are fine', // Stage 3 prefs
    'I loved Prisoners', 'I could not finish Tenet', // Stage 4 anchors
  ];
  for (const a of answers) {
    // If we've already reached the reveal, stop early — success.
    if (await page.getByTestId('dna-reveal').count()) break;
    await answer(page, a);
    // The turn is processed and a next line (or the reveal) appears.
    await page.waitForTimeout(400);
  }

  // The interview reached its designed end: the DNA reveal is shown.
  await expect(page.getByTestId('dna-reveal')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('reveal-restart')).toBeVisible();
});

test('the staged flow surfaces viewing-preference questions after the genre stages', async ({ page }) => {
  await startInterview(page);
  await expect.poll(() => transcript(page), { timeout: 10_000 }).toContain('horror');

  // Answer through Stage 1 + Stage 2 and into Stage 3.
  for (const a of ['crime', 'action', 'thriller', 'mystery', 'detectives', 'the tension', 'slow burn']) {
    if (await page.getByTestId('dna-reveal').count()) break;
    await answer(page, a);
    await page.waitForTimeout(400);
  }
  // A viewing-preference prompt (pacing / subtitles / violence / tone) has appeared.
  await expect
    .poll(() => transcript(page), { timeout: 10_000 })
    .toMatch(/slow burn|frame one|subtitles|violence|bleak|warm and easy/);
});

test('no horizontal overflow on the phone during the interview', async ({ page }) => {
  await startInterview(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
