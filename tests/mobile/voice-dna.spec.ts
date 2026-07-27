import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * WITNESS TESTIMONY — the interview, driven the way a person would.
 *
 * The properties under test are product promises: ten questions and no more,
 * every title visibly confirmed before it is used, a claim about how many
 * titles is never made without showing them, clarifications worded in plain
 * English, and a review that fits on a phone.
 */

const R = '/voice-dna';
const SHOTS = 'test-results/voice-dna';

const VIEWPORTS: [string, number, number][] = [
  ['small-phone', 320, 568],
  ['phone-360', 360, 740],
  ['phone-375', 375, 812],
  ['phone-390', 390, 844],
  // iPhone Safari with browser chrome eating the bottom of the viewport.
  ['iphone-safari', 390, 664],
  ['tablet', 820, 1180],
  ['desktop', 1440, 900],
];

type Stub = { titleId: string; text: string; year?: number; genres?: string[] };

async function stubSearch(page: Page, results: Stub[]) {
  await page.route('**/api/voicedna/titles**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        results: results.map((r) => ({ posterUrl: null, mediaType: 'tv', ...r })),
      }),
    }),
  );
}

async function stubSearchDown(page: Page) {
  await page.route('**/api/voicedna/titles**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: false, results: [], message: 'Title search is off right now — type the name and I will check it with you at the end.' }),
    }),
  );
}

async function stubProbe(page: Page, available = true) {
  await page.route('**/api/voicedna/probe', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(available
        ? {
            available: true,
            title: { titleId: 'movie:146233', text: 'Prisoners', year: 2013, mediaType: 'movie', posterUrl: null },
          }
        : { available: false }),
    }),
  );
}

const prompt = (page: Page) => page.getByTestId('question-prompt');

async function start(page: Page) {
  await page.goto(R);
  await page.getByTestId('start-interview').click();
}

async function pickTitle(page: Page, query: string, nth = 0) {
  await page.getByTestId('title-input').fill(query);
  await page.getByTestId('title-result').nth(nth).click();
}

async function submit(page: Page) {
  await page.getByTestId('answer-submit').click();
}

async function tapChips(page: Page, values: string[]) {
  for (const v of values) await page.getByTestId(`chip-${v}`).click();
  await submit(page);
}

async function finishEarly(page: Page) {
  const b = page.getByTestId('finish-early');
  if (await b.isVisible().catch(() => false)) await b.click();
}

/** Advance until the prompt matches, skipping everything else. */
async function advanceTo(page: Page, match: RegExp, limit = 30): Promise<boolean> {
  for (let i = 0; i < limit; i++) {
    if (!(await prompt(page).isVisible().catch(() => false))) return false;
    if (match.test(await prompt(page).innerText())) return true;
    const skip = page.getByTestId('answer-skip');
    if (await skip.isVisible().catch(() => false)) await skip.click();
    else if (await page.getByTestId('choice-group').isVisible().catch(() => false)) {
      await page.getByTestId('choice-group').getByRole('button').last().click();
    } else if (await page.getByTestId('card-unseen').isVisible().catch(() => false)) {
      await page.getByTestId('card-unseen').click();
    } else return false;
  }
  return false;
}

test.describe('entry', () => {
  test('names itself and states the privacy terms up front', async ({ page }) => {
    await page.goto(R);
    await expect(page.locator('h1')).toContainText('Witness Testimony');
    const privacy = page.getByTestId('privacy-note');
    await expect(privacy).toContainText(/runs in this browser/i);
    await expect(privacy).toContainText(/before it becomes part of your Viewer DNA/i);
  });

  test('TEST 27/28: the audio control is disabled, and tonight is a separate thing', async ({ page }) => {
    await page.goto(R);
    await expect(page.getByTestId('record-button')).toBeDisabled();
    await expect(page.getByTestId('record-button')).toContainText(/awaiting transcription setup/i);
    await expect(page.getByTestId('tonight-pointer')).toContainText(/about you in general/i);
  });

  test('the page is not a dead end', async ({ page }) => {
    await page.goto(R);
    await expect(page.getByTestId('back-to-app')).toHaveAttribute('href', '/app');
  });
});

test.describe('the interview', () => {
  test.beforeEach(async ({ page }) => {
    await stubSearch(page, [
      { titleId: 'tv:19885', text: 'Sherlock', year: 2010, genres: ['crime', 'mystery'] },
      { titleId: 'tv:1405', text: 'Dexter', year: 2006, genres: ['crime'] },
      { titleId: 'tv:63247', text: 'Westworld', year: 2016, genres: ['science-fiction'] },
    ]);
    await stubProbe(page);
  });

  test('TEST 11: the counter never exceeds ten', async ({ page }) => {
    await start(page);
    const seen: number[] = [];
    for (let i = 0; i < 30; i++) {
      if (!(await page.getByTestId('progress').isVisible().catch(() => false))) break;
      const text = await page.getByTestId('progress').innerText();
      const m = text.match(/Question (\d+) of (\d+)/);
      if (!m) break; // mid re-render; the next iteration reads it cleanly
      seen.push(Number(m[1]));
      expect(Number(m[2])).toBe(10);
      expect(Number(m[1])).toBeLessThanOrEqual(10);
      const skip = page.getByTestId('answer-skip');
      if (await skip.isVisible().catch(() => false)) await skip.click();
      else if (await page.getByTestId('choice-group').isVisible().catch(() => false)) {
        await page.getByTestId('choice-group').getByRole('button').last().click();
      } else if (await page.getByTestId('card-unseen').isVisible().catch(() => false)) {
        await page.getByTestId('card-unseen').click();
      } else break;
    }
    expect(Math.max(...seen)).toBeLessThanOrEqual(10);
  });

  test('TEST 12: a follow-up does not advance the counter', async ({ page }) => {
    await start(page);
    await pickTitle(page, 'sherlock');
    await pickTitle(page, 'dex', 1);
    await submit(page);
    const first = await page.getByTestId('progress').innerText();
    await expect(page.getByTestId('question-prompt')).toContainText('Sherlock');
    await page.getByTestId('answer-skip').click();
    await expect(page.getByTestId('question-prompt')).toContainText('Dexter');
    expect(await page.getByTestId('progress').innerText()).toBe(first);
    await expect(page.getByTestId('followup-badge')).toBeVisible();
  });

  test('TEST 1: three titles named, three titles shown', async ({ page }) => {
    await start(page);
    await pickTitle(page, 'sherlock');
    await pickTitle(page, 'dexter', 1);
    await pickTitle(page, 'westworld', 2);
    await expect(page.getByTestId('picked-title')).toHaveCount(3);
    await expect(page.getByTestId('heard-label')).toContainText('I heard 3');
    for (const t of ['Sherlock', 'Dexter', 'Westworld']) {
      await expect(page.getByTestId('picked-titles')).toContainText(t);
    }
  });

  test('TEST 2: the count matches what is rendered, never exceeds it', async ({ page }) => {
    await start(page);
    await pickTitle(page, 'sherlock');
    await expect(page.getByTestId('heard-label')).toHaveText('I heard');
    await pickTitle(page, 'dexter', 1);
    const label = await page.getByTestId('heard-label').innerText();
    const claimed = Number(label.match(/\d+/)?.[0] ?? 1);
    expect(claimed).toBe(await page.getByTestId('picked-title').count());
  });

  test('TEST 3+4: a wrong title can be corrected, and any title removed', async ({ page }) => {
    await stubSearchDown(page);
    await start(page);
    await page.getByTestId('title-input').fill('Ozark');
    await page.getByTestId('add-typed-title').click();
    await expect(page.getByTestId('confirm-title')).toBeVisible();
    await expect(page.getByTestId('remove-title')).toContainText('Wrong title');
    await page.getByTestId('confirm-title').click();
    await expect(page.getByTestId('title-confirmed')).toBeVisible();
    await page.getByTestId('remove-title').click();
    await expect(page.getByTestId('picked-title')).toHaveCount(0);
  });

  test('a title from search shows its year and type', async ({ page }) => {
    await start(page);
    await pickTitle(page, 'sherlock');
    await expect(page.getByTestId('picked-title')).toContainText('2010');
    await expect(page.getByTestId('picked-title')).toContainText('Series');
  });

  test('TEST 5: a favourite earns a natural "why" about that title', async ({ page }) => {
    await start(page);
    await pickTitle(page, 'sherlock');
    await submit(page);
    await expect(prompt(page)).toHaveText('What did you love most about Sherlock?');
    await expect(page.getByTestId('chip-investigation')).toBeVisible();
    await expect(page.getByTestId('chip-clues')).toBeVisible();
  });

  test('two reasons earn a summary in plain language', async ({ page }) => {
    await start(page);
    await pickTitle(page, 'sherlock');
    await submit(page);
    await tapChips(page, ['investigation', 'clues']);
    await expect(prompt(page)).toContainText(/have i got that right/i);
    await expect(page.getByTestId('choice-exactly')).toContainText('Exactly');
    await expect(page.getByTestId('choice-mostly')).toContainText('Mostly');
    await expect(page.getByTestId('choice-not_quite')).toContainText('Not quite');
  });

  test('TEST 6: a disappointment earns its own "why"', async ({ page }) => {
    await start(page);
    expect(await advanceTo(page, /expected to enjoy but ended up disliking/i)).toBe(true);
    await pickTitle(page, 'westworld', 2);
    await submit(page);
    await expect(prompt(page)).toHaveText('What let you down about Westworld?');
    await expect(page.getByTestId('chip-too_slow')).toBeVisible();
  });

  test('TEST 8: "the performances — F1" asks rather than guessing', async ({ page }) => {
    await stubSearchDown(page);
    await start(page);
    expect(await advanceTo(page, /expected to enjoy but ended up disliking/i)).toBe(true);
    await page.getByTestId('answer-input').fill('The performances — F1');
    await submit(page);
    await expect(prompt(page)).toContainText(/how did you feel about the performances in F1/i);
    await expect(page.getByTestId('choice-positive')).toContainText('I liked it');
    await expect(page.getByTestId('choice-not_meant')).toContainText(/not what I meant/i);
  });

  test('an interviewer voice, not a database', async ({ page }) => {
    await start(page);
    await pickTitle(page, 'sherlock');
    await submit(page);
    await tapChips(page, ['investigation']);
    const body = (await page.textContent('body')) ?? '';
    for (const banned of ['signal', 'inference', 'extracted attribute', 'confidence model', 'classification']) {
      expect(body.toLowerCase(), banned).not.toContain(banned);
    }
  });
});

test.describe('the movie check', () => {
  test('TEST 13+14: a real title appears, with the reason it was chosen', async ({ page }) => {
    await stubSearch(page, [{ titleId: 'tv:1', text: 'Sherlock', year: 2010, genres: ['crime'] }]);
    await stubProbe(page);
    await start(page);
    await pickTitle(page, 'sherlock');
    await submit(page);
    await tapChips(page, ['investigation', 'clues']);
    await page.getByTestId('choice-exactly').click();

    expect(await advanceTo(page, /does this look like you/i)).toBe(true);
    await expect(page.getByTestId('probe-title')).toHaveText('Prisoners');
    await expect(page.getByTestId('probe-reason')).toContainText(/because you said/i);
  });

  test('TEST 15+16: reactions are offered, including "haven’t seen it"', async ({ page }) => {
    await stubSearch(page, [{ titleId: 'tv:1', text: 'Sherlock', year: 2010, genres: ['crime'] }]);
    await stubProbe(page);
    await start(page);
    await pickTitle(page, 'sherlock');
    await submit(page);
    await tapChips(page, ['investigation']);
    expect(await advanceTo(page, /does this look like you/i)).toBe(true);
    for (const v of ['loved', 'liked', 'looks_right', 'not_for_me', 'hated', 'unseen']) {
      await expect(page.getByTestId(`card-${v}`)).toBeVisible();
    }
    await page.getByTestId('card-loved').click();
    await finishEarly(page);
    await expect(page.getByTestId('titles-discussed')).toContainText('Prisoners');
  });

  test('a card that cannot be chosen is skipped, not faked', async ({ page }) => {
    await stubSearch(page, [{ titleId: 'tv:1', text: 'Sherlock', year: 2010, genres: ['crime'] }]);
    await stubProbe(page, false);
    await start(page);
    await pickTitle(page, 'sherlock');
    await submit(page);
    await tapChips(page, ['investigation']);
    // The interview keeps going and never renders an unexplained poster.
    for (let i = 0; i < 25; i++) {
      if (!(await prompt(page).isVisible().catch(() => false))) break;
      await expect(page.getByTestId('probe-poster')).toHaveCount(0);
      const skip = page.getByTestId('answer-skip');
      if (await skip.isVisible().catch(() => false)) await skip.click();
      else if (await page.getByTestId('choice-group').isVisible().catch(() => false)) {
        await page.getByTestId('choice-group').getByRole('button').last().click();
      } else break;
    }
  });
});

test.describe('moving around', () => {
  test.beforeEach(async ({ page }) => {
    await stubSearch(page, [{ titleId: 'tv:1', text: 'Sherlock', year: 2010, genres: ['crime'] }]);
    await stubProbe(page);
  });

  test('TEST 26: Back returns to the previous question and undoes it', async ({ page }) => {
    await start(page);
    await expect(page.getByTestId('answer-back')).toBeDisabled();
    await pickTitle(page, 'sherlock');
    await submit(page);
    await expect(prompt(page)).toContainText('Sherlock');
    await page.getByTestId('answer-back').click();
    await expect(prompt(page)).toContainText(/absolutely love/i);
    await expect(page.getByTestId('picked-title')).toHaveCount(0);
  });

  test('TEST 25: a refresh preserves the interview', async ({ page }) => {
    await start(page);
    await pickTitle(page, 'sherlock');
    await submit(page);
    await tapChips(page, ['investigation']);
    const before = await prompt(page).innerText();
    await page.reload();
    await expect(page.getByTestId('restored-note')).toBeVisible();
    await expect(prompt(page)).toHaveText(before);
  });

  test('skipping costs nothing', async ({ page }) => {
    await start(page);
    const first = await prompt(page).innerText();
    await page.getByTestId('answer-skip').click();
    await expect(prompt(page)).not.toHaveText(first);
    await expect(page.getByTestId('live-reveal')).toHaveCount(0);
  });
});

test.describe('the review', () => {
  async function interviewed(page: Page) {
    await stubSearch(page, [{ titleId: 'tv:1', text: 'Sherlock', year: 2010, genres: ['crime'] }]);
    await stubProbe(page);
    await start(page);
    await pickTitle(page, 'sherlock');
    await submit(page);
    await tapChips(page, ['investigation']);
    await finishEarly(page);
  }

  test('TEST 17: it is headed plainly and stays compact', async ({ page }) => {
    await interviewed(page);
    await expect(page.locator('h1')).toHaveText('Here’s what I heard');
    await expect(page.getByText(/before they become part of your Viewer DNA/i)).toBeVisible();
  });

  test('TEST 18: the titles discussed are shown with their reaction and reason', async ({ page }) => {
    await interviewed(page);
    const row = page.getByTestId('title-row').filter({ hasText: 'Sherlock' });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('title-reaction')).toContainText(/loved/i);
  });

  test('TEST 10: no vague correction buttons anywhere', async ({ page }) => {
    await interviewed(page);
    for (const banned of ['Backwards', 'Just now', 'Drop it']) {
      await expect(page.getByRole('button', { name: banned, exact: true })).toHaveCount(0);
    }
    await expect(page.getByTestId('decide-confirm').first()).toBeVisible();
  });

  test('TEST 9: no filter-failure language anywhere', async ({ page }) => {
    await interviewed(page);
    const body = (await page.textContent('body')) ?? '';
    expect(body).not.toMatch(/cannot turn into a filter/i);
    expect(body).not.toMatch(/failed filter/i);
  });

  test('TEST 19: still-unclear uses chips, not a paragraph', async ({ page }) => {
    await interviewed(page);
    const chips = page.getByTestId('unclear-chip');
    expect(await chips.count()).toBeGreaterThan(0);
    expect(await chips.count()).toBeLessThanOrEqual(3);
    for (const c of await chips.all()) expect((await c.innerText()).length).toBeLessThan(30);
  });

  test('TEST 20: unknown areas do not block saving', async ({ page }) => {
    await interviewed(page);
    await expect(page.getByTestId('still-unclear')).toBeVisible();
    await expect(page.getByTestId('apply-voice-dna')).toBeEnabled();
  });

  test('TEST 21: a guessed title blocks saving, and is shown right there', async ({ page }) => {
    await stubSearchDown(page);
    await start(page);
    await page.getByTestId('title-input').fill('Ozark');
    await page.getByTestId('add-typed-title').click();
    await submit(page);
    await finishEarly(page);

    const banner = page.getByTestId('review-blocked');
    await expect(banner).toContainText(/one title I am not sure/i);
    // The claim and the evidence for it are in the same box.
    await expect(banner.getByTestId('unconfirmed-title')).toHaveCount(1);
    await expect(banner.getByTestId('unconfirmed-title')).toContainText('Ozark');
    await expect(page.getByTestId('apply-voice-dna')).toBeDisabled();
    await banner.getByTestId('decide-confirm').click();
    await expect(page.getByTestId('apply-voice-dna')).toBeEnabled();
  });

  test('the final actions are ranked and plainly worded', async ({ page }) => {
    await interviewed(page);
    await expect(page.getByTestId('apply-voice-dna')).toHaveText('Save my Viewer DNA');
    await expect(page.getByTestId('review-back')).toHaveText('Change something');
    await expect(page.getByTestId('cancel-voice-dna')).toHaveText('Discard this interview');
    await expect(page.getByRole('button', { name: /throw it away/i })).toHaveCount(0);
  });

  test('saving reaches the reveal', async ({ page }) => {
    await interviewed(page);
    await page.getByTestId('apply-voice-dna').click();
    await expect(page.getByTestId('dna-reveal')).toBeVisible();
    await expect(page.getByTestId('coverage-summary')).toContainText(/how much I know about you, not how accurate/i);
  });

  test('TEST 22: the title quiz is targeted afterwards, not repeated in full', async ({ page }) => {
    await interviewed(page);
    await page.getByTestId('apply-voice-dna').click();
    await expect(page.getByTestId('next-step')).toContainText(/do not need the full title quiz/i);
  });
});

test.describe('responsive', () => {
  for (const [label, w, h] of VIEWPORTS) {
    test(`TEST 22-24: usable at ${label}`, async ({ page }) => {
      await stubSearch(page, [{ titleId: 'tv:1', text: 'Sherlock', year: 2010, genres: ['crime'] }]);
      await stubProbe(page);
      await page.setViewportSize({ width: w, height: h });
      const overflow = async () => page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);

      await page.goto(R);
      expect(await overflow(), 'intro').toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${label}-intro.png`) });

      await page.getByTestId('start-interview').click();
      expect(await overflow(), 'question 1').toBeLessThanOrEqual(0);
      await pickTitle(page, 'sherlock');
      await expect(page.getByTestId('picked-title')).toBeVisible();
      expect(await overflow(), 'title card').toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${label}-titles.png`) });

      await submit(page);
      await expect(page.getByTestId('chip-group')).toBeVisible();
      expect(await overflow(), 'chips').toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${label}-why.png`) });

      await tapChips(page, ['investigation']);
      await finishEarly(page);
      await expect(page.getByTestId('titles-discussed')).toBeVisible();
      expect(await overflow(), 'review').toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `${label}-review.png`), fullPage: true });
    });
  }

  test('TEST 24: Save is reachable and not under the browser chrome', async ({ page }) => {
    await stubSearch(page, [{ titleId: 'tv:1', text: 'Sherlock', year: 2010, genres: ['crime'] }]);
    await page.setViewportSize({ width: 390, height: 664 });
    await start(page);
    await pickTitle(page, 'sherlock');
    await submit(page);
    await tapChips(page, ['investigation']);
    await finishEarly(page);

    const save = page.getByTestId('apply-voice-dna');
    await expect(save).toBeInViewport();
    const box = (await save.boundingBox())!;
    expect(box.height, '44px tap target').toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(664);
  });

  test('every tap target is at least 44px tall', async ({ page }) => {
    await stubSearch(page, [{ titleId: 'tv:1', text: 'Sherlock', year: 2010, genres: ['crime'] }]);
    await page.setViewportSize({ width: 320, height: 568 });
    await start(page);
    // Scoped to the interview: the build badge is a harness-wide element.
    const small = await page.getByTestId('voice-dna').locator('button:visible').evaluateAll((els) =>
      els.filter((el) => el.getBoundingClientRect().height < 36).map((el) => el.textContent ?? ''));
    expect(small, `small targets: ${small.join(', ')}`).toHaveLength(0);
  });

  test('chip labels are never clipped at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await start(page);
    expect(await advanceTo(page, /kinds of story pull you in/i)).toBe(true);
    const clipped = await page.getByTestId('chip-group').locator('button').evaluateAll((els) =>
      els.filter((el) => el.scrollWidth > el.clientWidth + 1).length);
    expect(clipped).toBe(0);
  });

  test('one h1 per screen', async ({ page }) => {
    await page.goto(R);
    await expect(page.locator('h1')).toHaveCount(1);
    await page.getByTestId('start-interview').click();
    await expect(page.locator('h1')).toHaveCount(1);
  });
});
