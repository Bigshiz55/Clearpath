import { test, expect, type Page } from '@playwright/test';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE CORE RULE, MEASURED
 *
 *   A TRAILER MAY NEVER CHANGE THE OUTER DIMENSIONS OF A CARD.
 *   THE COMPLETE CARD MUST REMAIN VISIBLE BEFORE, DURING AND AFTER PREVIEW.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ROOT CAUSE THIS SUITE EXISTS TO PREVENT COMING BACK. The browse card was
 * 763px tall on a desktop grid. App chrome above a grid is ~265px, so the first
 * card's bottom edge landed at 1028px inside a 900px viewport: there was NO
 * scroll position at which one whole card was visible. The trailer never
 * resized anything — a preview inside a card that cannot fit on screen is
 * necessarily half off the screen. So this suite asserts two separate things:
 *
 *   1. THE BUDGET — a card fits in the space a browser actually gives a grid,
 *      and every card in a row is the same height whatever its content does.
 *   2. THE CONTRACT — starting, running and stopping a trailer moves nothing:
 *      not the card's height, not the top of any region below the media frame,
 *      not the neighbouring cards, not the page's scroll width.
 *
 * Both are measured off the rendered DOM at the three viewports the work order
 * names, on the real PosterCard inside the real `.poster-grid`.
 */

const RATINGS = { standardScore: 81, tomatometer: 91, rtAudience: 78, imdb: 7.8 };
const FACTS = { runtimeMinutes: 105, contentRating: 'PG-13', genres: ['Crime', 'Thriller', 'Mystery'] };

/** Long enough to blow any unbounded synopsis clamp wide open. */
const LONG_SYNOPSIS =
  'A weary detective returns to the coastal town he grew up in to investigate a disappearance everybody there would rather forget, and finds his own family at the centre of it — a case the town buried once and would happily bury again, with the people who buried it still holding every office that matters. ' +
  'What begins as a favour to a former colleague becomes a reckoning with the version of himself he left behind, and with the price of a quiet life built on an unquiet secret.';

const STRONG_DNA = {
  score: 88,
  confidence: 0.8,
  tasteScore: 84,
  available: true,
  sampleSize: 144,
  fit: { agree: [{ label: 'slow-burn crime' }, { label: 'ensemble casts' }], clash: [] },
};
/** No profile at all — the "no personalized reason" case. */
const NO_DNA = { score: 74, confidence: 0, tasteScore: null, available: false, sampleSize: 0, fit: null };

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '390x844', width: 390, height: 844 },
];

interface OpenOpts {
  /** Per-card-id availability. Card ids in the harness are 1000..1005. */
  providers?: Record<number, string[]>;
  /** Per-card-id DNA. Missing ids fall back to `dna`. */
  dna?: unknown;
  perCardDna?: Record<number, unknown>;
  overview?: string | null;
}

async function open(page: Page, w: number, h: number, opts: OpenOpts = {}) {
  const { providers = {}, dna = STRONG_DNA, perCardDna = {}, overview = LONG_SYNOPSIS } = opts;

  await page.setViewportSize({ width: w, height: h });

  await page.route('**/api/ratings/**', (r) => {
    const id = Number(new URL(r.request().url()).pathname.split('/').pop());
    const names = providers[id] ?? [];
    return r.fulfill({
      json: {
        ratings: RATINGS,
        overview,
        facts: FACTS,
        // `TileProviders` — the shape `loadTileFacts` actually reads. See
        // src/lib/availability/providerOptions.ts.
        providers:
          names.length > 0
            ? { region: 'US', checkedAt: '2026-08-01T00:00:00Z', options: names.map((name) => ({ name, type: 'flatrate', link: null, logo: null })) }
            : null,
      },
    });
  });
  await page.route('**/api/dna/**', (r) => {
    const id = Number(new URL(r.request().url()).pathname.split('/').pop());
    return r.fulfill({ json: { dna: perCardDna[id] ?? dna } });
  });
  await page.route('**/api/availability/refresh', (r) => r.fulfill({ json: { available: false } }));
  // TMDB'S IMAGE HOST IS UNREACHABLE FROM THE HARNESS, and every provider tile
  // asks it for a logo. Left alone, each of those requests hangs until the
  // browser gives up, so a `networkidle` wait sat on the timeout: these tests
  // ran at ~15s each instead of ~3, which on a 1090-test suite is the
  // difference between finishing and hitting the global timeout. Aborting them
  // is also more honest than waiting — the tile geometry is what is under test
  // and it does not depend on the mark loading.
  await page.route('https://image.tmdb.org/**', (r) => r.abort());

  await page.goto('/dev/visual-qa', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
  // Everything on the card is async; settle before measuring anything. The
  // card deliberately reserves its regions, so this is waiting for text to
  // land in space that is already claimed, not for the layout to stop moving.
  await page.waitForTimeout(700);
}

const cards = (page: Page) => page.getByTestId('qa-grid').locator('> div');

/** Card height + the top edge of every region below the media frame. */
async function geometry(page: Page, i = 0) {
  return cards(page)
    .nth(i)
    .evaluate((el) => {
      const y = (sel: string) => {
        const e = el.querySelector(sel);
        return e ? Math.round(e.getBoundingClientRect().top) : null;
      };
      const box = el.getBoundingClientRect();
      return {
        height: Math.round(box.height),
        width: Math.round(box.width),
        top: Math.round(box.top),
        frame: Math.round(el.querySelector('.wv-card-art')!.getBoundingClientRect().height),
        titleY: y('.wv-card-body'),
        reasonY: y('.wv-reason'),
        providerY: y('[data-testid="where-to-watch"]'),
        actionsY: y('.wv-act-row'),
      };
    });
}

// ───────────────────────────────────────────────────────────────────────────
// 1. THE BUDGET
// ───────────────────────────────────────────────────────────────────────────

for (const vp of VIEWPORTS) {
  test(`@${vp.name} a whole card fits on screen with the app chrome above it`, async ({ page }) => {
    await open(page, vp.width, vp.height);
    const g = await geometry(page);
    // The number that mattered: 763px against a 900px viewport with ~265px of
    // chrome above the grid. The budget leaves real room for the chrome — and
    // the harness deliberately stacks MORE above the grid than the real app
    // does (an h1 and a full ratings-strip section), so the second assertion
    // below is the strict one.
    const budget = vp.width >= 640 ? 540 : 410;
    expect(g.height, `card is ${g.height}px at ${vp.name}`).toBeLessThanOrEqual(budget);
    // And it genuinely fits below whatever the harness puts above it.
    expect(g.top + g.height, `card bottom lands at ${g.top + g.height} in a ${vp.height}px viewport`)
      .toBeLessThanOrEqual(vp.height);
  });

  test(`@${vp.name} every card in the grid is the same height`, async ({ page }) => {
    // The full QA matrix in one grid: a long title, a tiny title, a long
    // synopsis on every card, zero providers on some and four on others, a
    // strong personalized reason on some and no profile at all on others.
    await open(page, vp.width, vp.height, {
      providers: { 1000: [], 1001: ['Netflix'], 1002: ['Netflix', 'Hulu', 'Max', 'Disney+', 'Peacock'], 1003: [], 1004: ['Prime Video', 'Apple TV'], 1005: [] },
      perCardDna: { 1000: STRONG_DNA, 1001: NO_DNA, 1002: STRONG_DNA, 1003: NO_DNA, 1004: STRONG_DNA, 1005: NO_DNA },
    });
    const n = await cards(page).count();
    const heights: number[] = [];
    for (let i = 0; i < n; i++) heights.push((await geometry(page, i)).height);
    const spread = Math.max(...heights) - Math.min(...heights);
    expect(spread, `heights ${heights.join(', ')}`).toBeLessThanOrEqual(2);
  });

  test(`@${vp.name} the grid never scrolls sideways`, async ({ page }) => {
    await open(page, vp.width, vp.height);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('a title with no personalized reason reserves the same space as one with a strong reason', async ({ page }) => {
  await open(page, 1440, 900, { perCardDna: { 1000: STRONG_DNA, 1001: NO_DNA } });
  const withReason = await geometry(page, 0);
  const without = await geometry(page, 1);
  await expect(cards(page).nth(0).getByTestId('card-reason')).toBeVisible();
  await expect(cards(page).nth(1).getByTestId('card-reason')).toHaveCount(0);
  expect(withReason.height).toBe(without.height);
});

test('the browse card carries the budget and nothing more', async ({ page }) => {
  await open(page, 1440, 900, { providers: { 1000: ['Netflix'] } });
  const card = cards(page).first();
  // KEPT: what a two-second decision needs.
  await expect(card.locator('.wv-card-art')).toBeVisible();
  await expect(card.getByTestId('card-facts')).toBeVisible();
  await expect(card.locator('.wv-score')).toBeVisible();
  await expect(card.getByTestId('card-reason')).toBeVisible();
  await expect(card.getByTestId('where-to-watch')).toHaveAttribute('data-compact', '1');
  await expect(card.getByTestId('card-verdict-for').first()).toBeVisible();
  await expect(card.getByTestId('card-more-info')).toBeVisible();

  // MOVED TO MORE INFO: the report the card used to try to be.
  await expect(card.getByTestId('card-synopsis')).toHaveCount(0);
  await expect(card.getByTestId('why-this-title')).toHaveCount(0);
  await expect(card.getByTestId('card-fit')).toHaveCount(0);
  await expect(card.locator('.wv-ratings-row')).toHaveCount(0);
  await expect(card.getByTestId('where-to-watch-cta')).toHaveCount(0);
});

test('the reading order is what a decision needs, and the actions are last', async ({ page }) => {
  await open(page, 1440, 900, { providers: { 1000: ['Netflix'] } });
  const g = await geometry(page);
  expect(g.titleY!).toBeLessThan(g.reasonY!);
  expect(g.reasonY!).toBeLessThan(g.providerY!);
  expect(g.providerY!).toBeLessThan(g.actionsY!);
  // Anchored to the bottom: the row ends within a padding's reach of the card.
  expect(g.top + g.height - g.actionsY!, 'actions are not anchored to the bottom').toBeLessThan(70);
});

// ───────────────────────────────────────────────────────────────────────────
// 2. THE CONTRACT — before / during / after
// ───────────────────────────────────────────────────────────────────────────

/**
 * Drive a real inline preview. The harness has no TMDB key, so `/api/trailer`
 * is stubbed with a verified-looking result and the YouTube embed is stubbed
 * with a local blank document — a real <iframe> of the real size, without
 * reaching the network. That is exactly the geometry under test: what matters
 * is that a video element of the trailer's dimensions is mounted in the frame.
 */
async function stubTrailer(page: Page) {
  await page.route('**/api/trailer/**', (r) =>
    r.fulfill({ json: { trailer: { videoId: 'dQw4w9WgXcQ', official: true, type: 'Trailer', autoplayEligible: true } } }),
  );
  await page.route('https://www.youtube-nocookie.com/**', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<html><body style="margin:0;background:#111"></body></html>' }),
  );
}

for (const vp of VIEWPORTS) {
  test(`@${vp.name} THE CORE RULE — a trailer changes nothing about the card`, async ({ page }) => {
    await stubTrailer(page);
    await open(page, vp.width, vp.height, { providers: { 1000: ['Netflix'], 1001: ['Hulu'] } });

    const before = await geometry(page, 0);
    const neighbourBefore = await geometry(page, 1);

    // BEFORE: the whole card is on screen.
    expect(before.top).toBeGreaterThanOrEqual(0);
    expect(before.top + before.height).toBeLessThanOrEqual(vp.height);

    await cards(page).nth(0).getByTestId('trailer-play').click();
    await expect(cards(page).nth(0).getByTestId('trailer-player')).toBeVisible();
    await page.waitForTimeout(300);

    const during = await geometry(page, 0);
    const neighbourDuring = await geometry(page, 1);

    // DURING: identical geometry, and the whole card still on screen.
    expect(during.height, 'the card changed height during preview').toBe(before.height);
    expect(during.width, 'the card changed width during preview').toBe(before.width);
    expect(during.frame, 'the media frame changed height during preview').toBe(before.frame);
    expect(during.top, 'the card moved during preview').toBe(before.top);
    expect(during.reasonY, 'the reason moved during preview').toBe(before.reasonY);
    expect(during.providerY, 'the provider row moved during preview').toBe(before.providerY);
    expect(during.actionsY, 'the actions moved during preview').toBe(before.actionsY);
    expect(during.top + during.height, 'the card is clipped during preview').toBeLessThanOrEqual(vp.height);

    // …and the neighbouring card did not move either.
    expect(neighbourDuring.top).toBe(neighbourBefore.top);
    expect(neighbourDuring.height).toBe(neighbourBefore.height);

    // No sideways overflow while a video is mounted.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    // AFTER: back to the poster, still identical.
    await cards(page).nth(0).getByTestId('trailer-close').click();
    await expect(cards(page).nth(0).getByTestId('trailer-player')).toHaveCount(0);
    await page.waitForTimeout(300);
    const after = await geometry(page, 0);
    expect(after.height, 'the card changed height after preview').toBe(before.height);
    expect(after.actionsY, 'the actions moved after preview').toBe(before.actionsY);
  });
}

test('only one trailer plays at a time', async ({ page }) => {
  await stubTrailer(page);
  await open(page, 1440, 900);
  await cards(page).nth(0).getByTestId('trailer-play').click();
  await expect(cards(page).nth(0).getByTestId('trailer-player')).toBeVisible();
  await cards(page).nth(1).getByTestId('trailer-play').click();
  await expect(cards(page).nth(1).getByTestId('trailer-player')).toBeVisible();
  await expect(cards(page).nth(0).getByTestId('trailer-player')).toHaveCount(0);
  expect(await page.getByTestId('trailer-player').count()).toBe(1);
});

test('the preview offers pause, mute and restart — and no fullscreen', async ({ page }) => {
  await stubTrailer(page);
  await open(page, 1440, 900);
  const card = cards(page).nth(0);
  await card.getByTestId('trailer-play').click();
  await expect(card.getByTestId('trailer-pause')).toBeVisible();
  await expect(card.getByTestId('trailer-mute')).toBeVisible();
  await expect(card.getByTestId('trailer-restart')).toBeVisible();
  await expect(card.getByTestId('trailer-close')).toBeVisible();
  // The card is not where the big experience lives.
  await expect(card.locator('[aria-label*="fullscreen" i]')).toHaveCount(0);

  await card.getByTestId('trailer-pause').click();
  await expect(card.getByTestId('trailer-pause')).toHaveAttribute('aria-label', /^Play /);
});

test('the trailer control is reachable and operable from the keyboard alone', async ({ page }) => {
  await stubTrailer(page);
  await open(page, 1440, 900);
  const play = cards(page).nth(0).getByTestId('trailer-play');
  await play.focus();
  await expect(play).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(cards(page).nth(0).getByTestId('trailer-player')).toBeVisible();
  // And the card did not resize because a keyboard started it either.
  const g = await geometry(page, 0);
  expect(g.top + g.height).toBeLessThanOrEqual(900);
});

test('crossing a card does not start a video — hover has to be intentional', async ({ page }) => {
  await stubTrailer(page);
  await open(page, 1440, 900);
  const frame = cards(page).nth(0).locator('.wv-card-art');
  const box = (await frame.boundingBox())!;
  // Sweep across and straight off, faster than the 550ms dwell.
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width + 200, box.y + box.height / 2);
  await page.waitForTimeout(900);
  expect(await page.getByTestId('trailer-player').count()).toBe(0);
});

// ───────────────────────────────────────────────────────────────────────────
// 3. MORE INFO OWNS THE BIG EXPERIENCE
// ───────────────────────────────────────────────────────────────────────────

for (const vp of VIEWPORTS) {
  test(`@${vp.name} More Info opens the full analysis and gives back focus`, async ({ page }) => {
    await open(page, vp.width, vp.height, { providers: { 1000: ['Netflix'] } });
    await page.route('**/api/quicklook/**', (r) =>
      r.fulfill({
        json: {
          id: 1000, mediaType: 'movie', title: 'Se7en', year: 1995,
          overview: LONG_SYNOPSIS, backdropUrl: null, posterUrl: null,
          trailerUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          genres: ['Crime', 'Thriller'], contentRating: 'R', status: null, runtime: '2h 7m',
          score: 88, standardScore: 84, ratings: RATINGS, where: ['Netflix'],
        },
      }),
    );

    const opener = cards(page).nth(0).getByTestId('card-more-info');
    await opener.click();
    const modal = page.getByTestId('quicklook');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('aria-modal', 'true');

    // The deep content the card no longer carries.
    await expect(modal.getByTestId('quicklook-synopsis')).toBeVisible();
    await expect(modal.getByTestId('quicklook-media')).toBeVisible();
    await expect(modal.locator('.wv-ratings-row').first()).toBeVisible();
    await expect(modal.getByTestId('where-to-watch')).not.toHaveAttribute('data-compact', '1');

    // A bigger video region than the card's, which is the point of opening it.
    const cardFrame = (await cards(page).nth(0).locator('.wv-card-art').boundingBox())!;
    const modalFrame = (await modal.getByTestId('quicklook-media').boundingBox())!;
    expect(modalFrame.width, 'More Info is not a bigger experience').toBeGreaterThan(cardFrame.width);

    // The page behind it does not scroll.
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');

    // Escape closes it and focus goes back to the button that opened it.
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
  });
}

test('opening More Info stops a card trailer — one video in the app, not two', async ({ page }) => {
  await stubTrailer(page);
  await open(page, 1440, 900);
  await page.route('**/api/quicklook/**', (r) =>
    r.fulfill({
      json: {
        id: 1000, mediaType: 'movie', title: 'Se7en', year: 1995, overview: 'x', backdropUrl: null,
        posterUrl: null, trailerUrl: null, genres: [], contentRating: null, status: null, runtime: null,
        score: 88, standardScore: 84, ratings: RATINGS, where: [],
      },
    }),
  );
  await cards(page).nth(0).getByTestId('trailer-play').click();
  await expect(page.getByTestId('trailer-player')).toBeVisible();
  await cards(page).nth(1).getByTestId('card-more-info').click();
  await expect(page.getByTestId('quicklook')).toBeVisible();
  await expect(page.getByTestId('trailer-player')).toHaveCount(0);
});

test('Tab is trapped inside More Info', async ({ page }) => {
  await open(page, 1440, 900);
  await page.route('**/api/quicklook/**', (r) =>
    r.fulfill({
      json: {
        id: 1000, mediaType: 'movie', title: 'Se7en', year: 1995, overview: 'x', backdropUrl: null,
        posterUrl: null, trailerUrl: null, genres: [], contentRating: null, status: null, runtime: null,
        score: 88, standardScore: 84, ratings: RATINGS, where: [],
      },
    }),
  );
  await cards(page).nth(0).getByTestId('card-more-info').click();
  const modal = page.getByTestId('quicklook');
  await expect(modal).toBeVisible();
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    const inside = await modal.evaluate((el) => el.contains(document.activeElement));
    expect(inside, `focus escaped the dialog after ${i + 1} tabs`).toBe(true);
  }
});
