import { test, expect, type Page } from '@playwright/test';

/**
 * YOU CAN SEE WHERE ONE TILE ENDS AND THE NEXT BEGINS.
 *
 * The complaint was a photo of the feed with one card's outline drawn on by
 * hand — because the app itself wasn't drawing it. A 7%-white ring on a
 * near-black surface is invisible, so a column of tall cards was one unbroken
 * scroll: a synopsis, two reasons, a score and three buttons, then another
 * synopsis, with nothing saying those buttons belong to THIS title.
 *
 * The arch test proves the class is declared and applied. This proves it is
 * VISIBLE — measured off the rendered card, at every width, as contrast
 * against the fill it sits on rather than "a border property exists".
 */
type Rgba = [number, number, number, number];

function parse(c: string): Rgba {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return [0, 0, 0, 0];
  const p = m[1]!.split(',').map((s) => Number(s.trim()));
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 1];
}

/** `over` composited on top of `under` — what the eye actually receives. */
function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ];
}

const lum = (c: Rgba) => {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};

/** WCAG contrast ratio — 1.0 is identical, and identical is the bug. */
function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
  return (hi + 0.05) / (lo + 0.05);
}

async function open(page: Page, w: number, h = 900) {
  await page.setViewportSize({ width: w, height: h });
  await page.route('**/api/ratings/**', (r) =>
    r.fulfill({ json: { ratings: { standardScore: 84, audience: 78, tomatometer: 91, imdb: 7.8 }, overview: 'A synopsis.' } }),
  );
  await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
}

const tiles = (page: Page) => page.getByTestId('qa-grid').locator('> div');

/** The border, the fill it sits on, and the page behind both. */
async function edgeOf(page: Page, i: number) {
  return tiles(page)
    .nth(i)
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        color: s.borderTopColor,
        width: parseFloat(s.borderTopWidth),
        fill: s.backgroundColor,
        page: getComputedStyle(document.body).backgroundColor,
        shadow: s.boxShadow,
      };
    });
}

const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440];

for (const w of WIDTHS) {
  test(`at ${w}px the tile edge is drawn and visible`, async ({ page }) => {
    await open(page, w);
    const e = await edgeOf(page, 0);

    expect(e.width, 'the tile has no border at all').toBeGreaterThanOrEqual(1);

    // Composite each layer down to what a screen actually emits. A card fill
    // of `bg-ink-950/85` is translucent, so comparing the raw declared colours
    // would flatter the result.
    const pageBg = parse(e.page);
    const fill = over(parse(e.fill), pageBg);
    const edge = over(parse(e.color), fill);

    // 1.0 is "the same colour as the card" — which is what shipped. The old
    // ring composited to ~1.06 here; a boundary the eye resolves at a glance
    // on a dark surface needs meaningfully more than that.
    expect(contrast(edge, fill), `edge ${e.color} vs fill ${e.fill}`).toBeGreaterThan(1.5);
    // And against the page it sits on, so the outer boundary reads too.
    expect(contrast(edge, pageBg), 'the edge vanishes into the page').toBeGreaterThan(1.5);

    // It is BLUE, not another wash of white: the accent already means "you can
    // act on this", and it stays clear of the pool's pink and a verdict's
    // green/red.
    expect(edge[2], 'the edge is not blue').toBeGreaterThan(Math.max(edge[0], edge[1]) + 25);
  });

  test(`at ${w}px two stacked tiles do not run together`, async ({ page }) => {
    await open(page, w);
    const n = await tiles(page).count();
    expect(n, 'need two tiles to test separation').toBeGreaterThan(1);

    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (let i = 0; i < Math.min(n, 4); i++) boxes.push((await tiles(page).nth(i).boundingBox())!);

    // Find a genuinely stacked pair (on a wide grid the first two are
    // side-by-side) and require real air between them. An edge draws the
    // boundary; the gap is what makes two boundaries read as two objects.
    const stacked = boxes.slice(1).map((b, i) => ({ a: boxes[i]!, b })).filter(({ a, b }) => b.y > a.y + a.height / 2);
    if (stacked.length === 0) {
      // A single row — check the horizontal gap instead.
      expect(boxes[1]!.x - (boxes[0]!.x + boxes[0]!.width)).toBeGreaterThanOrEqual(12);
      return;
    }
    for (const { a, b } of stacked) {
      expect(b.y - (a.y + a.height), 'tiles are touching').toBeGreaterThanOrEqual(12);
    }
  });
}

test('the edge survives the card being put in the decision pool', async ({ page }) => {
  await open(page, 390);
  await page.evaluate(() => window.localStorage.removeItem('wv.docket.v1'));
  await page.reload({ waitUntil: 'networkidle' });

  const before = await edgeOf(page, 0);
  await page.locator('button[data-testid^="w-check-"]').first().click();
  // Off the card: a click leaves the pointer on it, and hover DOES brighten the
  // edge (deliberately — it is a pointer affordance). What must not change is
  // the resting state.
  await page.mouse.move(0, 0);

  // The W turns pink; the tile's own boundary is a separate signal and must not
  // be repurposed as a selection state — the two mean different things.
  await expect.poll(async () => (await edgeOf(page, 0)).color).toBe(before.color);
  // The accessible name stopped saying "selected" when the control was renamed
  // to Docket (WCheck.tsx); it now reads "… — on your docket. Tap to remove."
  // The on/off state itself lives in `aria-pressed`, which is what a screen
  // reader announces, so assert that too rather than only the wording.
  const w = page.locator('button[data-testid^="w-check-"]').first();
  await expect(w).toHaveAttribute('aria-pressed', 'true');
  await expect(w).toHaveAttribute('aria-label', /on your docket/i);
});
