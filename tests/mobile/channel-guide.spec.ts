import { test, expect, type Page } from '@playwright/test';

/**
 * THE FULL CHANNEL GUIDE — the cable-box view of the grid we already ingest.
 *
 * "There's like 300 channels all going on at the same time. I'm sure there are
 * Hallmark movies, Lifetime movies, etc. that are on TV." There are — the app
 * ingests the full national lineup hourly, and until now the only way to see
 * any of it was a typed, filtered question. These tests drive the browsable
 * view: one row per channel, on-now first with real progress, up next with
 * clock times, and a search that finds a channel OR what is playing on it.
 *
 * REPAIRED (was 13 failures, all test rot — the product had moved and this
 * file had not):
 *  - the fixture grew ID and Court TV for the repeat-tag work, so every
 *    hard-coded "6 channels" was wrong; it is 8.
 *  - `h3` now carries the channel CODE chip as well as the name, so reading
 *    names from the heading returned "HCHallmark Channel". Names come from
 *    `guide-channel-name`, which is exactly the name.
 *  - the header sentence stopped printing an "on now" count.
 *  - the per-row score chip is the unified `score-badge`; `guide-match` no
 *    longer exists. It reads "88 fit" (baseline) rather than "Your 88" because
 *    the harness has no rated titles — printing "Your" there would be the
 *    dishonest branch, so the assertion follows the honest one.
 *  - the movie marker is a `<Film>` icon, not a 🎬 in the text run, so no text
 *    assertion could see it. The component now carries `guide-movie-mark` and
 *    an sr-only "Movie".
 *
 * Order is asserted RELATIVELY (this beat that) wherever the absolute position
 * is incidental — that is what the ranking rules actually claim, and it does
 * not re-break the next time a channel joins the fixture.
 */
async function open(page: Page, w = 390, qs = '') {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto(`/dev/channel-guide${qs}`, { waitUntil: 'networkidle' });
  await expect(page.getByTestId('channel-guide')).toBeVisible();
}

const channels = (page: Page) => page.getByTestId('guide-channel');

/** The channel names, in rendered order, without the code chip. */
async function names(page: Page): Promise<string[]> {
  return (await page.getByTestId('guide-channel-name').allInnerTexts()).map((n) => n.trim().toLowerCase());
}

/** 9 networks in the fixture; one carries only ended airings and is dropped. */
const ROWS = 8;

test('one row per channel — the dead channel is dropped, not shown empty', async ({ page }) => {
  await open(page);
  await expect(channels(page)).toHaveCount(ROWS);
  await expect(page.getByTestId('channel-guide')).not.toContainText('Dead Channel');
});

test('the Hallmark movie is ON NOW, with progress, and channels live now lead', async ({ page }) => {
  await open(page);
  const hallmark = channels(page).filter({ hasText: 'Hallmark' });
  await expect(hallmark.getByTestId('guide-on-now')).toContainText('Autumn in the City');
  await expect(hallmark.locator('text=On now')).toBeVisible();
  // Lifetime has nothing running at the fixed now, so it follows every channel
  // that does — that is the rule, not its absolute index.
  const order = await names(page);
  expect(order[order.length - 1]).toBe('lifetime');
  for (const live of ['espn', 'food network', 'hallmark channel', 'history', 'tcm']) {
    expect(order.indexOf(live), `${live} is live and must precede Lifetime`).toBeLessThan(order.indexOf('lifetime'));
  }
});

test('up next carries real clock times, movies marked as movies', async ({ page }) => {
  await open(page);
  const hallmark = channels(page).filter({ hasText: 'Hallmark' });
  const next = hallmark.getByTestId('guide-up-next');
  await expect(next).toContainText('A Second Chance Christmas');
  await expect(next).toContainText(/\d{1,2}:\d{2}/);
  // A Second Chance Christmas is a Movie in the fixture, so the row carries
  // the movie marker — and the marker has an accessible name, not just a glyph.
  await expect(next.getByTestId('guide-movie-mark')).toHaveCount(1);
  await expect(next.getByText('Movie', { exact: true })).toBeAttached();
});

test('the header sentence counts what the rows actually show', async ({ page }) => {
  await open(page);
  const stats = page.getByTestId('guide-stats');
  await expect(stats).toContainText(`${ROWS} channels`);
  await expect(stats).toContainText('5 movies');
});

test('search finds a channel by name…', async ({ page }) => {
  await open(page);
  await page.getByTestId('guide-search').fill('lifetime');
  await expect(channels(page)).toHaveCount(1);
  await expect(channels(page)).toContainText('Lifetime');
});

test('…and by what is playing on it', async ({ page }) => {
  await open(page);
  await page.getByTestId('guide-search').fill('football');
  await expect(channels(page)).toHaveCount(1);
  await expect(channels(page)).toContainText('ESPN');
});

test('a search that matches nothing says so instead of drawing an empty guide', async ({ page }) => {
  await open(page);
  await page.getByTestId('guide-search').fill('zzzzz');
  await expect(page.getByTestId('guide-no-match')).toBeVisible();
  await page.getByTestId('guide-search').fill('');
  await expect(channels(page)).toHaveCount(ROWS);
});

test('the same broadcast on two feeds is ONE line, not two', async ({ page }) => {
  await open(page);
  // The fixture carries "A Dangerous Affair" twice at the same minute (east +
  // west feed). The guide must print it once — the A&E "2:30 PM twice" bug.
  const lifetime = channels(page).filter({ hasText: 'Lifetime' });
  await expect(lifetime.getByTestId('guide-up-next').locator('> div')).toHaveCount(2);
  expect(await lifetime.getByText('A Dangerous Affair').count()).toBe(1);
});

test('every upcoming listing carries a quick-reminder button', async ({ page }) => {
  await open(page);
  const upNextRows = page.locator('[data-testid="guide-up-next"] > div');
  const bells = page.locator('button[data-testid^="guide-remind-"]');
  expect(await bells.count()).toBe(await upNextRows.count());
  await expect(bells.first()).toHaveAccessibleName(/remind me before/i);
});

test('tapping remind reports its real outcome — no faked success', async ({ page }) => {
  await open(page);
  // The harness has no signed-in user, so the server action refuses — and the
  // guide must SAY that rather than flipping the bell to a lying checkmark.
  const bell = page.locator('button[data-testid^="guide-remind-"]').first();
  await bell.click();
  await expect(page.getByTestId('guide-note')).toBeVisible();
  await expect(page.getByTestId('guide-note')).toContainText(/sign in|could not|wrong/i);
  // STILL UNSET — nothing was saved. This used to assert the ⏰ glyph, which
  // became an <AlarmClock> icon; the state now lives where it always should
  // have, in the accessible name and the disabled flag, both of which flip
  // only on a reminder that actually persisted.
  await expect(bell).toHaveAccessibleName(/remind me before/i);
  await expect(bell).toBeEnabled();
});

/**
 * THE DNA ORDERS THE DIAL. `?taste=1` gives the harness a viewer whose rules
 * love classic noir (+15) and Lifetime-style thrillers (+6). The guide must
 * move TCM up the live group, badge only the genuinely favoured channels, and
 * leave everyone else exactly where they were.
 */
test.describe('ranked by your DNA', () => {
  test('a loved channel climbs; neutrals keep their order', async ({ page }) => {
    await open(page);
    const before = await names(page);
    await open(page, 390, '?taste=1');
    const after = await names(page);

    // TCM (+15) moves up; nothing else changes relative order.
    expect(after.indexOf('tcm')).toBeLessThan(before.indexOf('tcm'));
    const neutrals = ['espn', 'food network', 'hallmark channel', 'history'];
    expect(neutrals.map((n) => after.indexOf(n))).toEqual(
      [...neutrals.map((n) => after.indexOf(n))].sort((a, b) => a - b),
    );
    // Live channels still lead whatever the taste says: Lifetime has nothing
    // on now and stays last despite its +6.
    expect(after[after.length - 1]).toBe('lifetime');
  });

  test('the badge marks only genuinely favoured channels', async ({ page }) => {
    await open(page, 390, '?taste=1');
    const badges = page.getByTestId('guide-for-you');
    await expect(badges).toHaveCount(2); // TCM and Lifetime
    const badged = channels(page).filter({ has: page.getByTestId('guide-for-you') });
    await expect(badged.first()).toContainText(/tcm/i);
    await expect(badged.nth(1)).toContainText(/lifetime/i);
  });

  test('without taste rules no channel claims to be for you', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('guide-for-you')).toHaveCount(0);
  });
});

/**
 * PER-PROGRAMME SCORES. `?scored=1` attaches engine matches exactly as
 * `scoreGuideAirings` would: Casablanca 88, Chopped 34. The programme's own
 * number must outrank any channel identity, sink what the engine dislikes,
 * and print on the row so the reorder explains itself.
 */
test.describe('ranked by the programme itself', () => {
  test('a scored programme outranks channel identity, and a disliked one sinks', async ({ page }) => {
    await open(page, 390, '?scored=1');
    const order = await names(page);
    // TCM leads on Casablanca's 88; Food Network sinks on Chopped's 34, below
    // every neutral live channel; Lifetime is last only because nothing is on.
    expect(order[0]).toBe('tcm');
    expect(order[order.length - 1]).toBe('lifetime');
    for (const neutral of ['espn', 'hallmark channel', 'history']) {
      expect(order.indexOf(neutral), `${neutral} must outrank the disliked Food Network`)
        .toBeLessThan(order.indexOf('food network'));
    }
  });

  test('the score prints on the row — the reorder explains itself', async ({ page }) => {
    await open(page, 390, '?scored=1');
    const tcm = channels(page).filter({ hasText: /casablanca/i });
    const badge = tcm.getByTestId('score-badge').first();
    await expect(badge).toBeVisible();
    // "88 fit", not "Your 88": the harness user has rated nothing, so the
    // baseline wording is the honest one. Either way the number is the
    // engine's, printed where the reorder happened.
    await expect(badge).toContainText('88');
    await expect(badge).toContainText(/fit/i);
  });

  test('unscored rows carry no number — no invented scores', async ({ page }) => {
    await open(page, 390, '?scored=1');
    const espn = channels(page).filter({ hasText: /monday night football/i });
    await expect(espn.getByTestId('score-badge')).toHaveCount(0);
  });
});

/**
 * ONE-TAP NARROWING. Movie-or-show toggle plus channel-group chips, on top of
 * search — nobody types "hallmark" when a chip can do it. Filters narrow the
 * ranked rows without re-ranking them, the header counts what is actually in
 * view, and an empty result says so with a one-tap way back.
 */
test.describe('toggles narrow the dial', () => {
  test('Movies keeps only channels with a movie on or next; Shows the inverse; All restores', async ({ page }) => {
    await open(page);
    await page.getByTestId('guide-media-movie').click();
    expect((await names(page)).sort()).toEqual(['hallmark channel', 'lifetime', 'tcm']);
    // The header sentence recounts what the toggle left in view.
    await expect(page.getByTestId('guide-stats')).toContainText('3 channels');
    await page.getByTestId('guide-media-tv').click();
    expect((await names(page)).sort()).toEqual(['court tv', 'espn', 'food network', 'history', 'investigation discovery']);
    await page.getByTestId('guide-media-all').click();
    await expect(channels(page)).toHaveCount(ROWS);
  });

  test('a channel-group chip narrows to that group; tapping it again clears it', async ({ page }) => {
    await open(page);
    await page.getByTestId('guide-cat-sports').click();
    await expect(channels(page)).toHaveCount(1);
    await expect(channels(page)).toContainText(/espn/i);
    await page.getByTestId('guide-cat-sports').click();
    await expect(channels(page)).toHaveCount(ROWS);
  });

  test('an impossible combination says so and offers the way back', async ({ page }) => {
    await open(page);
    // Movies + Sports: ESPN has no movie in view — an honest empty, not a blank.
    await page.getByTestId('guide-media-movie').click();
    await page.getByTestId('guide-cat-sports').click();
    await expect(page.getByTestId('guide-no-match')).toBeVisible();
    await page.getByTestId('guide-clear').click();
    await expect(channels(page)).toHaveCount(ROWS);
  });
});

for (const w of [320, 390, 768, 1440]) {
  test(`no sideways scroll at ${w}px`, async ({ page }) => {
    await open(page, w);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `overflow at ${w}`).toBeLessThanOrEqual(1);
  });
}
