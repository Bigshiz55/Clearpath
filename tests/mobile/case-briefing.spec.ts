import { test, expect, type Page } from '@playwright/test';

/**
 * TODAY'S CASE BRIEFING — the real editorial component over the real
 * selector, in a real browser. The claims:
 *   • the front page renders from stored rows: masthead, channel rail, lead
 *     case, and only the sections the data supports;
 *   • verdict numbers wear ONLY on engine-matched titles — an unmatched
 *     programme never shows a score anywhere on the page;
 *   • every item taps through: matched → the canonical QuickLook with an
 *     AIRING TODAY line, unmatched → an honest schedule-detail sheet;
 *   • the channel rail deep-links a channel edition (`?channel=`) and an
 *     unknown/empty channel gets an honest empty state, not padding;
 *   • the PAGE is the one vertical scroller (no nested vertical panes) and
 *     never scrolls horizontally itself;
 *   • rendering, filtering and tapping perform ZERO requests to any
 *     listings source.
 */

const LISTING_HOSTS = /tvmedia|tvpassport|tvguide|zap2it|titantv|ontvtonight|gracenote/i;

async function open(page: Page, query = '', viewport = { width: 390, height: 900 }): Promise<string[]> {
  const outbound: string[] = [];
  page.on('request', (r) => {
    if (LISTING_HOSTS.test(r.url())) outbound.push(r.url());
  });
  await page.setViewportSize(viewport);
  await page.goto(`/dev/case-briefing${query}`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('briefing-harness')).toBeVisible();
  return outbound;
}

test('the front page renders: masthead, rail, lead case, supported sections only', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('briefing-masthead')).toContainText('Today’s Case Briefing');
  await expect(page.getByTestId('briefing-rail-all')).toBeVisible();
  expect(await page.getByTestId('briefing-rail-chip').count()).toBeGreaterThan(4);

  const lead = page.getByTestId('briefing-lead');
  await expect(lead).toContainText('The Verdict Hour');
  await expect(lead).toContainText('Your verdict');
  await expect(lead).toContainText('94');
  // The "why" is the engine's own working, passed through verbatim.
  await expect(page.getByTestId('briefing-why')).toContainText('Quality base 81');
  await expect(page.getByTestId('briefing-why')).toContainText('Courtroom dramas');

  for (const id of ['top-cases', 'tonight', 'movies', 'sports', 'premieres', 'worth', 'late', 'wildcard']) {
    await expect(page.getByTestId(`briefing-${id}`)).toBeVisible();
  }
  // A finished programme never appears anywhere on the page.
  await expect(page.getByTestId('briefing-root')).not.toContainText('Morning Gone');
  // A programme provably running right now says so instead of a start time.
  await expect(
    page.getByTestId('briefing-item').filter({ hasText: 'Afternoon Matinee' }).first(),
  ).toContainText('ON NOW');
});

test('verdict numbers wear only on engine-matched titles', async ({ page }) => {
  await open(page);
  // Unmatched programmes carry no score badge in any of their rows.
  for (const name of ['Forgotten Reels', 'Championship Night', 'Fresh Case Files', 'Afternoon Matinee']) {
    const rows = page.getByTestId('briefing-item').filter({ hasText: name });
    const n = await rows.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await expect(rows.nth(i).getByTestId('briefing-score')).toHaveCount(0);
    }
  }
  // The wildcard is scored — and appears once, not re-listed under Worth Watching.
  await expect(page.getByTestId('briefing-wildcard')).toContainText('Animated Antics');
  await expect(page.getByTestId('briefing-worth')).not.toContainText('Animated Antics');
});

test('a matched item opens the canonical QuickLook with an AIRING TODAY line', async ({ page }) => {
  await open(page);
  await page.getByTestId('briefing-lead').getByTestId('briefing-item').click();
  const dialog = page.getByRole('dialog', { name: 'The Verdict Hour quick look' });
  await expect(dialog).toBeVisible();
  const line = page.getByTestId('quicklook-airing-line');
  await expect(line).toContainText('AIRING TODAY');
  await expect(line).toContainText('A&E');
  await expect(line).toContainText('8:00 PM');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});

test('an unmatched programme opens an honest schedule-detail sheet — never a dead tap', async ({ page }) => {
  await open(page);
  await page.getByTestId('briefing-item').filter({ hasText: 'Forgotten Reels' }).first().click();
  const sheet = page.getByTestId('briefing-schedule-detail');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('AIRING TODAY · TCM · 9:00 PM–10:50 PM');
  await expect(sheet).toContainText('Forgotten Reels');
  await expect(sheet).toContainText('isn’t matched to a catalog title yet');
  await expect(sheet).toContainText('we don’t invent one');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);
});

test('the channel rail deep-links a channel edition', async ({ page }) => {
  await open(page);
  await page.locator('[data-testid="briefing-rail-chip"][data-channel="TCM"]').click();
  await expect(page).toHaveURL(/channel=TCM/);
  await expect(page.getByTestId('briefing-masthead')).toContainText('· TCM');
  const movies = page.getByTestId('briefing-movies');
  await expect(movies).toContainText('Midnight Confession');
  await expect(movies).toContainText('Forgotten Reels');
  // Other channels' rows are gone; the sports section has nothing to say on TCM.
  await expect(page.getByTestId('briefing-sports')).toHaveCount(0);
  await expect(page.getByTestId('briefing-root')).not.toContainText('Championship Night');
  // The rail itself never narrows.
  expect(await page.getByTestId('briefing-rail-chip').count()).toBeGreaterThan(4);
});

test('an empty channel gets an honest empty state, not padding', async ({ page }) => {
  await open(page, '?channel=NoSuchChannel');
  const empty = page.getByTestId('briefing-channel-empty');
  await expect(empty).toBeVisible();
  await expect(empty).toContainText('Nothing more on NoSuchChannel today');
  await expect(empty).toContainText('the schedule speaking, not a gap on our side');
  await expect(page.getByTestId('briefing-lead')).toHaveCount(0);
});

test('the no-coverage state carries the exact honest sentence', async ({ page }) => {
  await open(page, '?empty=1');
  const empty = page.getByTestId('briefing-empty');
  await expect(empty).toHaveAttribute('data-reason', 'no-coverage');
  await expect(empty).toContainText(
    'Today’s briefing isn’t available yet because the current TV schedule hasn’t been loaded.',
  );
});

test('the loaded-but-empty-day state is distinct from no-coverage', async ({ page }) => {
  await open(page, '?empty=2');
  const empty = page.getByTestId('briefing-empty');
  await expect(empty).toHaveAttribute('data-reason', 'no-rows');
  await expect(empty).toContainText('The loaded TV schedule has no programmes for today.');
});

test('an unpersonalized reader gets the schedule, no personal sections, no "Your" label', async ({ page }) => {
  await open(page, '?personalized=0');
  await expect(page.getByTestId('briefing-unpersonalized-note')).toBeVisible();
  await expect(page.getByTestId('briefing-lead')).toHaveCount(0);
  await expect(page.getByTestId('briefing-top-cases')).toHaveCount(0);
  await expect(page.getByTestId('briefing-worth')).toHaveCount(0);
  await expect(page.getByTestId('briefing-wildcard')).toHaveCount(0);
  await expect(page.getByTestId('briefing-tonight')).toBeVisible();
  const badges = page.getByTestId('briefing-score');
  expect(await badges.count()).toBeGreaterThan(0);
  await expect(badges.first()).not.toContainText('Your');
});

test('the page is the one vertical scroller; the rail scrolls horizontally only', async ({ page }) => {
  await open(page);
  const metrics = await page.evaluate(() => {
    const doc = document.scrollingElement!;
    const rail = document.querySelector('[data-testid="briefing-rail"]')!;
    const sectionPanes = [...document.querySelectorAll('[data-testid^="briefing-"]')].filter((el) => {
      if (el.closest('[role="dialog"]')) return false;
      const cs = getComputedStyle(el);
      const scrollsY = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4;
      return scrollsY && el.getAttribute('data-testid') !== 'briefing-rail';
    });
    return {
      pageScrollsVertically: doc.scrollHeight > window.innerHeight,
      pageScrollsHorizontally: doc.scrollWidth > window.innerWidth + 1,
      railOverflowsHorizontally: rail.scrollWidth > rail.clientWidth,
      railScrollsVertically: rail.scrollHeight > rail.clientHeight + 20,
      nestedVerticalPanes: sectionPanes.length,
    };
  });
  expect(metrics.pageScrollsVertically).toBe(true);
  expect(metrics.pageScrollsHorizontally).toBe(false);
  expect(metrics.railOverflowsHorizontally).toBe(true);
  expect(metrics.railScrollsVertically).toBe(false);
  expect(metrics.nestedVerticalPanes).toBe(0);
});

test('desktop: the editorial two-column front page, no horizontal page scroll', async ({ page }) => {
  await open(page, '', { width: 1280, height: 900 });
  await expect(page.getByTestId('briefing-lead')).toBeVisible();
  const main = await page.getByTestId('briefing-top-cases').boundingBox();
  const side = await page.getByTestId('briefing-sports').boundingBox();
  expect(main && side && side.x > main.x + main.width - 1).toBeTruthy();
  const horiz = await page.evaluate(() => document.scrollingElement!.scrollWidth > window.innerWidth + 1);
  expect(horiz).toBe(false);
});

test('zero requests to any listings source across render, filter and tap-through', async ({ page }) => {
  const outbound = await open(page);
  await page.getByTestId('briefing-item').filter({ hasText: 'Forgotten Reels' }).first().click();
  await page.getByTestId('briefing-schedule-detail').getByRole('button', { name: 'Close' }).click();
  await page.locator('[data-testid="briefing-rail-chip"][data-channel="TCM"]').click();
  await expect(page.getByTestId('briefing-masthead')).toContainText('· TCM');
  expect(outbound).toEqual([]);
});
