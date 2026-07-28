import { test, expect, type Page } from '@playwright/test';

/**
 * "iPhone view."
 *
 * The On TV highlight strip drew TWO columns on a phone with a hand-rolled card
 * — a third copy of a layout the shared `.wv-card` shape exists to prevent. At
 * 390px each cell is ~176px wide; the action row's padding leaves ~160px for
 * FOR + AGAINST + SAVE plus two gaps, which is ~50px a button. A 14px icon, a
 * gap and an 11px uppercase "AGAINST" need ~70px, so the word ran into its own
 * border and SAVE dropped onto a second line.
 *
 * The strip had never had a harness — `/dev/live-tv` mounts a different
 * component on a different contract — which is why three fixes to it shipped
 * unmeasured. `/dev/on-tv` mounts the real `OnTvGuide` over fixtures so the
 * geometry can actually be asserted.
 */
async function open(page: Page, w: number, h = 844) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/dev/on-tv', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('tv-highlights')).toBeVisible();
}

const cards = (page: Page) => page.getByTestId('tv-highlights').locator('> div');

/** Every FOR/AGAINST/SAVE control inside one highlight card. Named exactly —
 *  `[data-testid^="card-verdict-"]` also catches the sr-only status span, which
 *  is not a control and sits wherever the screen reader needs it. */
function actions(page: Page, i: number) {
  return cards(page)
    .nth(i)
    .locator('[data-testid="card-verdict-for"], [data-testid="card-verdict-against"], button[aria-label^="Save"], button[aria-label^="Saved"]');
}

const PHONES = [320, 375, 390, 414, 440] as const;

for (const w of PHONES) {
  test(`the verdict row fits inside its card @ ${w}`, async ({ page }) => {
    await open(page, w);
    const n = await cards(page).count();
    expect(n).toBeGreaterThan(3);

    for (let i = 0; i < n; i++) {
      const card = cards(page).nth(i);
      const cardBox = (await card.boundingBox())!;
      const btns = actions(page, i);
      const count = await btns.count();
      if (count === 0) continue; // the unmatched listing has no controls

      for (let b = 0; b < count; b++) {
        const box = (await btns.nth(b).boundingBox())!;
        expect(box.x, `card ${i} button ${b} starts left of its card`).toBeGreaterThanOrEqual(cardBox.x - 1);
        expect(
          box.x + box.width,
          `card ${i} button ${b} escapes its card`,
        ).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
      }
    }
  });

  test(`no verdict label is squeezed against its own border @ ${w}`, async ({ page }) => {
    await open(page, w);
    // AGAINST is the widest word in the row and the one the screenshot showed
    // touching its border. Measure the label against the button that holds it.
    const btn = cards(page).first().getByTestId('card-verdict-against');
    const label = btn.locator('.wv-act-label');
    const [b, l] = [await btn.boundingBox(), await label.boundingBox()];
    const slack = Math.min(l!.x - b!.x, b!.x + b!.width - (l!.x + l!.width));
    expect(slack, 'padding either side of AGAINST').toBeGreaterThanOrEqual(4);
  });
}

test('the action row is one line, not two — the card cannot pay for a wrap', async ({ page }) => {
  await open(page, 390);
  const btns = actions(page, 0);
  const tops: number[] = [];
  for (let i = 0; i < (await btns.count()); i++) tops.push(Math.round((await btns.nth(i).boundingBox())!.y));
  expect(new Set(tops).size, `buttons sit on ${new Set(tops).size} lines: ${tops.join(',')}`).toBe(1);
});

test('the strip never scrolls the page sideways', async ({ page }) => {
  for (const w of PHONES) {
    await open(page, w);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `horizontal overflow at ${w}px`).toBeLessThanOrEqual(1);
  }
});

/**
 * TIME HONESTY IN THE STRIP. The grid window reaches back for in-progress
 * airings on purpose — but the cards printed their raw start time, so at
 * 3:33 PM the "Movies on now" tab led with "11:45 AM", which reads as stale
 * data. A running show must say it's running, and one that's mostly over must
 * not be offered at all.
 */
test('a card already running says ON NOW instead of a past start time', async ({ page }) => {
  await open(page, 390);
  const strip = page.getByTestId('tv-highlights');
  const card = strip.locator('> div').filter({ hasText: 'Started Twenty Minutes Ago' });
  await expect(card).toHaveCount(1);
  const chip = card.getByTestId('airing-live');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(/on now/i);
  await expect(chip).toContainText(/\d+m in/i);
  // And no clock time on that card's time line — the chip replaced it.
  await expect(card.locator('text=/\\d{1,2}:\\d{2}\\s?(AM|PM)/').first()).not.toBeVisible();
});

test('a movie in its final scene is not offered as a highlight', async ({ page }) => {
  await open(page, 390);
  const strip = page.getByTestId('tv-highlights');
  // The fixture is still "on" by its four-hour slot — and 3h48m in.
  await expect(strip).not.toContainText('Nearly Over Movie');
  // The upcoming fixtures are untouched: real future listings keep their times.
  await expect(strip).toContainText('Cinderella Man');
});

test('an unmatched listing keeps the same card shape as a matched one', async ({ page }) => {
  await open(page, 390);
  const unmatched = page.getByTestId('airing-unmatched').first();
  await expect(unmatched).toBeVisible();
  // The point of the always-present row: the artwork below it must start at the
  // same offset within the card as its neighbours', or the strip reads broken.
  const n = await cards(page).count();
  const offsets: number[] = [];
  for (let i = 0; i < n; i++) {
    const card = cards(page).nth(i);
    const art = card.locator('.wv-card-art').first();
    if ((await art.count()) === 0) continue;
    const [c, a] = [await card.boundingBox(), await art.boundingBox()];
    offsets.push(Math.round(a!.y - c!.y));
  }
  expect(new Set(offsets).size, `artwork starts at ${[...new Set(offsets)].join('/')} across cards`).toBe(1);
});
