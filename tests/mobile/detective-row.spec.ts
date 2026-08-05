import { test, expect, type Page } from '@playwright/test';

/**
 * "iPhone view."
 *
 * The Detective's case-file row carries four controls: REMIND ME · SAVE · FOR ·
 * AGAINST. On a phone the first two were drawn at full width and the last two
 * were squeezed into ~40px between them, with "FOR" and "AGAINST" printed on
 * top of each other.
 *
 * The cause was a selector that could not see half its own row. `.wv-det-act`
 * sized its children with `> * { flex: 1 1 7rem }`, but `CardVerdict` wraps its
 * pair in `display: contents` — so the verdict buttons are grandchildren, the
 * rule never reached them, and Remind and Save took the width uncontested.
 */
const PICK = {
  id: 1,
  showName: 'World War II with Tom Hanks',
  network: 'History',
  airstamp: new Date(Date.now() + 3_600_000).toISOString(),
  showType: 'Documentary',
  episodeName: 'Endgame',
  season: 1,
  number: 19,
  image: null,
  tvmaze: 7.9,
  imdb: 7.6,
  rottenTomatoes: 88,
  metascore: null,
  tmdbId: 4242,
  mediaType: 'tv' as const,
};

const PICKS = [
  PICK,
  { ...PICK, id: 2, showName: 'Shark Week', network: 'Discovery', episodeName: 'Bull Shark Dinner Bell' },
  // The long-name / long-channel worst case, and one with nothing to act on.
  { ...PICK, id: 3, showName: 'American Ninja Warrior', network: 'NBC', episodeName: 'Central Regional Qualifiers' },
  { ...PICK, id: 4, showName: 'Some Local Broadcast', network: 'WGN', tmdbId: null, mediaType: null },
];

async function open(page: Page, w: number, h = 844) {
  await page.setViewportSize({ width: w, height: h });
  await page.route('**/api/detective**', (r) => r.fulfill({ json: { picks: PICKS, remindedIds: [] } }));
  await page.goto('/dev/detective', { waitUntil: 'networkidle' });
  // The button used to read "Scan the next N hours"; the horizon moved into its
  // own toggle above it and the button is now just "Scan" (TvDetective.tsx).
  // The old selector matched nothing, so every test in this file died in setup
  // on a 15s click timeout — 25 failures, one cause. `exact` so it cannot drift
  // onto "Scanning…" or the "Scan again" link in the done state.
  await page.getByRole('button', { name: 'Scan', exact: true }).click();
  await expect(page.locator('.wv-det-row').first()).toBeVisible();
}

const rows = (page: Page) => page.locator('.wv-det-row');

/** The four controls of one case-file row, named exactly. */
function controls(page: Page, i: number) {
  return rows(page)
    .nth(i)
    .locator('.wv-det-act')
    .locator('[data-testid="card-verdict-for"], [data-testid="card-verdict-against"], [data-testid="remind-button"], button[aria-label^="Save"], button[aria-label^="Saved"]');
}

const PHONES = [320, 375, 390, 414, 440] as const;

for (const w of PHONES) {
  test(`no two controls overlap @ ${w}`, async ({ page }) => {
    await open(page, w);
    const btns = controls(page, 0);
    const n = await btns.count();
    expect(n, 'the row should carry remind, save and the verdict pair').toBe(4);

    const boxes = [];
    for (let i = 0; i < n; i++) boxes.push((await btns.nth(i).boundingBox())!);
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const [p, q] = [boxes[a]!, boxes[b]!];
        const overlaps =
          p.x < q.x + q.width - 1 && q.x < p.x + p.width - 1 && p.y < q.y + q.height - 1 && q.y < p.y + p.height - 1;
        expect(overlaps, `controls ${a} and ${b} occupy the same space`).toBe(false);
      }
    }
  });

  test(`every control is wide enough to hit and to read @ ${w}`, async ({ page }) => {
    await open(page, w);
    const btns = controls(page, 0);
    for (let i = 0; i < (await btns.count()); i++) {
      const box = (await btns.nth(i).boundingBox())!;
      // 44px is the touch floor. A 40px-wide sliver holding the word "AGAINST"
      // is what this row was shipping.
      expect(box.width, `control ${i} is ${Math.round(box.width)}px wide`).toBeGreaterThanOrEqual(44);
      expect(box.height, `control ${i} is ${Math.round(box.height)}px tall`).toBeGreaterThanOrEqual(40);
    }
  });

  test(`no label escapes its own control @ ${w}`, async ({ page }) => {
    await open(page, w);
    for (const id of ['card-verdict-for', 'card-verdict-against']) {
      const btn = rows(page).first().getByTestId(id);
      const [b, l] = [await btn.boundingBox(), await btn.locator('.wv-act-label').boundingBox()];
      expect(l!.x, `${id} label starts left of its border`).toBeGreaterThanOrEqual(b!.x - 0.5);
      expect(l!.x + l!.width, `${id} label ends past its border`).toBeLessThanOrEqual(b!.x + b!.width + 0.5);
    }
  });

  test(`the four controls are the same size as each other @ ${w}`, async ({ page }) => {
    await open(page, w);
    const btns = controls(page, 0);
    const widths: number[] = [];
    for (let i = 0; i < (await btns.count()); i++) widths.push(Math.round((await btns.nth(i).boundingBox())!.width));
    // The wrap-flex this replaced produced 212 / 156 / 48 / 212 at 320px — four
    // controls of the same rank drawn at four different sizes, with FOR at the
    // touch floor beside a Save four times its width.
    expect(new Set(widths).size, `control widths: ${widths.join(' / ')}`).toBe(1);
  });

  test(`the row stays inside its card @ ${w}`, async ({ page }) => {
    await open(page, w);
    const row = rows(page).first();
    const rowBox = (await row.boundingBox())!;
    const btns = controls(page, 0);
    for (let i = 0; i < (await btns.count()); i++) {
      const box = (await btns.nth(i).boundingBox())!;
      expect(box.x + box.width, `control ${i} escapes the row`).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
    }
  });
}

test('the four controls sit two by two on a phone, one per line on a laptop', async ({ page }) => {
  await open(page, 390);
  const phone = [];
  for (let i = 0; i < 4; i++) phone.push(Math.round((await controls(page, 0).nth(i).boundingBox())!.y));
  expect(new Set(phone).size, `phone rows: ${phone.join(',')}`).toBe(2);

  await open(page, 1280, 900);
  const laptop = [];
  for (let i = 0; i < 4; i++) laptop.push(Math.round((await controls(page, 0).nth(i).boundingBox())!.y));
  expect(new Set(laptop).size, `laptop rows: ${laptop.join(',')}`).toBe(4);
});

test('a listing with no TMDB match still draws a row that fits', async ({ page }) => {
  await open(page, 390);
  const unmatched = rows(page).nth(3);
  await expect(unmatched).toBeVisible();
  const remind = unmatched.getByTestId('remind-button');
  const [r, box] = [await remind.boundingBox(), await unmatched.boundingBox()];
  expect(r!.x + r!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
});
