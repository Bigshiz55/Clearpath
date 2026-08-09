import { test, expect, type Page } from '@playwright/test';

/**
 * REAL-DEVICE POLISH — three defects found by measuring the shipped harness
 * on a phone, not by looking at a screenshot. Each one is text the product
 * needs a person to READ being physically cut off by a box it lives in.
 *
 *  1. The verdict sentence was `line-clamp-2` in a ~130px column between the
 *     call badge and the confidence chip. At 320px it needed 64px of height
 *     and had 32 — half the recommendation, gone, with no way to see it.
 *  2. "Ratings not available yet" was `whitespace-nowrap` inside an
 *     `overflow-hidden` row: 155px of text in a 151px body, clipped to
 *     "Ratings not available ye". A data-honesty label, cut mid-word.
 *  3. The W coach mark — the first-run instruction — was a 216px panel
 *     anchored INSIDE `.wv-card-art`, which is `overflow-hidden` and ~103px
 *     wide on a phone. No descendant can escape a clipping box, so it is now
 *     a portal on document.body positioned from the button's own rect.
 *
 * These assert the mechanism (nothing is clipped), not a pixel snapshot.
 */

const WIDTHS = [320, 360, 390] as const;

/** True when the element's own content is being cut off by its own box. */
async function clipping(page: Page, testId: string) {
  return page.getByTestId(testId).first().evaluate((el) => ({
    clippedX: el.scrollWidth > el.clientWidth + 1,
    clippedY: el.scrollHeight > el.clientHeight + 1,
    text: (el.textContent ?? '').trim(),
  }));
}

/**
 * True when any ancestor with `overflow: hidden|clip` cuts the element off —
 * the failure mode a plain boundingBox() check cannot see, because a clipped
 * element still reports its full, unclipped rect.
 */
async function clippedByAncestor(page: Page, testId: string) {
  return page.getByTestId(testId).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'hidden' && cs.overflowX !== 'clip' &&
          cs.overflowY !== 'hidden' && cs.overflowY !== 'clip') continue;
      const pr = p.getBoundingClientRect();
      if (r.left < pr.left - 1 || r.right > pr.right + 1 ||
          r.top < pr.top - 1 || r.bottom > pr.bottom + 1) {
        return { clipped: true, by: p.className.toString().slice(0, 80) };
      }
    }
    return { clipped: false, by: '' };
  });
}

for (const w of WIDTHS) {
  test.describe(`@ ${w}px`, () => {
    test.use({ viewport: { width: w, height: 844 } });

    test('the verdict sentence is rendered in full, never clamped', async ({ page }) => {
      await page.goto('/dev/report-tabs', { waitUntil: 'networkidle' });
      const line = page.getByTestId('verdict-one-liner').first();
      await expect(line).toBeVisible();
      const state = await clipping(page, 'verdict-one-liner');
      expect(state.text.length, 'the harness must actually render a sentence').toBeGreaterThan(10);
      expect(state.clippedY, `verdict copy truncated at ${w}px: "${state.text}"`).toBe(false);
      expect(state.clippedX, `verdict copy clipped sideways at ${w}px`).toBe(false);
      // And no clamp is left on it, so a longer sentence cannot regress.
      const clamp = await line.evaluate((el) => getComputedStyle(el).webkitLineClamp);
      expect(clamp === 'none' || clamp === '' || clamp == null).toBe(true);
    });

    /**
     * ON A PHONE THE LABEL CANNOT BE CUT, BECAUSE THE ROW IS NOT DRAWN.
     *
     * The defect was "Ratings not available yet" — 155px of text — clipped to
     * "Ratings not available ye" inside a 151px `overflow-hidden` row on a
     * phone card. A two-across tile gives that row ~102px, which is worse
     * still, so the ratings row is `sm`-and-up on a card now (see
     * `.wv-score-ratings` in globals.css) and there is nothing here to cut.
     *
     * This asserts exactly that, rather than skipping: a `display:none` node
     * reports a zero rect, which the ancestor check reads as "clipped by
     * .wv-card" — a false positive that would have hidden a real regression.
     * The clipping assertions themselves are unchanged and now run at 768,
     * where the label is drawn (see below).
     */
    test('the "no ratings" label is not drawn on a phone tile, so it cannot be cut', async ({ page }) => {
      await page.goto('/dev/verdict', { waitUntil: 'networkidle' });
      const none = page.getByTestId('ratings-none').first();
      if ((await none.count()) === 0) test.skip(true, 'this harness state has ratings');
      await expect(none).toBeHidden();
      // Nothing else on the tile is claiming a rating in its place.
      const card = page.locator('.poster-grid > *').first();
      expect(await card.innerText(), `a rating leaked onto the tile at ${w}px`).not.toMatch(/IMDb|🍅|🍿/);
    });

    test('the W coach mark escapes every clipping box', async ({ page }) => {
      await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
      const coach = page.getByTestId('w-coach');
      await expect(coach).toBeVisible();

      // Not cut off by anything above it in the tree.
      const anc = await clippedByAncestor(page, 'w-coach');
      expect(anc.clipped, `coach clipped by ancestor "${anc.by}" at ${w}px`).toBe(false);

      // Its own content fits, and the whole panel is on screen.
      const own = await clipping(page, 'w-coach');
      expect(own.clippedX, `coach content clipped at ${w}px`).toBe(false);
      const box = (await coach.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(w + 1);
      expect(box.width, 'the panel keeps its full width, not the poster’s').toBeGreaterThan(150);

      // IT NEVER EATS A TAP IT WAS NOT GIVEN. Floating free of the card, the
      // panel can land over a poster or a search row — and it did: every
      // "open the title" click in search-to-title started failing with
      // "w-coach intercepts pointer events". A coach mark is advice, not a
      // modal, so the panel is transparent to the pointer and only its own
      // "Got it" takes clicks back.
      const hit = await page.evaluate(
        ([x, y]) => {
          const el = document.elementFromPoint(x as number, y as number);
          return el?.closest('[data-testid="w-coach"]') != null
            ? el?.closest('[data-testid="w-coach-dismiss"]') != null
              ? 'dismiss'
              : 'panel'
            : 'through';
        },
        // A point in the panel's TEXT, not on its button.
        [box.x + box.width / 2, box.y + 8],
      );
      expect(hit, 'the coach body must not swallow taps meant for the page').toBe('through');

      // And "Got it" is still genuinely tappable — the symptom that exposed
      // the clipping in the first place.
      await page.getByTestId('w-coach-dismiss').click();
      await expect(page.getByTestId('w-coach')).toHaveCount(0);
    });
  });
}

/**
 * …AND THE SAME LABEL, AT THE WIDTH THAT DRAWS IT.
 *
 * The mid-word-clipping assertions from the phone loop, kept intact and moved
 * to the narrowest width where a card actually carries the ratings row. This is
 * the tightest honest case for the original defect: 768 gives the row ~308px,
 * and "Ratings not available yet" must render whole inside it — not cut by its
 * own `overflow-hidden` box and not cut by any ancestor.
 */
test.describe('@ 768px', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('the "no ratings" label is never cut mid-word', async ({ page }) => {
    await page.goto('/dev/verdict', { waitUntil: 'networkidle' });
    const none = page.getByTestId('ratings-none').first();
    if ((await none.count()) === 0) test.skip(true, 'this harness state has ratings');
    await expect(none).toBeVisible();
    const own = await clipping(page, 'ratings-none');
    expect(own.clippedX, 'label clipped by its own box at 768px').toBe(false);
    const anc = await clippedByAncestor(page, 'ratings-none');
    expect(anc.clipped, `label clipped by ancestor "${anc.by}" at 768px`).toBe(false);
    await expect(none).toContainText('Ratings not available yet');
  });
});
