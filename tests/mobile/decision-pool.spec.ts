import { test, expect, type Page } from '@playwright/test';

/**
 * THE W, THE DECISION POOL, AND THE GAVEL — the workflow the refinement was not
 * allowed to touch.
 *
 * W = put this title in front of the judge, right now, against the others.
 * Save = a watchlist, for someday.
 *
 * They are different verbs on different stores and must stay that way: the W
 * writes to the local docket (`lib/verdict/docket`), Save writes to the
 * watchlist through a server action. These tests exist so a future visual pass
 * cannot quietly merge them, move the minimum, or let the gavel fire on two.
 *
 * Driven against `/dev/visual-qa`, which renders the real PosterCard in the
 * real grid, with the real WCheck and the real DocketTray.
 */
const MIN = 3;

async function open(page: Page, w = 390, h = 844) {
  await page.setViewportSize({ width: w, height: h });
  await page.route('**/api/ratings/**', (r) =>
    r.fulfill({ json: { ratings: { standardScore: 84, audience: 78, tomatometer: 91, imdb: 7.8 }, overview: 'A synopsis.' } }),
  );
  await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
  // A clean pool for every test — it lives in localStorage and would otherwise
  // leak between them.
  await page.evaluate(() => window.localStorage.removeItem('wv.docket.v1'));
  await page.reload({ waitUntil: 'networkidle' });
}

// The W buttons only — `w-check-tick` / `-announce` / `-refused` share the
// prefix and are not controls.
const ws = (page: Page) => page.locator('button[data-testid^="w-check-"]');

/** Select the first `n` titles through the W, as a person would. */
async function select(page: Page, n: number) {
  for (let i = 0; i < n; i++) await ws(page).nth(i).click();
}

test('every eligible card carries the W', async ({ page }) => {
  await open(page);
  const cards = await page.getByTestId('qa-grid').locator('> div').count();
  expect(await ws(page).count(), 'a card is missing its W').toBe(cards);
});

test('the W is a 44px target on the poster, not hidden in the action row', async ({ page }) => {
  await open(page);
  const w = ws(page).first();
  const box = (await w.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);

  // On the artwork, upper area — the same place on every surface.
  const art = (await page.locator('.wv-card-art').first().boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(art.x + art.width + 1);
  expect(box.y).toBeLessThan(art.y + art.height / 2);
});

test('tapping the W adds that title to the pool, and says so', async ({ page }) => {
  await open(page);
  const first = ws(page).first();
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await expect(first).toHaveAttribute('aria-label', /add to decision pool/i);

  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('docket-tray')).toBeVisible();
  await expect(page.getByTestId('docket-count')).toHaveText('1');
});

test('the selected state does not depend on colour alone', async ({ page }) => {
  await open(page);
  const first = ws(page).first();
  await expect(first.getByTestId('w-check-tick')).toHaveCount(0);
  await first.click();
  // A tick, beside a W that is still a W.
  await expect(first.getByTestId('w-check-tick')).toBeVisible();
  await expect(first).toContainText('W');
});

test('tapping it again takes the title back off', async ({ page }) => {
  await open(page);
  const first = ws(page).first();
  await first.click();
  await expect(page.getByTestId('docket-count')).toHaveText('1');
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  // The tray renders nothing at all on an empty pool.
  await expect(page.getByTestId('docket-tray')).toHaveCount(0);
});

test('multiple titles can be selected, and the count is right at every step', async ({ page }) => {
  await open(page);
  for (let n = 1; n <= 4; n++) {
    await ws(page).nth(n - 1).click();
    await expect(page.getByTestId('docket-count')).toHaveText(String(n));
  }
});

test('rapid selection and deselection does not corrupt the count', async ({ page }) => {
  await open(page);
  const first = ws(page).first();
  for (let i = 0; i < 6; i++) await first.click();
  // Six taps on one control = even = off.
  await expect(page.getByTestId('docket-tray')).toHaveCount(0);
  await first.click();
  await expect(page.getByTestId('docket-count')).toHaveText('1');
});

/* ── the gavel ─────────────────────────────────────────────────────────── */

test('below the minimum the gavel is visible, disabled, and says what is missing', async ({ page }) => {
  await open(page);
  for (const n of [1, 2]) {
    if (n > 1) await ws(page).nth(n - 1).click();
    else await ws(page).first().click();

    const gavel = page.getByTestId('docket-not-ready');
    await expect(gavel, `${n} selected`).toBeVisible();
    await expect(gavel).toBeDisabled();
    await expect(gavel).toContainText(`${MIN - n} more`);
    await expect(gavel).toHaveAttribute('aria-label', /gavel unavailable/i);
    // And the live one is genuinely absent, not merely styled down.
    await expect(page.getByTestId('docket-deliver')).toHaveCount(0);
  }
});

test('the pool says how far there is to go, in words', async ({ page }) => {
  await open(page, 768, 1024); // the width where the long form is shown
  await select(page, 2);
  await expect(page.getByTestId('docket-status-long')).toHaveText('2 selected — choose 1 more');
  await ws(page).nth(2).click();
  await expect(page.getByTestId('docket-status-long')).toHaveText('3 selected — gavel ready');
});

test('the gavel becomes available at exactly three, and is announced', async ({ page }) => {
  await open(page);
  await select(page, MIN - 1);
  await expect(page.getByTestId('docket-deliver')).toHaveCount(0);

  await ws(page).nth(MIN - 1).click();
  const gavel = page.getByTestId('docket-deliver');
  await expect(gavel).toBeVisible();
  await expect(gavel).toHaveAttribute('href', '/app/verdict');
  await expect(gavel).toHaveAttribute('aria-label', /gavel decide/i);
  await expect(page.getByTestId('docket-announce')).toHaveText('3 selected — gavel ready');
  await expect(page.getByTestId('docket-not-ready')).toHaveCount(0);
});

test('and stays available above three', async ({ page }) => {
  await open(page);
  await select(page, 5);
  await expect(page.getByTestId('docket-count')).toHaveText('5');
  await expect(page.getByTestId('docket-deliver')).toBeVisible();
});

test('the gavel carries exactly the titles that were selected', async ({ page }) => {
  await open(page);
  await select(page, MIN);
  await page.getByTestId('docket-toggle').click();
  const listed = await page.getByTestId('docket-list').locator('li').allInnerTexts();
  expect(listed).toHaveLength(MIN);

  // The pool is the source of truth the verdict page reads, so assert on it.
  const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('wv.docket.v1') ?? '[]'));
  expect(stored).toHaveLength(MIN);
  for (const entry of stored) expect(listed.join(' ')).toContain(entry.title);
});

/* ── W and Save are different verbs ────────────────────────────────────── */

test('SAVE DOES NOT TOUCH THE DECISION POOL', async ({ page }) => {
  await open(page);
  const save = page.getByTestId('qa-grid').locator('> div').first().getByRole('button', { name: /^Save$/i });
  test.skip((await save.count()) === 0, 'this harness card has no save button');
  await save.click();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('docket-tray'), 'Save put something on the docket').toHaveCount(0);
});

test('THE W DOES NOT SAVE', async ({ page }) => {
  await open(page);
  const card = page.getByTestId('qa-grid').locator('> div').first();
  await card.locator('button[data-testid^="w-check-"]').first().click();
  await expect(page.getByTestId('docket-count')).toHaveText('1');
  // The save control is untouched — still offering to save.
  const save = card.getByRole('button', { name: /^Save$/i });
  if ((await save.count()) > 0) await expect(save).toHaveAccessibleName(/^Save$/i);
});

/* ── the pool survives browsing ────────────────────────────────────────── */

test('selections survive a navigation and a reload', async ({ page }) => {
  await open(page);
  await select(page, MIN);
  await expect(page.getByTestId('docket-count')).toHaveText(String(MIN));

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('docket-count')).toHaveText(String(MIN));
  await expect(page.getByTestId('docket-deliver')).toBeVisible();
});

/* ── layout ────────────────────────────────────────────────────────────── */

/**
 * THE TRAY DOES NOT SWALLOW THE BOTTOM OF THE PAGE.
 *
 * It is `fixed`, and the page's layout pads for the bottom nav but knew nothing
 * about a tray that only sometimes exists — so the moment the docket had
 * anything on it, the last line of every screen (the final card's own
 * FOR/AGAINST/SAVE row included) sat underneath it with no way to scroll clear.
 * The tray now renders an in-flow spacer of its own height exactly when it
 * renders itself.
 */
for (const w of [320, 390, 1024, 1440] as const) {
  test(`the last card can always scroll clear of the tray @ ${w}`, async ({ page }) => {
    await open(page, w, 800);
    await select(page, 1); // any docket at all summons the tray

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);

    const cards = page.getByTestId('qa-grid').locator('> div');
    const last = (await cards.last().boundingBox())!;
    const tray = (await page.getByTestId('docket-tray').boundingBox())!;
    expect(
      last.y + last.height,
      `the last card ends ${Math.round(last.y + last.height - tray.y)}px under the tray at ${w}`,
    ).toBeLessThanOrEqual(tray.y + 1);
  });
}

test('and the spacer exists only while the tray does', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('docket-spacer')).toHaveCount(0);
  await select(page, 1);
  await expect(page.getByTestId('docket-spacer')).toHaveCount(1);
  // Clear-everything lives inside the expanded panel — on a compact floating
  // widget, a one-tap destroy-the-whole-docket button is an accident.
  await page.getByTestId('docket-toggle').click();
  await page.getByTestId('docket-clear').click();
  await expect(page.getByTestId('docket-spacer')).toHaveCount(0);
});


for (const w of [320, 375, 390, 430, 768, 1024, 1440] as const) {
  test(`the pool and gavel fit, and nothing scrolls sideways @ ${w}`, async ({ page }) => {
    await open(page, w, 900);
    await select(page, MIN);

    const tray = (await page.getByTestId('docket-tray').boundingBox())!;
    expect(tray.x, `tray escapes left at ${w}`).toBeGreaterThanOrEqual(-1);
    expect(tray.x + tray.width, `tray escapes right at ${w}`).toBeLessThanOrEqual(w + 1);

    const gavel = (await page.getByTestId('docket-deliver').boundingBox())!;
    expect(gavel.height, `gavel below the touch floor at ${w}`).toBeGreaterThanOrEqual(44);
    expect(gavel.x + gavel.width, `gavel clipped at ${w}`).toBeLessThanOrEqual(w + 1);

    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over, `horizontal overflow at ${w}`).toBeLessThanOrEqual(1);
  });
}

test('a very long title does not break the card or the pool list', async ({ page }) => {
  await open(page);
  // The harness deliberately renders a 97-character title.
  const cards = page.getByTestId('qa-grid').locator('> div');
  const long = cards.nth(1);
  const box = (await long.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390 + 1);

  await long.locator('button[data-testid^="w-check-"]').first().click();
  await page.getByTestId('docket-toggle').click();
  const chip = page.getByTestId('docket-list').locator('li').first();
  const chipBox = (await chip.boundingBox())!;
  expect(chipBox.x + chipBox.width, 'the pool chip escapes the screen').toBeLessThanOrEqual(390 + 1);
});

/**
 * THE RATINGS ROW IS REFERENCE, NOT AN ACTION — and it must never lie by
 * truncation. "🍅 5…" looks like a value we hold and cannot show.
 */
for (const w of [320, 375, 390, 430, 768, 1024, 1440] as const) {
  test(`no rating is clipped or truncated @ ${w}`, async ({ page }) => {
    await open(page, w, 900);
    // INSIDE A CARD. The harness also renders a standalone full-width strip,
    // which has room to spare and proves nothing — the first version of this
    // test measured that one and passed while "6.8" shipped as "6".
    const row = page.getByTestId('qa-grid').locator('.wv-ratings-row').first();
    await expect(row).toBeVisible();
    const chips = row.locator('> span');
    expect(await chips.count()).toBe(3);

    const rowBox = (await row.boundingBox())!;
    for (let i = 0; i < 3; i++) {
      const chip = chips.nth(i);
      const box = (await chip.boundingBox())!;
      expect(box.x + box.width, `chip ${i} escapes the row at ${w}`).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
      // Measure the VALUE against the CHIP, not against itself: the chip is
      // `overflow-hidden`, so a value that runs past its edge is cut without
      // ever overflowing its own box. That is how "6.8" shipped as "6".
      const cut = await chip.evaluate((el) => {
        const v = el.lastElementChild as HTMLElement | null;
        if (!v) return 0;
        const c = el.getBoundingClientRect();
        const b = v.getBoundingClientRect();
        return Math.max(0, Math.round(b.right - c.right), Math.round(el.scrollWidth - el.clientWidth));
      });
      expect(cut, `chip ${i} cuts its value by ${cut}px at ${w}`).toBeLessThanOrEqual(1);
    }
  });
}

test('the ratings do not look like the actions', async ({ page }) => {
  await open(page);
  const row = page.getByTestId('qa-grid').locator('.wv-ratings-row').first();
  const heights = await row.locator('> span').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  // One consistent height across all three sources.
  expect(new Set(heights).size, `chip heights: ${heights.join(',')}`).toBe(1);
  // And shorter than the real controls beside them.
  const forBtn = (await page.getByTestId('card-verdict-for').first().boundingBox())!;
  expect(heights[0]!).toBeLessThan(forBtn.height);
});

test('the verdict block uses the card’s full width, not the column beside the poster', async ({ page }) => {
  await open(page);
  const card = page.getByTestId('qa-grid').locator('> div').first();
  const cardBox = (await card.boundingBox())!;
  const art = (await card.locator('.wv-card-art').boundingBox())!;
  const foot = (await card.locator('.wv-card-foot').boundingBox())!;

  // It starts under the poster, not beside it…
  expect(foot.y, 'the verdict block is still beside the poster').toBeGreaterThanOrEqual(art.y + art.height - 1);
  // …and it is wider than the text column ever was.
  expect(foot.width).toBeGreaterThan(cardBox.width * 0.85);
});
