import { test, expect, type Page } from '@playwright/test';

/**
 * THE BROWSE CARD ON A PHONE.
 *
 * Three complaints, one screen:
 *   • The bottom nav floated over the middle of a poster.
 *   • One card filled the whole screen — a 2:3 poster at full width is 600px of
 *     artwork before the title appears, so you saw exactly one title at a time.
 *   • Nothing said what any of them was about. "Can't go strictly by the
 *     picture."
 *
 * These run against `/dev/visual-qa`, which mounts the real PosterCard inside
 * the real `.poster-grid`, with the ratings endpoint stubbed so the synopsis
 * has something to render (the harness has no TMDB key).
 */
const PHONES = [
  { w: 320, h: 568 },
  { w: 375, h: 667 },
  { w: 390, h: 844 },
  { w: 440, h: 956 },
];

const OVERVIEW =
  'A hardened cab driver moonlights as an avenger for hire, taking the cases the law will not touch — and discovering that the people who hire him are rarely telling the whole truth.';

async function open(page: Page, w: number, h: number, overview: string | null = OVERVIEW) {
  await page.setViewportSize({ width: w, height: h });
  await page.route('**/api/ratings/**', (r) =>
    r.fulfill({
      json: {
        ratings: { standardScore: 84, audience: 78, rtAudience: 81, tomatometer: 90, imdb: 7.8, metacritic: 72 },
        overview,
      },
    }),
  );
  await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
}

for (const { w, h } of PHONES) {
  test(`the bottom nav is welded to the bottom edge @ ${w}x${h}`, async ({ page }) => {
    await open(page, w, h);
    const nav = page.locator('[data-app-bottomnav]');
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    const vh = await page.evaluate(() => window.innerHeight);

    // Flush with the bottom and the full width — not inset, not floating.
    expect(Math.round(vh - (box!.y + box!.height)), 'gap below the nav').toBe(0);
    expect(Math.round(box!.x), 'left edge').toBe(0);
    expect(Math.round(box!.width), 'width').toBe(w);

    // Opaque, and no backdrop-filter. A translucent fixed layer with a blur is
    // the iOS Safari repaint trap that stranded it mid-screen — content must
    // not show through it either way.
    const style = await nav.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        backdrop: (cs as unknown as { backdropFilter: string }).backdropFilter,
        bg: cs.backgroundColor,
      };
    });
    expect(style.backdrop === 'none' || style.backdrop === '').toBe(true);
    expect(style.bg, 'nav background must be opaque').not.toMatch(/rgba\([^)]*,\s*0?\.\d+\)/);
  });

  test(`more than one card fits, and each says what it is @ ${w}x${h}`, async ({ page }) => {
    await open(page, w, h);
    const cards = page.getByTestId('qa-grid').locator('> div');
    const n = await cards.count();
    expect(n).toBeGreaterThan(1);

    // At least two cards begin within one screen's worth of GRID. Measured
    // from the grid's own top rather than the page's, so the harness header
    // does not decide whether this passes — the property under test is the
    // card's height, not what happens to sit above it.
    const gridTop = (await page.getByTestId('qa-grid').boundingBox())!.y;
    let perScreen = 0;
    for (let i = 0; i < n; i++) {
      const box = await cards.nth(i).boundingBox();
      if (box && box.y < gridTop + h) perScreen++;
    }
    expect(perScreen, 'cards beginning within one screen of grid').toBeGreaterThanOrEqual(2);

    // RETIRED ASSUMPTION: "the poster is a column beside the facts".
    // That measured `poster.width < card.width * 0.5` — the sideways card. The
    // phone tile is two-across and vertical now, so the poster takes the cell's
    // full width at a true 2:3. Both halves of the original complaint are still
    // guarded, just by the assertions that fit the shape: more than one title
    // on a screen (above), and artwork that is never distorted (here).
    const card = (await cards.first().boundingBox())!;
    const poster = (await cards.first().locator('.wv-card-art').first().boundingBox())!;
    expect(poster.width, 'the poster does not span the card').toBeGreaterThan(card.width - 6);
    expect(poster.height / poster.width, 'the poster is not 2:3').toBeCloseTo(1.5, 1);

    // "Nothing said what any of them was about." On a two-across tile that is
    // answered by the title and its type/year line — the synopsis needs a
    // paragraph's width and is `sm`-and-up (see PosterCard); it is asserted at
    // that width by 'every card still carries its synopsis' below.
    const first = cards.first();
    await expect(first.locator('.line-clamp-2').first()).toBeVisible();
    await expect(first).toContainText(/Movie|TV/);
  });
}

/**
 * THE SYNOPSIS, AT THE WIDTH THAT CARRIES IT.
 *
 * "Can't go strictly by the picture" is still the rule; 768 is where the card
 * answers it in prose. Kept as its own test rather than folded into the phone
 * loop so the count assertion (every card, not just the first) survives.
 */
test('every card still carries its synopsis @ 768', async ({ page }) => {
  await open(page, 768, 1024);
  const n = await page.getByTestId('qa-grid').locator('> div').count();
  await expect(page.getByTestId('card-synopsis').first()).toBeVisible();
  expect(await page.getByTestId('card-synopsis').count()).toBe(n);
});

test('a title with no synopsis shows nothing rather than a placeholder', async ({ page }) => {
  await open(page, 768, 1024, null);
  await expect(page.getByTestId('qa-grid')).toBeVisible();
  // The card still renders; it just has no synopsis line to show.
  expect(await page.getByTestId('qa-grid').locator('> div').count()).toBeGreaterThan(0);
  expect(await page.getByTestId('card-synopsis').count()).toBe(0);
});

test('the card goes back to a column once there is room for real grid columns', async ({ page }) => {
  await open(page, 1024, 768);
  const card = page.getByTestId('qa-grid').locator('> div').first();
  const cardBox = await card.boundingBox();
  const poster = await card.locator('.wv-card-art').first().boundingBox();
  // Full-bleed poster across the top of the cell, not a thumbnail beside a sliver.
  expect(poster!.width).toBeGreaterThan(cardBox!.width * 0.9);
});

/**
 * THE TOP OF THE SCREEN IS NOT PERMANENTLY SPENT.
 *
 * Header + build badge is ~148px on a real phone (safe-area inset included).
 * Sticking that meant every scroll slid card titles underneath it — "it chops
 * off the top so you have to scroll back". On mobile the bottom nav is welded
 * to the edge and already carries navigation, so the top bar earns nothing by
 * persisting; it scrolls away and returns at the top of the page.
 *
 * From `sm` there is no bottom nav, so it still sticks.
 */
test('on a phone the header scrolls away instead of covering the content', async ({ page }) => {
  await open(page, 390, 844);
  await expect(page.getByTestId('build-badge')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(150);

  const header = await page.locator('header').first().boundingBox();
  const covered = header ? Math.max(0, header.y + header.height) : 0;
  expect(covered, 'viewport top still covered after scrolling').toBe(0);
});

test('on a laptop the header still sticks — there is no bottom nav there', async ({ page }) => {
  await open(page, 1280, 900);
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(150);

  const header = await page.locator('header').first().boundingBox();
  expect(header!.y, 'header pinned to the top').toBeLessThanOrEqual(1);
  expect(header!.height, 'header still occupying its band').toBeGreaterThan(40);
});
