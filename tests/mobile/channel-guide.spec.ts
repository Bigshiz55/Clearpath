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
 */
async function open(page: Page, w = 390) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.goto('/dev/channel-guide', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('channel-guide')).toBeVisible();
}

const channels = (page: Page) => page.getByTestId('guide-channel');

test('one row per channel — the dead channel is dropped, not shown empty', async ({ page }) => {
  await open(page);
  // 7 networks in the fixture, one with only ended airings.
  await expect(channels(page)).toHaveCount(6);
  await expect(page.getByTestId('channel-guide')).not.toContainText('Dead Channel');
});

test('the Hallmark movie is ON NOW, with progress, and channels live now lead', async ({ page }) => {
  await open(page);
  const first = channels(page).first();
  // Live channels lead alphabetically: ESPN, Food Network, Hallmark, History, TCM… then Lifetime.
  await expect(first).toContainText('ESPN');
  const hallmark = channels(page).filter({ hasText: 'Hallmark' });
  await expect(hallmark.getByTestId('guide-on-now')).toContainText('Autumn in the City');
  await expect(hallmark.locator('text=On now')).toBeVisible();
  // Lifetime has nothing running at the fixed now — it follows the live group.
  // `text-transform: uppercase` reaches innerText, so compare normalized.
  const names = (await channels(page).locator('h3').allInnerTexts()).map((n) => n.trim().toLowerCase());
  expect(names.indexOf('lifetime')).toBeGreaterThan(names.indexOf('tcm'));
});

test('up next carries real clock times, movies marked as movies', async ({ page }) => {
  await open(page);
  const hallmark = channels(page).filter({ hasText: 'Hallmark' });
  const next = hallmark.getByTestId('guide-up-next');
  await expect(next).toContainText('A Second Chance Christmas');
  await expect(next).toContainText('🎬');
  await expect(next).toContainText(/\d{1,2}:\d{2}/);
});

test('the header sentence counts what the rows actually show', async ({ page }) => {
  await open(page);
  const stats = page.getByTestId('guide-stats');
  await expect(stats).toContainText('6 channels');
  await expect(stats).toContainText('5 on now');
  await expect(stats).toContainText('movies');
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
  await expect(channels(page)).toHaveCount(6);
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
  await expect(bell).toContainText('⏰'); // still unset — nothing was saved
});

/**
 * THE DNA ORDERS THE DIAL. `?taste=1` gives the harness a viewer whose rules
 * love classic noir (+15) and Lifetime-style thrillers (+6). The guide must
 * put TCM at the top of the live group, badge only the genuinely favoured
 * channels, and leave everyone else exactly where the alphabet had them.
 */
test.describe('ranked by your DNA', () => {
  test('a loved channel leads the live group; neutrals keep their order', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/dev/channel-guide?taste=1', { waitUntil: 'networkidle' });
    const names = (await channels(page).locator('h3').allInnerTexts()).map((n) =>
      n.replace(/🧬 FOR YOU/i, '').trim().toLowerCase(),
    );
    // TCM (+15) jumps to first; the zero-affinity live channels follow in the
    // old alphabetical order; Lifetime (+6) is still last — live channels lead
    // whatever the taste says.
    expect(names[0]).toBe('tcm');
    expect(names.slice(1)).toEqual(['espn', 'food network', 'hallmark', 'history', 'lifetime']);
  });

  test('the badge marks only genuinely favoured channels', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/dev/channel-guide?taste=1', { waitUntil: 'networkidle' });
    const badges = page.getByTestId('guide-for-you');
    await expect(badges).toHaveCount(2); // TCM and Lifetime
    const badged = channels(page).filter({ has: page.getByTestId('guide-for-you') });
    await expect(badged.first()).toContainText(/tcm/i);
    await expect(badged.nth(1)).toContainText(/lifetime/i);
  });

  test('without taste rules the guide is EXACTLY the old alphabetical order', async ({ page }) => {
    await open(page);
    await expect(page.getByTestId('guide-for-you')).toHaveCount(0);
    const names = (await channels(page).locator('h3').allInnerTexts()).map((n) => n.trim().toLowerCase());
    expect(names[0]).toBe('espn');
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
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/dev/channel-guide?scored=1', { waitUntil: 'networkidle' });
    const names = (await channels(page).locator('h3').allInnerTexts()).map((n) =>
      n.replace(/🧬 FOR YOU/i, '').trim().toLowerCase(),
    );
    // TCM leads on Casablanca's 88; the neutral live channels follow
    // alphabetically at 55; Food Network sinks on Chopped's 34; Lifetime is
    // last only because it has nothing on now.
    expect(names[0]).toBe('tcm');
    expect(names[names.length - 2]).toBe('food network');
    expect(names[names.length - 1]).toBe('lifetime');
  });

  test('the score prints on the row — the reorder explains itself', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/dev/channel-guide?scored=1', { waitUntil: 'networkidle' });
    const tcm = channels(page).filter({ hasText: /casablanca/i });
    await expect(tcm.getByTestId('guide-match')).toBeVisible();
    await expect(tcm.getByTestId('guide-match')).toContainText('Your 88');
  });

  test('unscored rows carry no number — no invented scores', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/dev/channel-guide?scored=1', { waitUntil: 'networkidle' });
    const espn = channels(page).filter({ hasText: /sportscenter|football/i });
    await expect(espn.getByTestId('guide-match')).toHaveCount(0);
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
    let names = (await channels(page).locator('h3').allInnerTexts()).map((n) => n.trim().toLowerCase());
    expect(names.sort()).toEqual(['hallmark', 'lifetime', 'tcm']);
    // The header sentence recounts what the toggle left in view.
    await expect(page.getByTestId('guide-stats')).toContainText('3 channels');
    await page.getByTestId('guide-media-tv').click();
    names = (await channels(page).locator('h3').allInnerTexts()).map((n) => n.trim().toLowerCase());
    expect(names.sort()).toEqual(['espn', 'food network', 'history']);
    await page.getByTestId('guide-media-all').click();
    await expect(channels(page)).toHaveCount(6);
  });

  test('a channel-group chip narrows to that group; tapping it again clears it', async ({ page }) => {
    await open(page);
    await page.getByTestId('guide-cat-sports').click();
    await expect(channels(page)).toHaveCount(1);
    await expect(channels(page)).toContainText(/espn/i);
    await page.getByTestId('guide-cat-sports').click();
    await expect(channels(page)).toHaveCount(6);
  });

  test('an impossible combination says so and offers the way back', async ({ page }) => {
    await open(page);
    // Movies + Sports: ESPN has no movie in view — an honest empty, not a blank.
    await page.getByTestId('guide-media-movie').click();
    await page.getByTestId('guide-cat-sports').click();
    await expect(page.getByTestId('guide-no-match')).toBeVisible();
    await page.getByTestId('guide-clear').click();
    await expect(channels(page)).toHaveCount(6);
  });
});

for (const w of [320, 390, 768, 1440]) {
  test(`no sideways scroll at ${w}px`, async ({ page }) => {
    await open(page, w);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `overflow at ${w}`).toBeLessThanOrEqual(1);
  });
}
