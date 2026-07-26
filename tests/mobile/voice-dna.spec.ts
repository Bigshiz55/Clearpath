import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * VERD1CT VOICE DNA — the taste interview, driven the way a person would.
 *
 * The properties under test are product promises, not implementation details:
 * naming a title earns a follow-up about that title, giving up on a show is not
 * read as hating it, a deal-breaker is graded before it becomes a ban, nothing
 * reaches Viewer DNA without review, and the audio control never pretends.
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

/** Search needs TMDB, which the harness has no key for. Serve it a fixture. */
async function stubSearch(page: Page, results: Array<{ titleId: string; text: string; year?: number; genres?: string[] }>) {
  await page.route('**/api/voicedna/titles**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: true, results: results.map((r) => ({ posterUrl: null, mediaType: 'tv', ...r })) }),
    }),
  );
}

async function stubSearchDown(page: Page) {
  await page.route('**/api/voicedna/titles**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: false, results: [], message: 'Title search is unavailable right now — type the name and I will confirm it with you at the end.' }),
    }),
  );
}

const prompt = (page: Page) => page.getByTestId('question-prompt');

async function pickTitle(page: Page, query: string) {
  await page.getByTestId('title-input').fill(query);
  await page.getByTestId('title-result').first().click();
  await page.getByTestId('answer-submit').click();
}

async function typeTitle(page: Page, text: string) {
  await page.getByTestId('title-input').fill(text);
  await page.getByTestId('add-typed-title').click();
  await page.getByTestId('answer-submit').click();
}

async function tapChips(page: Page, values: string[]) {
  for (const v of values) await page.getByTestId(`chip-${v}`).click();
  await page.getByTestId('answer-submit').click();
}

/** Jump to review — unless the interview already ended and took us there. */
async function finishEarly(page: Page) {
  const button = page.getByTestId('finish-early');
  if (await button.isVisible().catch(() => false)) await button.click();
}

/** Advance until a question whose id/prompt matches, skipping the rest. */
async function advanceTo(page: Page, match: RegExp, limit = 25): Promise<boolean> {
  for (let i = 0; i < limit; i++) {
    if (!(await prompt(page).isVisible().catch(() => false))) return false;
    if (match.test(await prompt(page).innerText())) return true;
    const skip = page.getByTestId('answer-skip');
    if (await skip.isVisible().catch(() => false)) await skip.click();
    else await page.getByTestId('choice-group').getByRole('button').last().click();
  }
  return false;
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

  test('shows the stages it will cover, so it is visibly not one text box', async ({ page }) => {
    await page.goto(R);
    const preview = page.getByTestId('stage-preview');
    for (const label of ['Your favourites', 'What does not work', 'Your deal-breakers', 'Exceptions', 'Review']) {
      await expect(preview).toContainText(label);
    }
  });

  test('TEST 28: tonight is offered as a separate thing, not this', async ({ page }) => {
    await page.goto(R);
    await expect(page.getByTestId('tonight-pointer')).toContainText(/right now/i);
    await expect(page.getByTestId('tonight-pointer')).toContainText(/about you in general/i);
  });

  test('TEST 27: the audio control is disabled and says why', async ({ page }) => {
    await page.goto(R);
    const btn = page.getByTestId('record-button');
    await expect(btn).toBeDisabled();
    await expect(btn).toContainText(/awaiting transcription setup/i);
    await expect(page.getByTestId('audio-status')).toContainText(/no transcription service is configured/i);
    await expect(page.getByTestId('audio-status')).toContainText(/same engine/i);
  });

  test('never asks for a password or a service account', async ({ page }) => {
    await page.goto(R);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    expect((await page.textContent('body')) ?? '').not.toMatch(/sign in to (netflix|hulu)/i);
  });
});

test.describe('reachable from the app', () => {
  // The in-app entry points live on authenticated screens, which redirect to
  // /login in this harness — they are pinned in reachable.test.ts instead.
  test('the page is not a dead end', async ({ page }) => {
    await page.goto(R);
    const back = page.getByTestId('back-to-app');
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('href', '/app');
  });

  test('the back link is not hidden under the build badge', async ({ page }) => {
    // These pages render without the app header, so nothing else clears the
    // fixed badge band. It sat on top of the link until the page added its own
    // top padding.
    await page.goto(R);
    const link = await page.getByTestId('back-to-app').boundingBox();
    const badge = await page.locator('[aria-label*="Build"], button:has-text("Development")').first()
      .boundingBox().catch(() => null);
    expect(link).not.toBeNull();
    if (badge) expect(link!.y, 'back link starts below the badge').toBeGreaterThanOrEqual(badge.y + badge.height);
  });
});

test.describe('stage 1 — favourites', () => {
  test.beforeEach(async ({ page }) => {
    await stubSearch(page, [
      { titleId: 'tv:19885', text: 'Sherlock', year: 2010, genres: ['crime', 'mystery'] },
    ]);
  });

  test('TEST 1: opens by asking for favourite titles, with a real search', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await expect(prompt(page)).toContainText(/three films or shows you absolutely loved/i);
    await expect(page.getByTestId('title-picker')).toBeVisible();
    await expect(page.getByTestId('stage-current')).toContainText('Your favourites');
  });

  test('a searched title is confirmed on the spot', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await page.getByTestId('title-input').fill('sherlock');
    await expect(page.getByTestId('title-result').first()).toContainText('Sherlock');
    await page.getByTestId('title-result').first().click();
    await expect(page.getByTestId('picked-title')).toContainText('Sherlock');
    await expect(page.getByTestId('picked-title')).not.toContainText(/unconfirmed/i);
  });

  test('TEST 2+3: naming a title earns a "why" follow-up about that title', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await pickTitle(page, 'sherlock');
    await expect(page.getByTestId('followup-badge')).toBeVisible();
    await expect(prompt(page)).toContainText(/what did you love most about sherlock/i);
  });

  test('the follow-up chips fit the title, not a generic list', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await pickTitle(page, 'sherlock');
    // Crime vocabulary — deduction and the cases, not spectacle.
    await expect(page.getByTestId('chip-investigation')).toBeVisible();
    await expect(page.getByTestId('chip-clues')).toBeVisible();
  });

  test('the reasons become visible beliefs straight away', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await pickTitle(page, 'sherlock');
    await tapChips(page, ['investigation', 'clues']);
    await expect(page.getByTestId('live-reveal')).toContainText(/investigation/i);
  });

  test('three favourites each get their own follow-up', async ({ page }) => {
    await stubSearch(page, [
      { titleId: 'tv:1', text: 'Sherlock', genres: ['crime'] },
      { titleId: 'tv:2', text: 'Dexter', genres: ['crime'] },
    ]);
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await page.getByTestId('title-input').fill('she');
    await page.getByTestId('title-result').nth(0).click();
    await page.getByTestId('title-input').fill('dex');
    await page.getByTestId('title-result').nth(1).click();
    await expect(page.getByTestId('picked-title')).toHaveCount(2);
    await page.getByTestId('answer-submit').click();

    await expect(prompt(page)).toContainText('Sherlock');
    await page.getByTestId('answer-skip').click();
    await expect(prompt(page)).toContainText('Dexter');
  });

  test('a hand-typed title is kept but flagged unconfirmed', async ({ page }) => {
    await stubSearchDown(page);
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await page.getByTestId('title-input').fill('Some Obscure Show');
    await expect(page.getByTestId('search-unavailable')).toBeVisible();
    await page.getByTestId('add-typed-title').click();
    await expect(page.getByTestId('picked-title')).toContainText(/unconfirmed/i);
  });
});

test.describe('stage 2+3 — dislikes and abandoned', () => {
  test('TEST 4+5: a disliked title is asked why, with dislike reasons', async ({ page }) => {
    await stubSearch(page, [{ titleId: 'tv:9', text: 'Succession', genres: ['drama'] }]);
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await page.getByTestId('answer-skip').click();
    await expect(prompt(page)).toContainText(/expected to like but didn/i);
    await pickTitle(page, 'succession');
    await expect(prompt(page)).toContainText(/what did not work about succession/i);
    await expect(page.getByTestId('chip-too_slow')).toBeVisible();
    await expect(page.getByTestId('chip-characters')).toBeVisible();
  });

  test('TEST 6+7: giving up asks how far you got, and mood is not a verdict', async ({ page }) => {
    await stubSearch(page, [{ titleId: 'tv:5', text: 'Westworld', genres: ['science-fiction'] }]);
    await page.goto(R);
    await page.getByTestId('start-full').click();
    expect(await advanceTo(page, /stopped watching before the end/i)).toBe(true);
    await pickTitle(page, 'westworld');

    await expect(prompt(page)).toContainText(/how far into westworld/i);
    await page.getByTestId('choice-most').click();

    await expect(prompt(page)).toContainText(/what made you give up on westworld/i);
    await tapChips(page, ['wrong_mood']);

    await page.getByTestId('finish-early').click();
    const row = page.getByTestId('review-item').filter({ hasText: 'Westworld' });
    await expect(row).toContainText(/timing, not taste/i);
  });
});

test.describe('stage 4+5 — genres and deal-breakers', () => {
  test('TEST 8: picking a genre opens a question about what matters inside it', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    expect(await advanceTo(page, /kinds of story usually pull you in/i)).toBe(true);
    await tapChips(page, ['investigation']);
    await expect(prompt(page)).toContainText(/what matters most/i);
    await expect(page.getByTestId('chip-investigation')).toBeVisible();
  });

  test('TEST 9: deal-breakers are graded, and only one grade is a ban', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    expect(await advanceTo(page, /can ruin a film or show for you/i)).toBe(true);
    await tapChips(page, ['gore', 'romance_genre']);

    await expect(prompt(page)).toContainText(/how bad is it/i);
    await expect(page.getByTestId('choice-hard')).toContainText(/never show me this/i);
    await expect(page.getByTestId('question-helper')).toContainText(/only the first option means never recommend/i);
    await page.getByTestId('choice-hard').click();

    await expect(prompt(page)).toContainText(/how bad is it/i);
    await page.getByTestId('choice-mild').click();

    await finishEarly(page);
    await expect(page.getByTestId('review-section-name').filter({ hasText: 'Never recommend' })).toBeVisible();
  });

  test('a picked deal-breaker is not a ban until the user says so', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    expect(await advanceTo(page, /can ruin a film or show for you/i)).toBe(true);
    await tapChips(page, ['violence']);
    await finishEarly(page);
    await expect(page.getByTestId('review-section-name').filter({ hasText: 'Never recommend' })).toHaveCount(0);
  });
});

test.describe('adaptivity', () => {
  test('TEST 11: a contradiction interrupts and is put to the user', async ({ page }) => {
    await stubSearchDown(page);
    await page.goto(R);
    await page.getByTestId('start-full').click();
    await page.getByTestId('answer-input').fill('I love slow burns');
    await page.getByTestId('answer-submit').click();
    expect(await advanceTo(page, /expected to like but didn/i)).toBe(true);
    await page.getByTestId('answer-input').fill('I hate slow shows');
    await page.getByTestId('answer-submit').click();

    await expect(page.getByTestId('followup-badge')).toBeVisible();
    await expect(page.getByTestId('choice-depends')).toBeVisible();
  });

  test('TEST 12: a stated exception survives as an exception', async ({ page }) => {
    await stubSearchDown(page);
    await page.goto(R);
    await page.getByTestId('start-full').click();
    expect(await advanceTo(page, /claim to hate but keep making exceptions/i)).toBe(true);
    await page.getByTestId('answer-input').fill('I hate horror but I loved The Silence of the Lambs');
    await page.getByTestId('answer-submit').click();
    await page.getByTestId('finish-early').click();
    await expect(page.getByTestId('review-list-anchor').or(page.getByTestId('review-section')).first()).toBeVisible();
    await expect(page.getByText(/avoid horror/i).first()).toBeVisible();
  });

  test('TEST 19+20: quick is shorter than full', async ({ page }) => {
    const runLength = async (mode: 'quick' | 'full') => {
      await page.goto(R);
      // A draft from the previous run would restore us past the intro.
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await page.getByTestId(`start-${mode}`).click();
      let n = 0;
      for (; n < 40; n++) {
        if (!(await prompt(page).isVisible().catch(() => false))) break;
        const skip = page.getByTestId('answer-skip');
        if (await skip.isVisible().catch(() => false)) await skip.click();
        else await page.getByTestId('choice-group').getByRole('button').last().click();
      }
      return n;
    };
    const quick = await runLength('quick');
    const full = await runLength('full');
    expect(quick).toBeGreaterThanOrEqual(5);
    expect(full).toBeGreaterThan(quick);
  });
});

test.describe('moving around', () => {
  test('TEST 14: skipping costs nothing', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    const first = await prompt(page).innerText();
    await page.getByTestId('answer-skip').click();
    await expect(prompt(page)).not.toHaveText(first);
    await expect(page.getByTestId('live-reveal')).toHaveCount(0);
  });

  test('TEST 13: Back returns to the previous question and un-does it', async ({ page }) => {
    await stubSearch(page, [{ titleId: 'tv:1', text: 'Sherlock', genres: ['crime'] }]);
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await expect(page.getByTestId('answer-back')).toBeDisabled();
    await pickTitle(page, 'sherlock');
    await expect(prompt(page)).toContainText('Sherlock');

    await page.getByTestId('answer-back').click();
    await expect(prompt(page)).toContainText(/three films or shows/i);
    await expect(page.getByTestId('picked-title')).toHaveCount(0);
    await expect(page.getByTestId('live-reveal')).toHaveCount(0);
  });

  test('TEST 15+16: a refresh does not erase the interview', async ({ page }) => {
    await stubSearch(page, [{ titleId: 'tv:1', text: 'Sherlock', genres: ['crime'] }]);
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await pickTitle(page, 'sherlock');
    await tapChips(page, ['investigation']);
    const before = await prompt(page).innerText();

    await page.reload();
    await expect(page.getByTestId('restored-note')).toBeVisible();
    await expect(prompt(page)).toHaveText(before);
    await expect(page.getByTestId('live-reveal')).toBeVisible();
  });

  test('starting over clears the restored draft', async ({ page }) => {
    await stubSearchDown(page);
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await typeTitle(page, 'Ozark');
    await page.reload();
    await expect(page.getByTestId('restored-note')).toBeVisible();
    await finishEarly(page);
    await page.getByTestId('cancel-voice-dna').click();
    await page.reload();
    await expect(page.getByTestId('privacy-note')).toBeVisible();
  });
});

test.describe('review', () => {
  async function shortInterview(page: Page) {
    await stubSearch(page, [{ titleId: 'tv:1', text: 'Sherlock', genres: ['crime'] }]);
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await pickTitle(page, 'sherlock');
    await tapChips(page, ['investigation']);
    await page.getByTestId('finish-early').click();
  }

  test('TEST 17: grouped into named sections, each quoting the user', async ({ page }) => {
    await shortInterview(page);
    await expect(page.getByTestId('review-section').first()).toBeVisible();
    await expect(page.getByTestId('review-section-name').filter({ hasText: 'Titles discussed' })).toBeVisible();
    for (const q of await page.getByTestId('review-quote').all()) {
      expect((await q.innerText()).length).toBeGreaterThan(2);
    }
  });

  test('HARD: nothing is saved before the review is confirmed', async ({ page }) => {
    await shortInterview(page);
    await expect(page.getByTestId('dna-reveal')).toHaveCount(0);
    await page.getByTestId('apply-voice-dna').click();
    await expect(page.getByTestId('dna-reveal')).toBeVisible();
  });

  test('HARD: a hand-typed title blocks the save until confirmed', async ({ page }) => {
    await stubSearchDown(page);
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await typeTitle(page, 'Ozark');
    await page.getByTestId('finish-early').click();
    await expect(page.getByTestId('review-blocked')).toBeVisible();
    await expect(page.getByTestId('apply-voice-dna')).toBeDisabled();
    await page.getByTestId('review-item').filter({ hasText: 'Ozark' }).getByTestId('decide-keep').click();
    await expect(page.getByTestId('apply-voice-dna')).toBeEnabled();
  });

  test('a conclusion can be flipped, demoted, dropped or escalated', async ({ page }) => {
    await shortInterview(page);
    const item = page.getByTestId('review-item').first();
    for (const d of ['flip', 'mood', 'drop', 'keep']) {
      await item.getByTestId(`decide-${d}`).click();
      await expect(item.getByTestId(`decide-${d}`)).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('it names what it still does not know', async ({ page }) => {
    await shortInterview(page);
    await expect(page.getByTestId('still-unclear')).toContainText(/nothing on these yet/i);
  });

  test('throwing it away keeps nothing', async ({ page }) => {
    await shortInterview(page);
    await page.getByTestId('cancel-voice-dna').click();
    await expect(page.getByTestId('privacy-note')).toBeVisible();
  });
});

test.describe('the reveal', () => {
  async function applied(page: Page) {
    await stubSearch(page, [{ titleId: 'tv:1', text: 'Sherlock', genres: ['crime'] }]);
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    await pickTitle(page, 'sherlock');
    await tapChips(page, ['investigation']);
    await page.getByTestId('finish-early').click();
    await page.getByTestId('apply-voice-dna').click();
  }

  test('describes coverage as knowledge, never accuracy', async ({ page }) => {
    await applied(page);
    await expect(page.getByTestId('coverage-summary')).toContainText(/how much I know about you, not how accurate/i);
  });

  test('TEST 22: it does not send you back through the whole title quiz', async ({ page }) => {
    await applied(page);
    await expect(page.getByTestId('next-step')).toContainText(/do not need the full twenty-title run/i);
    await expect(page.getByTestId('targeted-quiz')).toBeVisible();
  });

  test('TEST 18: it can be undone', async ({ page }) => {
    await applied(page);
    await page.getByTestId('undo-voice-dna').click();
    await expect(page.getByTestId('review-section').first()).toBeVisible();
  });
});

test.describe('responsive', () => {
  for (const [label, w, h] of VIEWPORTS) {
    test(`TEST 23-25: usable at ${label}`, async ({ page }) => {
      await stubSearch(page, [{ titleId: 'tv:1', text: 'Sherlock', genres: ['crime'] }]);
      await page.setViewportSize({ width: w, height: h });
      await page.goto(R);
      const overflow = async () => page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);

      expect(await overflow(), 'intro overflow').toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${label}-intro.png`) });

      await page.getByTestId('start-quick').click();
      await expect(page.getByTestId('title-picker')).toBeVisible();
      expect(await overflow(), 'title question overflow').toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${label}-titles.png`) });

      await pickTitle(page, 'sherlock');
      await expect(page.getByTestId('chip-group')).toBeVisible();
      expect(await overflow(), 'chip question overflow').toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${label}-why.png`) });

      await tapChips(page, ['investigation']);
      await page.getByTestId('finish-early').click();
      await expect(page.getByTestId('review-section').first()).toBeVisible();
      expect(await overflow(), 'review overflow').toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${label}-review.png`), fullPage: true });
    });
  }

  test('the chip row never clips a label at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    expect(await advanceTo(page, /kinds of story usually pull you in/i)).toBe(true);
    const clipped = await page.getByTestId('chip-group').locator('button').evaluateAll((els) =>
      els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
    expect(clipped).toBe(0);
  });

  test('the stage rail scrolls rather than eating the screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(R);
    await page.getByTestId('start-quick').click();
    const height = await page.getByTestId('stage-rail').evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeLessThan(48);
  });

  test('one h1 per screen, and every input is labelled', async ({ page }) => {
    await page.goto(R);
    await expect(page.locator('h1')).toHaveCount(1);
    await page.getByTestId('start-quick').click();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByTestId('title-input')).toHaveAttribute('id', 'title-search');
  });
});
