import { test, expect, type Page } from '@playwright/test';

/**
 * THE CARD, CLEANED UP — same information, less of it shouting.
 *
 * "There is too much empty space inside it, and the score information feels
 * spread out… tone down the amount of pink… do not show rating source icons
 * with a dash when no score is available."
 *
 * Every assertion here is one of those, measured on the real card rather than
 * eyeballed: the panel's own height and fill, the absence of placeholder
 * dashes, the reading order down the card, and the fact that nothing was
 * removed to achieve any of it.
 *
 * ── UPDATED BY THE CARD/TRAILER REDESIGN ──────────────────────────────────
 * The browse card no longer carries the whole report (it was 763px tall, taller
 * than the space a 900px viewport has for it). The synopsis, the full "why it
 * fits" set, the Taste DNA sentence and the source ratings moved to More Info.
 *
 * NOTHING IN THIS FILE WAS DELETED TO MAKE THAT PASS. Every assertion about
 * relocated content is still here, still measured, on the surface the content
 * now lives on — which is the only honest way to change a contract: follow it,
 * don't drop it. Assertions about content that stayed on the card are
 * unchanged. What genuinely changed is stated in the test names.
 */
const FULL = { standardScore: 81, tomatometer: 91, rtAudience: 78, imdb: 7.8 };
const FACTS = { runtimeMinutes: 105, contentRating: 'PG-13', genres: ['Crime', 'Thriller', 'Mystery'] };
const SYNOPSIS =
  'A weary detective returns to the coastal town he grew up in to investigate a disappearance everybody there would rather forget, and finds his own family at the centre of it.';

const QUICKLOOK = {
  id: 1000, mediaType: 'movie', title: 'Se7en', year: 1995, overview: SYNOPSIS,
  backdropUrl: null, posterUrl: null, trailerUrl: null, genres: ['Crime', 'Thriller'],
  contentRating: 'R', status: null, runtime: '2h 7m', score: 81, standardScore: 81,
  ratings: FULL, where: [],
};

async function open(page: Page, w = 390, ratings: Record<string, unknown> = FULL, facts: unknown = FACTS) {
  await page.setViewportSize({ width: w, height: 1000 });
  await page.route('**/api/ratings/**', (r) => r.fulfill({ json: { ratings, overview: SYNOPSIS, facts } }));
  await page.route('**/api/dna/**', (r) =>
    r.fulfill({ json: { dna: { score: 81, confidence: 0.2, tasteScore: null, available: false, sampleSize: 0, fit: null } } }),
  );
  await page.route('**/api/quicklook/**', (r) => r.fulfill({ json: { ...QUICKLOOK, overview: SYNOPSIS } }));
  await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
  await page.waitForTimeout(400);
}

const card = (page: Page) => page.getByTestId('qa-grid').locator('> div').first();
const panel = (page: Page) => card(page).locator('.wv-score').first();

/** Open More Info on the first card — where the deep content lives now. */
async function moreInfo(page: Page) {
  await card(page).getByTestId('card-more-info').click();
  const modal = page.getByTestId('quicklook');
  await expect(modal).toBeVisible();
  await page.waitForTimeout(300);
  return modal;
}

test.describe('the verdict panel', () => {
  test('is a dark panel with a pink edge, not a pink block', async ({ page }) => {
    await open(page);
    const s = await panel(page).evaluate((el) => {
      const c = getComputedStyle(el);
      return { bg: c.backgroundColor, ring: c.boxShadow };
    });
    const [r, g, b] = /rgba?\(([^)]+)\)/.exec(s.bg)![1]!.split(',').map((n) => Number(n.trim()));
    // Near-black, and NOT tinted toward magenta: the old fill was pink at 9%,
    // which on this surface reads as a coloured block behind the numbers.
    expect(Math.max(r!, g!, b!), `panel fill is ${s.bg}`).toBeLessThan(40);
    expect(r! - g!, 'the fill is still tinted pink').toBeLessThan(12);
    // The pink survives as the frame.
    expect(s.ring).toMatch(/255,\s*20,\s*147/);
  });

  test('holds the score and the call without a wasted row', async ({ page }) => {
    await open(page);
    const h = (await panel(page).boundingBox())!.height;
    expect(h, `the panel is ${Math.round(h)}px tall`).toBeLessThanOrEqual(110);

    // The two things the panel exists to say are still here.
    await expect(panel(page)).toContainText('81');
    await expect(panel(page)).toContainText('STREAM IT');
  });

  test('the source ratings moved to More Info — still three, still real', async ({ page }) => {
    // CHANGED BY THE REDESIGN: the three rating chips are the WORKING behind
    // the number. On a grid column they wrapped to their own row, which is a
    // whole row of card height spent restating evidence nobody has questioned
    // yet. They are now one tap away instead of on every card in the grid.
    await open(page);
    await expect(card(page).locator('.wv-ratings-row')).toHaveCount(0);
    const modal = await moreInfo(page);
    await expect(modal.locator('.wv-ratings-row > span')).toHaveCount(3);
  });

  test('sits beside the artwork, where the eye already is', async ({ page }) => {
    await open(page);
    const art = (await card(page).locator('.wv-card-art').boundingBox())!;
    const p = (await panel(page).boundingBox())!;
    // Beside the poster, not under it: this is the space that was black.
    expect(p.x, 'the panel is back under the poster').toBeGreaterThan(art.x + art.width - 1);
    expect(p.y).toBeLessThan(art.y + art.height);
  });

  test('the score and the call are the loudest things in it', async ({ page }) => {
    await open(page);
    const sizes = await panel(page).evaluate((el) => {
      const call = [...el.querySelectorAll('span')].find((s) => /STREAM IT|SKIP IT|WORTH IT/i.test(s.textContent ?? ''));
      const label = el.querySelector('.text-\\[10px\\]');
      return {
        call: call ? parseFloat(getComputedStyle(call).fontSize) : 0,
        label: label ? parseFloat(getComputedStyle(label).fontSize) : 0,
      };
    });
    expect(sizes.call).toBeGreaterThan(sizes.label);
  });
});

test.describe('an unavailable rating is not drawn as a dash', () => {
  // The rule is unchanged; the surface is More Info, which is where the rating
  // chips are now drawn.
  test('a source we do not hold simply is not there', async ({ page }) => {
    await open(page, 390, { standardScore: 81, imdb: 7.8 });
    const modal = await moreInfo(page);
    const chips = modal.locator('.wv-ratings-row > span');
    await expect(chips).toHaveCount(1);
    await expect(chips.first()).toContainText('7.8');
    expect(await modal.innerText(), 'a placeholder dash is back').not.toContain('–');
  });

  test('holding none of them is stated in words, once', async ({ page }) => {
    await open(page, 390, { standardScore: 81 });
    const modal = await moreInfo(page);
    await expect(modal.getByTestId('ratings-none')).toBeVisible();
    await expect(modal.getByTestId('ratings-none')).toContainText(/not available/i);
    expect(await modal.innerText()).not.toContain('–');
  });

  test('and the row is the same height either way, so nothing moves', async ({ page }) => {
    // Measured at a width where the label does not have to wrap. Below ~360px
    // of row, "Ratings not available yet" deliberately wraps to two lines
    // rather than being clipped to "Ratings not available ye" — a data-honesty
    // label cut mid-word is the worse failure, and `RatingsStrip` says so in
    // its own comment. That wrap is intended behaviour, not drift, so the
    // no-movement property is asserted where it is actually a property.
    await open(page, 1440, FULL);
    let modal = await moreInfo(page);
    const full = (await modal.locator('.wv-ratings-row').first().boundingBox())!.height;
    await open(page, 1440, { standardScore: 81 });
    modal = await moreInfo(page);
    const none = (await modal.locator('.wv-ratings-row').first().boundingBox())!.height;
    expect(Math.round(none)).toBe(Math.round(full));
  });
});

/**
 * WHY YOU'D LIKE IT — the sentence without the boilerplate.
 *
 * The old block spoke on every card: a real reason when the profile supported
 * one, a four-line "not personal yet" disclaimer when it didn't. The
 * disclaimer was removed on request — and took the real sentences with it.
 * This is the contract for the restored half: speak only when true.
 *
 * The card now carries ONE reason (`card-reason`); the Taste DNA sentence
 * (`card-fit`) and the full ranked set live in More Info. "Speak only when
 * true" applies to all three, and all three are asserted.
 */
test.describe('why you would like it', () => {
  async function openWithStrongDna(page: Page) {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.route('**/api/ratings/**', (r) => r.fulfill({ json: { ratings: FULL, overview: SYNOPSIS, facts: FACTS } }));
    await page.route('**/api/quicklook/**', (r) => r.fulfill({ json: QUICKLOOK }));
    await page.route('**/api/dna/**', (r) =>
      r.fulfill({
        json: {
          dna: {
            score: 88, confidence: 0.8, tasteScore: 84, available: true, sampleSize: 144,
            fit: { agree: [{ label: 'Tension', note: 'edge-of-seat' }], clash: [] },
          },
        },
      }),
    );
    await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
  }

  test('the card states its one reason, in full, not clamped mid-word', async ({ page }) => {
    await openWithStrongDna(page);
    const reason = card(page).getByTestId('card-reason');
    await expect(reason).toBeVisible();
    await expect(reason).toContainText('Tension');
    // Two lines is the budget and the text fits inside it — a reason cut
    // mid-clause reads as a system that would not finish its sentence.
    const overflow = await reason.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow, 'the one reason is clipped').toBeLessThanOrEqual(1);
  });

  test('the Taste DNA sentence speaks in More Info when the history supports it', async ({ page }) => {
    await openWithStrongDna(page);
    const modal = await moreInfo(page);
    const fit = modal.getByTestId('card-fit');
    await expect(fit).toBeVisible();
    await expect(fit).toContainText('edge-of-seat tension');
    const overflow = await fit.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('and is SILENT — not boilerplate — when there is nothing personal to say', async ({ page }) => {
    await open(page); // dna mock: sampleSize 0, no fit
    await expect(card(page).getByTestId('card-reason')).toHaveCount(0);
    const cardText = await card(page).innerText();
    expect(cardText).not.toMatch(/personalization status/i);
    expect(cardText).not.toMatch(/rate a few more titles/i);

    const modal = await moreInfo(page);
    await expect(modal.getByTestId('card-fit')).toHaveCount(0);
    const modalText = await modal.innerText();
    expect(modalText).not.toMatch(/personalization status/i);
    expect(modalText).not.toMatch(/based on the title’s themes/i);
    expect(modalText).not.toMatch(/rate a few more titles/i);
  });
});

test.describe('the synopsis knows its place', () => {
  // CHANGED BY THE REDESIGN: its place is More Info. On the card it was a
  // reserved 3-line block plus a "More" toggle row on every tile in the grid —
  // context for a decision, taking the room the decision needed. The rule it
  // used to encode ("show what there is, offer the rest") is now simply "the
  // card shows none of it, More Info shows all of it".
  test('is not on the browse card at all', async ({ page }) => {
    await open(page);
    await expect(card(page).getByTestId('card-synopsis')).toHaveCount(0);
    await expect(card(page).getByTestId('synopsis-more')).toHaveCount(0);
  });

  test('is in More Info, in full, with nothing clamped away', async ({ page }) => {
    await open(page);
    const modal = await moreInfo(page);
    const syn = modal.getByTestId('quicklook-synopsis');
    await expect(syn).toBeVisible();
    await expect(syn).toContainText('coastal town');
    // Unclamped: the whole sentence, not an excerpt with an ellipsis.
    const overflow = await syn.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow, 'the synopsis is clipped in the one place it should not be').toBeLessThanOrEqual(1);
  });

  test('a title with no synopsis says nothing rather than showing a placeholder', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.route('**/api/ratings/**', (r) => r.fulfill({ json: { ratings: FULL, overview: null, facts: FACTS } }));
    await page.route('**/api/dna/**', (r) =>
      r.fulfill({ json: { dna: { score: 81, confidence: 0.2, tasteScore: null, available: false, sampleSize: 0, fit: null } } }),
    );
    await page.route('**/api/quicklook/**', (r) => r.fulfill({ json: { ...QUICKLOOK, overview: null } }));
    await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const modal = await moreInfo(page);
    await expect(modal.getByTestId('quicklook-synopsis')).toHaveCount(0);
  });
});

test.describe('the decision buttons', () => {
  test('keep the tap-target floor and lose the bulk above it', async ({ page }) => {
    for (const w of [390, 1024, 1440]) {
      await open(page, w);
      const h = (await card(page).getByTestId('card-verdict-for').first().boundingBox())!.height;
      expect(h, `FOR is ${Math.round(h)}px at ${w}`).toBeGreaterThanOrEqual(44);
      expect(h, `FOR is ${Math.round(h)}px at ${w}`).toBeLessThanOrEqual(50);
    }
  });

  test('CLOSE the card — the decision comes last, and the row never wraps', async ({ page }) => {
    // CHANGED BY THE REDESIGN. The row led the card, which was right when the
    // card was 763px tall and the buttons would otherwise have been below the
    // fold. At ~527px the whole card is on screen, and the natural order of a
    // decision puts the buttons last: what it is → will I like it → where is it
    // → what do I do. Two things are asserted, because the second is what made
    // the first affordable: FOR · AGAINST · SAVE is exactly three controls on
    // ONE line. A fourth (More info, now a chip on the artwork) wrapped the row
    // to two lines and cost 56px.
    await open(page, 1440);
    const layout = await card(page).evaluate((el) => {
      const row = el.querySelector('.wv-act-row')!.getBoundingClientRect();
      const art = el.querySelector('.wv-card-art')!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        rowTop: Math.round(row.top),
        rowHeight: Math.round(row.height),
        artBottom: Math.round(art.bottom),
        cardBottom: Math.round(box.bottom),
      };
    });
    expect(layout.rowTop, 'the decision row is above the artwork').toBeGreaterThan(layout.artBottom);
    expect(layout.cardBottom - (layout.rowTop + layout.rowHeight), 'the row is not anchored to the bottom')
      .toBeLessThanOrEqual(16);
    // One line. 44–50px is a single row of controls; 90+ is two.
    expect(layout.rowHeight, `the action row is ${layout.rowHeight}px — it wrapped`).toBeLessThanOrEqual(56);
  });
});

/**
 * THE COLUMN BESIDE THE POSTER IS NOT BLACK ANY MORE.
 *
 * "Is there any way to get some additional information in all of that extra
 * black space." A 2:3 poster is ~210px tall and a title is two lines, so every
 * card carried ~150px of unused column — while runtime, certificate, genre and
 * season count, which the app already hydrates to score the title, were on no
 * card at all.
 */
test.describe('the space beside the poster', () => {
  test('carries the facts we already hold', async ({ page }) => {
    await open(page);
    const facts = card(page).getByTestId('card-facts');
    await expect(facts).toContainText('1h 45m');
    await expect(facts).toContainText('PG-13');
    await expect(facts).toContainText('Crime');
    await expect(facts).toContainText('Thriller');
  });

  test('claims nothing when TMDB gave us nothing', async ({ page }) => {
    await open(page, 390, FULL, null);
    await expect(card(page).getByTestId('card-facts')).toHaveCount(0);
  });
});

test('the reading order down the card is what a decision needs', async ({ page }) => {
  await open(page);
  const order = await card(page).evaluate((el) => {
    const y = (s: string) => {
      const e = el.querySelector(s);
      return e ? Math.round(e.getBoundingClientRect().top) : -1;
    };
    return {
      facts: y('[data-testid="card-facts"]'),
      score: y('.wv-score'),
      providers: y('[data-testid="where-to-watch"]'),
      actions: y('.wv-act-row'),
    };
  });
  // What it is → how well it fits you → where you can watch it → what you do
  // about it. The decision row is LAST now (see "the decision buttons" above).
  expect(order.facts).toBeLessThan(order.score);
  expect(order.score).toBeLessThan(order.providers);
  expect(order.providers).toBeLessThan(order.actions);
});
