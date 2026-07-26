import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * VERD1CT VOICE DNA — the typed interview, driven the way a person would.
 *
 * The properties under test are the product's promises, not implementation
 * details: nothing reaches Viewer DNA without review, a guessed title blocks the
 * save, contradictions are asked about rather than resolved for you, and the
 * audio control never pretends to work.
 */

const R = '/voice-dna';
const SHOTS = 'test-results/voice-dna';

const VIEWPORTS: [string, number, number][] = [
  ['small-phone', 320, 568],
  ['phone', 375, 812],
  ['large-phone', 430, 932],
  ['tablet', 820, 1180],
  ['desktop', 1440, 900],
];

async function answer(page: Page, text: string) {
  await page.getByTestId('answer-input').fill(text);
  await page.getByTestId('answer-submit').click();
}

/** Answer open questions until the review screen appears. */
async function answerUntilReview(page: Page, answers: string[]) {
  for (const a of answers) {
    if (await page.getByTestId('review-list').isVisible().catch(() => false)) return;
    if (await page.getByTestId('choice-group').isVisible().catch(() => false)) return;
    await answer(page, a);
  }
}

test.describe('entry', () => {
  test('states the promise and the privacy terms before anything is asked', async ({ page }) => {
    await page.goto(R);
    await expect(page.getByTestId('voice-dna')).toBeVisible();
    const privacy = page.getByTestId('privacy-note');
    await expect(privacy).toContainText(/runs in this browser/i);
    await expect(privacy).toContainText(/review every conclusion/i);
    await expect(privacy).toContainText(/delete the whole thing/i);
  });

  test('offers a short and a long interview', async ({ page }) => {
    await page.goto(R);
    await expect(page.getByTestId('start-quick')).toContainText('5 questions');
    await expect(page.getByTestId('start-full')).toContainText('12 questions');
  });

  test('HARD: the audio control is disabled and says why', async ({ page }) => {
    await page.goto(R);
    const btn = page.getByTestId('record-button');
    await expect(btn).toBeDisabled();
    await expect(btn).toContainText(/awaiting transcription setup/i);
    await expect(page.getByTestId('audio-status'))
      .toContainText(/no transcription service is configured/i);
    // It must not claim the typed path is a lesser substitute.
    await expect(page.getByTestId('audio-status')).toContainText(/same engine/i);
  });

  test('never asks for a password or a service account', async ({ page }) => {
    await page.goto(R);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    const text = (await page.textContent('body')) ?? '';
    expect(text).not.toMatch(/sign in to (netflix|hulu)/i);
  });
});

test.describe('the interview', () => {
  test('opens with an opening question and shows progress', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await expect(page.getByTestId('question-prompt')).toBeVisible();
    await expect(page.getByTestId('progress')).toContainText('of 5');
  });

  test('an answer is turned into beliefs immediately', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await answer(page, 'I loved Severance');
    await expect(page.getByTestId('live-reveal')).toBeVisible();
  });

  test('skipping costs nothing and moves on', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    const first = await page.getByTestId('question-prompt').innerText();
    await page.getByTestId('answer-skip').click();
    await expect(page.getByTestId('question-prompt')).not.toHaveText(first);
    await expect(page.getByTestId('live-reveal')).toHaveCount(0);
  });

  test('an answer we cannot read produces no beliefs rather than a guess', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await answer(page, 'hmm not sure really');
    await expect(page.getByTestId('live-reveal')).toHaveCount(0);
  });

  test('HARD: a contradiction is asked about, not resolved for you', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-full').click();
    await answer(page, 'I love slow burns');
    await answerUntilReview(page, ['I hate slow shows', 'I like crime', 'I avoid horror']);
    await expect(page.getByTestId('choice-group')).toBeVisible();
    await expect(page.getByTestId('question-card')).toContainText(/let me check/i);
    await expect(page.getByTestId('choice-depends')).toBeVisible();
  });

  test('the user can stop early', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-full').click();
    await answer(page, 'I hate reality TV');
    await page.getByTestId('finish-early').click();
    await expect(page.getByTestId('review-list')).toBeVisible();
  });
});

test.describe('mandatory review', () => {
  test('HARD: nothing is saved before the review is confirmed', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await answer(page, 'I hate reality TV');
    await page.getByTestId('finish-early').click();
    await expect(page.getByTestId('review-list')).toBeVisible();
    await expect(page.getByTestId('dna-reveal')).toHaveCount(0);
    await page.getByTestId('apply-voice-dna').click();
    await expect(page.getByTestId('dna-reveal')).toBeVisible();
  });

  test('every conclusion is shown next to the words that produced it', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await answer(page, 'I hate reality TV');
    await page.getByTestId('finish-early').click();
    const item = page.getByTestId('review-item').first();
    await expect(item.getByTestId('review-statement')).toContainText(/you avoid reality tv/i);
    await expect(item.getByTestId('review-quote')).toContainText('I hate reality TV');
  });

  test('HARD: a guessed title blocks the save until it is confirmed', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await answer(page, 'I loved Ozark');
    await page.getByTestId('finish-early').click();
    await expect(page.getByTestId('review-blocked')).toBeVisible();
    await expect(page.getByTestId('review-guess').first()).toBeVisible();
    await expect(page.getByTestId('apply-voice-dna')).toBeDisabled();
    await page.getByTestId('review-item').first().getByTestId('decide-keep').click();
    await expect(page.getByTestId('apply-voice-dna')).toBeEnabled();
  });

  test('a conclusion can be flipped, demoted to a mood, or dropped', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await answer(page, 'I hate reality TV');
    await page.getByTestId('finish-early').click();
    const item = page.getByTestId('review-item').first();
    for (const d of ['flip', 'mood', 'drop', 'keep']) {
      await item.getByTestId(`decide-${d}`).click();
      await expect(item.getByTestId(`decide-${d}`)).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('throwing it away keeps nothing', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await answer(page, 'I hate reality TV');
    await page.getByTestId('finish-early').click();
    await page.getByTestId('cancel-voice-dna').click();
    await expect(page.getByTestId('privacy-note')).toBeVisible();
    await expect(page.getByTestId('review-list')).toHaveCount(0);
  });

  test('an empty interview says so instead of inventing a profile', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await answer(page, 'qwerty asdf');
    await page.getByTestId('finish-early').click();
    await expect(page.getByTestId('review-empty')).toContainText(/nothing has been saved/i);
  });
});

test.describe('the reveal', () => {
  test('describes coverage as knowledge, never as accuracy', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await answer(page, 'I hate reality TV');
    await page.getByTestId('finish-early').click();
    await page.getByTestId('apply-voice-dna').click();
    await expect(page.getByTestId('coverage-summary'))
      .toContainText(/how much I know about you, not how accurate/i);
  });

  test('a mood is labelled as a mood, not a rule', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await answer(page, 'Tonight I want something feel-good');
    await page.getByTestId('finish-early').click();
    await page.getByTestId('apply-voice-dna').click();
    await expect(page.getByTestId('reveal-mood').first()).toContainText(/mood, not a rule/i);
  });

  test('an exception is shown as an exception, and the rule survives', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await answer(page, 'I hate horror, but I loved The Silence of the Lambs');
    await page.getByTestId('finish-early').click();
    // Confirm the guessed title, then apply.
    for (const item of await page.getByTestId('review-item').all()) {
      if (await item.getByTestId('review-guess').count()) {
        await item.getByTestId('decide-keep').click();
      }
    }
    await page.getByTestId('apply-voice-dna').click();
    await expect(page.getByTestId('exceptions-summary')).toContainText(/exception/i);
    await expect(page.getByTestId('dna-reveal')).toContainText(/avoid horror|lean away from horror/i);
  });

  test('it can be undone', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await answer(page, 'I hate reality TV');
    await page.getByTestId('finish-early').click();
    await page.getByTestId('apply-voice-dna').click();
    await page.getByTestId('undo-voice-dna').click();
    await expect(page.getByTestId('review-list')).toBeVisible();
  });
});

test.describe('responsive', () => {
  for (const [label, w, h] of VIEWPORTS) {
    test(`usable at ${label}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(R);
      const overflow = async () => page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(await overflow(), 'intro overflow').toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${label}-intro.png`) });

      await page.getByTestId('start-quick').click();
      await expect(page.getByTestId('question-prompt')).toBeVisible();
      expect(await overflow(), 'question overflow').toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${label}-question.png`) });

      await answer(page, 'I hate horror, but I loved The Silence of the Lambs');
      await page.getByTestId('finish-early').click();
      await expect(page.getByTestId('review-list')).toBeVisible();
      expect(await overflow(), 'review overflow').toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${label}-review.png`), fullPage: true });
    });
  }

  test('the four review decisions sit in even rows with readable labels', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await answer(page, 'I hate reality TV');
    await page.getByTestId('finish-early').click();

    const buttons = page.getByTestId('review-item').first().locator('[data-testid^="decide-"]');
    await expect(buttons).toHaveCount(4);
    const boxes = await buttons.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), w: Math.round(r.width), clipped: el.scrollWidth > el.clientWidth + 1 };
      }));
    const rows = new Set(boxes.map((b) => b.top));
    expect(rows.size, 'two even rows at 320px').toBe(2);
    const widths = boxes.map((b) => b.w);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(2);
    expect(boxes.every((b) => !b.clipped), 'no clipped labels').toBe(true);
  });

  test('one h1 per screen, and the answer box is labelled', async ({ page }) => {
    await page.goto(R);
    await expect(page.locator('h1')).toHaveCount(1);
    await page.getByTestId('start-quick').click();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByTestId('answer-input')).toHaveAttribute('id', 'voice-answer');
  });
});
