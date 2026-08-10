import { test, expect } from '@playwright/test';
import {
  mountHarness,
  openGrid,
  card,
  posterOf,
  pointerTo,
  pointerAway,
  players,
  watchIframeInsertions,
  iframeInsertions,
  NO_TRAILER_ID,
} from './harness';
import { HOVER_INTENT_MS } from '../../src/lib/trailer/hoverIntent';

/**
 * HOVER = PREVIEW IT.
 *
 * The dwell logic itself is proved without a browser in
 * `src/lib/trailer/hoverIntent.test.ts`. What only a real desktop browser can
 * prove is everything around it: that the pointer events fire at all, that the
 * preview is muted, that the poster comes back, that the grid never holds two
 * players, that hovering does not steal the click, and that nothing at all
 * happens for a pointer merely passing through.
 *
 * Timing constants come from the component, not from a number retyped here —
 * a spec that hard-codes 380 keeps passing when the product changes to 700.
 */
const BELOW_INTENT = Math.round(HOVER_INTENT_MS * 0.4);
const PAST_INTENT = HOVER_INTENT_MS + 450;

test.describe('desktop hover-intent trailer preview', () => {
  test('1 — a pointer passing through starts nothing, and asks for nothing', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    await pointerTo(page, posterOf(page, 0));
    await page.waitForTimeout(BELOW_INTENT);
    await pointerAway(page);
    await page.waitForTimeout(PAST_INTENT);

    await expect(posterOf(page, 0)).toHaveAttribute('data-playing', '0');
    await expect(players(page)).toHaveCount(0);
    // LAZY RESOLUTION: below the threshold the network was never touched. This
    // is also the assertion that catches a future "preload every card".
    expect(h.trailerRequests(), 'a sub-threshold hover hit the trailer resolver').toBe(0);
  });

  test('2 — a sustained hover starts a MUTED preview', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    await pointerTo(page, posterOf(page, 0));
    await expect(posterOf(page, 0)).toHaveAttribute('data-playing', '1');
    await expect(posterOf(page, 0)).toHaveAttribute('data-source', 'hover');

    const src = await page.locator('[data-testid="trailer-player"] iframe').first().getAttribute('src');
    expect(src, 'the preview embed is missing').toBeTruthy();
    expect(src!, 'a hover preview played with sound').toContain('mute=1');
    expect(src!).toContain('autoplay=1');

    // Exactly one request, for exactly the card under the pointer.
    expect(h.trailerRequests()).toBe(1);
  });

  test('3 — pointer leave stops the preview and restores the poster', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    const poster = posterOf(page, 0);
    await pointerTo(page, poster);
    await expect(poster).toHaveAttribute('data-playing', '1');

    await pointerAway(page);
    await expect(poster).toHaveAttribute('data-playing', '0');
    await expect(players(page)).toHaveCount(0);
    // The poster is the thing that comes back — not a black box where a
    // player used to be.
    await expect(card(page, 0).getByTestId('more-info-open').first()).toBeVisible();
  });

  test('4 — hovering a second card stops the first; only one preview exists', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    await pointerTo(page, posterOf(page, 0));
    await expect(posterOf(page, 0)).toHaveAttribute('data-playing', '1');

    await pointerTo(page, posterOf(page, 1));
    await expect(posterOf(page, 1)).toHaveAttribute('data-playing', '1');
    await expect(posterOf(page, 0), 'card A kept playing after card B took over').toHaveAttribute('data-playing', '0');

    // The invariant stated globally, not just about these two cards.
    await expect(players(page)).toHaveCount(1);
    await expect(card(page, 1).locator('[data-testid="trailer-player"]')).toHaveCount(1);
  });

  test('4b — sweeping across the whole grid never leaves two players mounted', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    for (let i = 0; i < 6; i++) {
      await pointerTo(page, posterOf(page, i));
      await page.waitForTimeout(120);
      expect(await players(page).count(), `two players while sweeping onto card ${i}`).toBeLessThanOrEqual(1);
    }
    await page.waitForTimeout(PAST_INTENT);
    expect(await players(page).count()).toBeLessThanOrEqual(1);
  });

  test('5 — jitter inside a card does not restart the preview', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);
    await watchIframeInsertions(page);

    const poster = posterOf(page, 0);
    await pointerTo(page, poster);
    await expect(poster).toHaveAttribute('data-playing', '1');
    expect(await iframeInsertions(page)).toBe(1);

    // A hand resting on a trackpad: many small moves, all inside the poster.
    for (let i = 0; i < 24; i++) {
      await pointerTo(page, poster, (i % 5) - 2, ((i * 3) % 7) - 3);
      await page.waitForTimeout(35);
    }
    await page.waitForTimeout(PAST_INTENT);

    await expect(poster).toHaveAttribute('data-playing', '1');
    expect(await iframeInsertions(page), 'the preview restarted on pointer jitter').toBe(1);
    expect(h.trailerRequests(), 'jitter re-resolved the trailer').toBe(1);
  });

  test('5b — drifting onto the card’s own Trailer chip is not a new hover', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);
    await watchIframeInsertions(page);

    const poster = posterOf(page, 0);
    await pointerTo(page, poster);
    await expect(poster).toHaveAttribute('data-playing', '1');

    // The ▶ Trailer chip is a descendant of the hover root, so crossing onto
    // it must not read as leave-then-enter.
    await pointerTo(page, card(page, 0).getByTestId('trailer-play'));
    await page.waitForTimeout(250);
    await expect(poster).toHaveAttribute('data-playing', '1');
    expect(await iframeInsertions(page)).toBe(1);
  });

  test('6 — a title with no trailer keeps its poster and mounts no player', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e)));

    const h = await mountHarness(page);
    await openGrid(page, h);

    // Card index 4 is the fixture's NO_TRAILER title.
    const poster = posterOf(page, 4);
    await pointerTo(page, poster);
    await page.waitForTimeout(PAST_INTENT);

    expect(h.trailerRequests(), 'the no-trailer card should still have asked, once').toBe(1);
    await expect(poster, `title ${NO_TRAILER_ID} mounted a player it has no video for`).toHaveAttribute(
      'data-playing',
      '0',
    );
    await expect(players(page)).toHaveCount(0);
    // The poster and its click target are untouched.
    await expect(card(page, 4).getByTestId('more-info-open').first()).toBeVisible();
    expect(consoleErrors, `no-trailer hover logged: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('a preview never swallows the click — the poster still opens More Info', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    const poster = posterOf(page, 0);
    await pointerTo(page, poster);
    await expect(poster).toHaveAttribute('data-playing', '1');

    // Click WHERE THE PREVIEW IS, without moving away first.
    await page.mouse.down();
    await page.mouse.up();

    await expect(page.getByTestId('more-info')).toBeVisible();
    // And the preview behind the dialog is stopped, not left running unseen.
    await expect(players(page)).toHaveCount(0);
  });

  test('17 — reduced motion: hovering never autoplays', async ({ page }) => {
    const h = await mountHarness(page, { reducedMotion: 'reduce' });
    await openGrid(page, h);

    await pointerTo(page, posterOf(page, 0));
    await page.waitForTimeout(PAST_INTENT * 2);

    await expect(posterOf(page, 0)).toHaveAttribute('data-playing', '0');
    await expect(players(page)).toHaveCount(0);
    expect(h.trailerRequests(), 'reduced motion still hit the resolver').toBe(0);

    // Reduced motion suppresses AUTOMATIC playback, not the user's own choice:
    // ▶ Trailer must still work, or the setting has become a feature ban.
    await card(page, 0).getByTestId('trailer-play').click();
    await expect(posterOf(page, 0)).toHaveAttribute('data-playing', '1');
    await expect(posterOf(page, 0)).toHaveAttribute('data-source', 'manual');
  });

  test('NEGATIVE CONTROL — the fixture can start a preview at all', async ({ page }) => {
    // Without this, every assertion above ("nothing happened") would also pass
    // against a harness where trailers can never resolve, and the suite would
    // be decoration. This is the one test that must fail if the fixture rots.
    const h = await mountHarness(page);
    await openGrid(page, h);
    await pointerTo(page, posterOf(page, 0));
    await expect(players(page)).toHaveCount(1);
    expect(h.trailerRequests()).toBeGreaterThan(0);
  });
});

test.describe('explicit trailer control stays separate from hover', () => {
  test('9 — clicking ▶ Trailer plays, and does NOT open More Info', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    await card(page, 0).getByTestId('trailer-play').click();
    await expect(posterOf(page, 0)).toHaveAttribute('data-playing', '1');
    await expect(posterOf(page, 0)).toHaveAttribute('data-source', 'manual');
    await expect(page.getByTestId('more-info'), 'the Trailer control opened More Info').toHaveCount(0);
    // A deliberate player gets the controls a preview does not.
    await expect(page.getByTestId('trailer-close')).toBeVisible();
  });

  test('a deliberate trailer survives the pointer leaving; a preview does not', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    // Hover first, so the click is a PROMOTION of a running preview — the case
    // where "the pointer owns this player" is easiest to get wrong.
    const poster = posterOf(page, 0);
    await pointerTo(page, poster);
    await expect(poster).toHaveAttribute('data-source', 'hover');

    await card(page, 0).getByTestId('trailer-play').click();
    await expect(poster).toHaveAttribute('data-source', 'manual');

    await pointerAway(page);
    await page.waitForTimeout(400);
    await expect(poster, 'moving the mouse killed a trailer the user opened on purpose').toHaveAttribute(
      'data-playing',
      '1',
    );

    // And ✕ still restores the poster.
    await page.getByTestId('trailer-close').click();
    await expect(poster).toHaveAttribute('data-playing', '0');
  });
});
