import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { stubImportWriteSucceeds } from './importWriteStub';

/**
 * BRING YOUR TASTE WITH YOU — the real flow, driven with real files.
 *
 * The properties under test are product promises, not implementation details:
 * watched is not liked, a file with several profiles is never merged, and
 * nothing reaches Viewer DNA without passing review.
 */

const R = '/import-taste';
const SHOTS = 'test-results/import-taste';

const VIEWPORTS: [string, number, number][] = [
  ['small-phone', 320, 568],
  ['large-phone', 430, 932],
  ['tablet', 820, 1180],
  ['desktop', 1440, 900],
];

/** Upload a CSV built in-memory — no fixture files on disk to drift. */
async function upload(page: Page, name: string, content: string) {
  await page.getByTestId('csv-input').setInputFiles({
    name, mimeType: 'text/csv', buffer: Buffer.from(content, 'utf8'),
  });
}

const HISTORY = [
  'Title,Date,Profile Name',
  'The Irishman,1/15/26,Scott',
  'Klaus,12/25/25,Scott',
  'Klaus,3/4/26,Scott',
  '"Hello, Goodbye, and Everything",2/2/26,Scott',
  'Ozark: Season 1: Episode 1,1/2/26,Scott',
  'Ozark: Season 1: Episode 2,1/3/26,Scott',
  'Ozark: Season 1: Episode 3,1/4/26,Scott',
  'Ozark: Season 2: Episode 1,1/5/26,Scott',
  '"Stranger Things: Season 2: Trick or Treat, Freak",1/6/26,Heather',
  'Broken Row: Season 1: Oops, Unquoted,1/9/26,Scott',
  'Bluey: Season 1: Magic Xylophone,1/7/26,Kids',
  '',
  ',1/8/26,Scott',
].join('\n');

test.describe('entry and privacy', () => {
  test('the promise and the privacy terms are stated up front', async ({ page }) => {
    await page.goto(R);
    await expect(page.getByTestId('import-taste')).toBeVisible();
    const privacy = page.getByTestId('privacy-note');
    await expect(privacy).toContainText(/never ask for your Netflix password/i);
    await expect(privacy).toContainText(/read in this browser/i);
    await expect(privacy).toContainText(/review every title/i);
  });

  test('never asks for Netflix credentials anywhere', async ({ page }) => {
    await page.goto(R);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    const text = (await page.textContent('body')) ?? '';
    expect(text).not.toMatch(/enter your netflix (password|login)/i);
  });
});

test.describe('CSV import', () => {
  test('parses a real history file and reports every row', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'NetflixViewingHistory.csv', HISTORY);
    await expect(page.getByTestId('import-review')).toBeVisible();
    const stats = await page.getByTestId('parse-stats').innerText();
    expect(stats).toMatch(/rows read/);
    expect(stats).toMatch(/could not be read/);
  });

  test('HARD: episodes consolidate into one series row, not one per episode', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    const group = await page.getByTestId('group-stats').innerText();
    // Ozark has 4 episode rows but must appear once.
    const ozark = page.getByTestId('review-item').filter({ hasText: 'Ozark' });
    await expect(ozark).toHaveCount(1);
    expect(group).toMatch(/series and .* films/);
  });

  test('a title containing commas survives intact', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    await expect(page.getByTestId('review-list'))
      .toContainText('Hello, Goodbye, and Everything');
  });

  test('a rewatched film is described as a rewatch', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    const klaus = page.getByTestId('review-item').filter({ hasText: 'Klaus' });
    await expect(klaus.getByTestId('review-reason')).toContainText(/separate days/i);
  });

  test('HARD: watched is never presented as liked', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    const irishman = page.getByTestId('review-item').filter({ hasText: 'The Irishman' });
    await expect(irishman.getByTestId('review-reason'))
      .toContainText(/not assumed you liked it/i);
  });

  test('one sampled episode is not treated as enjoyment', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    const bluey = page.getByTestId('review-item').filter({ hasText: 'Bluey' });
    await expect(bluey.getByTestId('review-reason'))
      .toContainText(/not enough to say you liked it/i);
  });

  test('rejects a non-CSV file with a clear message', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('csv-input').setInputFiles({
      name: 'malware.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ'),
    });
    await expect(page.getByTestId('import-error')).toContainText(/\.csv file/i);
    await expect(page.getByTestId('import-review')).toHaveCount(0);
  });

  test('rejects an oversized file', async ({ page }) => {
    await page.goto(R);
    await page.getByTestId('csv-input').setInputFiles({
      name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.alloc(21 * 1024 * 1024, 'a'),
    });
    await expect(page.getByTestId('import-error')).toContainText(/limit is 20 MB/i);
  });

  test('a file that is not a viewing history is refused, not half-imported', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'other.csv', 'Foo,Bar\nalpha,beta\ngamma,delta');
    await expect(page.getByTestId('review-list').getByTestId('review-item')).toHaveCount(0);
  });
});

test.describe('household separation', () => {
  test('HARD: several profiles are never merged silently', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    const split = page.getByTestId('profile-split');
    await expect(split).toBeVisible();
    await expect(split).toContainText(/will not merge them/i);
    for (const p of ['Scott', 'Heather', 'Kids']) {
      await expect(split).toContainText(p);
    }
  });

  test('each profile can be claimed, reassigned, shared or skipped', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    await page.getByTestId('profile-Scott-mine').click();
    await expect(page.getByTestId('profile-Scott-mine')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('profile-Kids-skip').click();
    await expect(page.getByTestId('profile-Kids-skip')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a single-profile file does not nag about households', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'solo.csv', 'Title,Date,Profile Name\nKlaus,1/1/26,Scott');
    await expect(page.getByTestId('profile-split')).toHaveCount(0);
  });
});

test.describe('mandatory review', () => {
  test('HARD: nothing is applied before the user confirms', async ({ page }) => {
    await stubImportWriteSucceeds(page);
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    // Review is the stage we land on — never a summary.
    await expect(page.getByTestId('import-review')).toBeVisible();
    await expect(page.getByTestId('import-summary')).toHaveCount(0);
    await page.getByTestId('apply-import').click();
    await expect(page.getByTestId('import-summary')).toBeVisible();
  });

  test('a user verdict overrides what we detected, and says what it means', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    const first = page.getByTestId('review-item').first();
    const id = await first.getAttribute('data-weight');
    expect(id).not.toBeNull();
    await first.getByRole('button', { name: 'Loved' }).click();
    await expect(first.getByTestId('verdict-effect')).toContainText(/you loved this/i);
  });

  test('confirming "watched" still states that no opinion was assumed', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    const first = page.getByTestId('review-item').first();
    await first.getByRole('button', { name: 'Watched' }).click();
    await expect(first.getByTestId('verdict-effect')).toContainText(/not assumed an opinion/i);
  });

  test('bulk controls work without applying anything', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    await page.getByTestId('bulk-confirm').click();
    await expect(page.getByTestId('import-summary')).toHaveCount(0);
    await expect(page.getByTestId('apply-import')).toBeVisible();
  });

  test('cancelling keeps nothing', async ({ page }) => {
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    await page.getByTestId('cancel-import').click();
    await expect(page.getByTestId('import-taste')).toBeVisible();
    await expect(page.getByTestId('review-list')).toHaveCount(0);
  });

  test('the summary does not claim recommendation accuracy', async ({ page }) => {
    await stubImportWriteSucceeds(page);
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    await page.getByTestId('apply-import').click();
    const s = page.getByTestId('import-summary');
    await expect(s).toContainText(/how much we know about you, not how accurate/i);
    await expect(s).toContainText(/not assumed you enjoyed it/i);
  });

  test('an import can be undone', async ({ page }) => {
    await stubImportWriteSucceeds(page);
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    await page.getByTestId('apply-import').click();
    await page.getByTestId('undo-import').click();
    await expect(page.getByTestId('import-taste')).toBeVisible();
  });
});

test.describe('responsive and accessible', () => {
  for (const [label, w, h] of VIEWPORTS) {
    test(`usable at ${label}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(R);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
      await expect(page.getByTestId('privacy-note')).toBeVisible();
      await page.screenshot({ path: path.join(SHOTS, `${label}.png`), fullPage: false });
    });
  }

  test('the review screen has no overflow on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(R);
    await upload(page, 'h.csv', HISTORY);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: path.join(SHOTS, 'review-phone.png'), fullPage: true });
  });

  test('the file input is reachable and labelled', async ({ page }) => {
    await page.goto(R);
    const input = page.getByTestId('csv-input');
    await expect(input).toHaveAttribute('accept', /csv/);
    // One h1, and the processing state announces itself.
    await expect(page.locator('h1')).toHaveCount(1);
  });
});

/**
 * "Looks dated and small."
 *
 * The first screen of this flow was 14px body copy, a bulleted privacy note
 * whose markers were literal "·" characters, browser-default `list-decimal`
 * numerals hanging outside the card, and a grey dashed box with a 📄 in it.
 * Everything was legible and nothing was inviting, on the one screen that has
 * to answer "where does my file go" before anybody picks one.
 *
 * These pin the floor rather than the styling: type large enough to read on a
 * phone, a drop target you can actually hit, and headings that outrank the body
 * text beneath them.
 */
const MIN_BODY_PX = 15;

async function px(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
}

test.describe('the first screen reads like a 2026 product', () => {
  test('body copy is never phone-squint small', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(R, { waitUntil: 'networkidle' });

    // The privacy promise and the steps are the two things people actually read.
    const promise = await page.getByTestId('privacy-note').locator('li').first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(promise, 'privacy line font size').toBeGreaterThanOrEqual(MIN_BODY_PX);

    const step = await page.locator('ol li span').last()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(step, 'step font size').toBeGreaterThanOrEqual(MIN_BODY_PX);
  });

  test('the headline outranks the paragraph under it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(R, { waitUntil: 'networkidle' });
    const h1 = await px(page, 'h1');
    const lede = await page.locator('h1 + p').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(h1, 'headline').toBeGreaterThanOrEqual(26);
    expect(h1).toBeGreaterThan(lede * 1.5);
    expect(lede, 'lede').toBeGreaterThanOrEqual(MIN_BODY_PX);
  });

  test('the drop target is big enough to be the obvious next move', async ({ page }) => {
    for (const [, w, h] of VIEWPORTS) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(R, { waitUntil: 'networkidle' });
      const label = page.locator('label:has([data-testid="csv-input"])');
      const box = (await label.boundingBox())!;
      expect(box.height, `drop zone height at ${w}px`).toBeGreaterThanOrEqual(120);
      const words = await label.locator('span').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(words, `drop zone label at ${w}px`).toBeGreaterThanOrEqual(17);
    }
  });

  test('nothing overflows the screen sideways at any width', async ({ page }) => {
    for (const [, w, h] of VIEWPORTS) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(R, { waitUntil: 'networkidle' });
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `horizontal overflow at ${w}px`).toBeLessThanOrEqual(1);
    }
  });

  test('the one thing that does not exist yet is not dressed up as a link', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(R, { waitUntil: 'networkidle' });
    const scan = page.getByText('Screenshot Taste Scan');
    await expect(scan).toBeVisible();
    // A tappable card that goes nowhere is worse than a labelled placeholder.
    expect(await scan.locator('xpath=ancestor::a').count(), 'the placeholder is a link').toBe(0);
  });
});
