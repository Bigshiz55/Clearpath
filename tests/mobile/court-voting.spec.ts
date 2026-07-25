import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * COURT VOTING FLOOR E2E — the signature moment, driven through the real UI
 * running the real pool and voting engines.
 */

const SHOTS = 'test-results/court';
const URL = '/dev/court-vote';

test.describe('the voting floor', () => {
  test('opens with six candidates and two veto tokens', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId('voting-floor')).toBeVisible();
    await expect(page.getByTestId('tray-item')).toHaveCount(6);
    await expect(page.getByTestId('veto-tokens')).toContainText('2 of 2 vetoes left');
    // Six in play, six held back — never twelve cards at once.
    await expect(page.getByTestId('voting-floor')).toContainText('6 held in reserve');
    await page.screenshot({ path: path.join(SHOTS, 'floor-desktop.png'), fullPage: false });
  });

  test('ballots stay hidden until you vote, then reveal', async ({ page }) => {
    await page.goto(URL);
    // Two others already voted on the first title.
    await expect(page.getByTestId('ballot-state')).toContainText('2 of 3 have voted');
    await expect(page.getByTestId('ballot-state')).toContainText('hidden until you cast yours');
    await expect(page.getByTestId('ballot-state')).not.toContainText('Room so far');

    await page.getByTestId('vote-maybe').click();
    await expect(page.getByTestId('ballot-state')).toContainText('Room so far');
    await expect(page.getByTestId('ballot-state')).toContainText('3 of 3 voted');
    await page.screenshot({ path: path.join(SHOTS, 'ballot-revealed.png'), fullPage: false });
  });

  test('voting twice on the same title is impossible', async ({ page }) => {
    await page.goto(URL);
    await page.getByTestId('vote-watch_it').click();
    await expect(page.getByTestId('vote-watch_it')).toBeDisabled();
    await expect(page.getByTestId('vote-veto')).toBeDisabled();
  });

  test('veto asks for confirmation, then replaces instantly from the reserve', async ({ page }) => {
    await page.goto(URL);
    const firstTitle = await page.getByTestId('candidate-title').innerText();

    await page.getByTestId('vote-veto').click();
    await expect(page.getByTestId('veto-confirm')).toBeVisible();
    await expect(page.getByTestId('veto-tokens')).toContainText('2 of 2'); // not spent yet

    await page.getByTestId('vote-veto').click(); // confirm
    await expect(page.getByTestId('veto-tokens')).toContainText('1 of 2 vetoes left');
    // Replaced in place: still six in play, reserve down to five.
    await expect(page.getByTestId('tray-item')).toHaveCount(6);
    await expect(page.getByTestId('voting-floor')).toContainText('5 held in reserve');
    await expect(page.getByTestId('candidate-title')).not.toHaveText(firstTitle);
    await page.screenshot({ path: path.join(SHOTS, 'after-veto.png'), fullPage: false });
  });

  test('two vetoes exhaust the tokens and a third is refused with a reason', async ({ page }) => {
    await page.goto(URL);
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('vote-veto').click();
      await page.getByTestId('vote-veto').click(); // confirm
    }
    await expect(page.getByTestId('veto-tokens')).toContainText('0 of 2');

    await page.getByTestId('vote-veto').click();
    await page.getByTestId('vote-veto').click();
    await expect(page.getByTestId('vote-error')).toContainText(/used both of your vetoes/i);
    // Maybe still works with no tokens.
    await page.getByTestId('vote-maybe').click();
    await expect(page.getByTestId('ballot-state')).toContainText('Room so far');
  });

  test('"seen it" replaces the title without spending a token', async ({ page }) => {
    await page.goto(URL);
    await page.getByTestId('vote-seen_it').click();
    await expect(page.getByTestId('veto-tokens')).toContainText('2 of 2 vetoes left');
    await expect(page.getByTestId('tray-item')).toHaveCount(6);
    await expect(page.getByTestId('voting-floor')).toContainText('5 held in reserve');
  });

  test('the tray switches the primary candidate', async ({ page }) => {
    await page.goto(URL);
    const first = await page.getByTestId('candidate-title').innerText();
    await page.getByTestId('tray-item').nth(2).click();
    await expect(page.getByTestId('candidate-title')).not.toHaveText(first);
  });

  test('missing availability is disclosed, never invented', async ({ page }) => {
    await page.goto(URL);
    // Fixture index 3 has no services; find it via the tray.
    for (let i = 0; i < 6; i++) {
      await page.getByTestId('tray-item').nth(i).click();
      const text = await page.getByTestId('candidate-availability').innerText();
      if (text.includes('unconfirmed')) {
        expect(text).toMatch(/unconfirmed/i);
        return;
      }
    }
    throw new Error('expected one fixture with unconfirmed availability');
  });

  test('exhausting everything ends in an honest empty state, not filler', async ({ page }) => {
    await page.goto(URL);
    // 6 active + 6 reserve = 12; "seen it" never costs a token, so it can clear the room.
    for (let i = 0; i < 12; i++) {
      const seen = page.getByTestId('vote-seen_it');
      if (!(await seen.isVisible().catch(() => false))) break;
      await seen.click();
    }
    await expect(page.getByTestId('floor-empty')).toBeVisible();
    await expect(page.getByTestId('floor-empty')).toContainText('No candidates left');
    await page.screenshot({ path: path.join(SHOTS, 'exhausted.png'), fullPage: false });
  });
});

test.describe('responsive', () => {
  for (const [label, w] of [['small-phone', 320], ['phone', 390], ['tablet', 820], ['desktop', 1440]] as const) {
    test(`no overflow and usable targets at ${label} (${w}px)`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 860 });
      await page.goto(URL);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `overflow at ${w}px`).toBeLessThanOrEqual(0);
      // Voting buttons must stay large enough to tap.
      for (const id of ['vote-watch_it', 'vote-maybe', 'vote-veto', 'vote-seen_it']) {
        const box = await page.getByTestId(id).boundingBox();
        expect(box!.height, `${id} at ${w}px`).toBeGreaterThanOrEqual(44);
      }
      if (w === 390) await page.screenshot({ path: path.join(SHOTS, 'floor-mobile.png'), fullPage: true });
      if (w === 820) await page.screenshot({ path: path.join(SHOTS, 'floor-tablet.png'), fullPage: false });
    });
  }
});
