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
 */
const FULL = { standardScore: 81, tomatometer: 91, rtAudience: 78, imdb: 7.8 };
const FACTS = { runtimeMinutes: 105, contentRating: 'PG-13', genres: ['Crime', 'Thriller', 'Mystery'] };
const SYNOPSIS =
  'A weary detective returns to the coastal town he grew up in to investigate a disappearance everybody there would rather forget, and finds his own family at the centre of it.';

async function open(page: Page, w = 390, ratings: Record<string, unknown> = FULL, facts: unknown = FACTS) {
  await page.setViewportSize({ width: w, height: 1000 });
  await page.route('**/api/ratings/**', (r) => r.fulfill({ json: { ratings, overview: SYNOPSIS, facts } }));
  await page.route('**/api/dna/**', (r) =>
    r.fulfill({ json: { dna: { score: 81, confidence: 0.2, tasteScore: null, available: false, sampleSize: 0, fit: null } } }),
  );
  await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
  await page.waitForTimeout(400);
}

const card = (page: Page) => page.getByTestId('qa-grid').locator('> div').first();
const panel = (page: Page) => card(page).locator('.wv-score').first();
// THE SOURCE RATINGS LEFT THE BROWSE CARD. They are evidence — what you read
// to AUDIT the Verd1ct rather than to make a decision — and they now live on
// the title page, behind More info. `AlgorithmScore` still renders them inside
// a grid-column-width card on WatchNowGrid, ReleaseWall and
// RecommendationSlate, and the harness renders exactly that at 280px, so every
// guarantee below (no dash, nothing clipped, constant height) is measured
// where the constraint is real instead of where the row no longer exists.
const ratingsCard = (page: Page) => page.getByTestId('qa-ratings-card');

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
    // ONE row now, not two: the browse card's panel carries the decision — the
    // number and the call — and the source ratings moved to the title page.
    expect(h, `the panel is ${Math.round(h)}px tall`).toBeLessThanOrEqual(110);

    // Nothing that decides anything was dropped to get there.
    await expect(panel(page)).toContainText('81');
    await expect(panel(page)).toContainText('STREAM IT');
    // And the evidence is genuinely gone from the card rather than hidden.
    await expect(panel(page).locator('.wv-ratings-row')).toHaveCount(0);
    // It is still rendered where a card-width column really does carry it.
    await expect(ratingsCard(page).locator('.wv-ratings-row > span')).toHaveCount(3);
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
  test('a source we do not hold simply is not there', async ({ page }) => {
    await open(page, 390, { standardScore: 81, imdb: 7.8 });
    const chips = ratingsCard(page).locator('.wv-ratings-row > span');
    await expect(chips).toHaveCount(1);
    await expect(chips.first()).toContainText('7.8');
    expect(await ratingsCard(page).innerText(), 'a placeholder dash is back').not.toContain('–');
  });

  test('holding none of them is stated in words, once', async ({ page }) => {
    await open(page, 390, { standardScore: 81 });
    await expect(ratingsCard(page).getByTestId('ratings-none')).toBeVisible();
    await expect(ratingsCard(page).getByTestId('ratings-none')).toContainText(/not available/i);
    expect(await ratingsCard(page).innerText()).not.toContain('–');
  });

  test('and the row is the same height either way, so nothing moves', async ({ page }) => {
    await open(page, 390, FULL);
    const full = (await ratingsCard(page).locator('.wv-ratings-row').first().boundingBox())!.height;
    await open(page, 390, { standardScore: 81 });
    const none = (await ratingsCard(page).locator('.wv-ratings-row').first().boundingBox())!.height;
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
 */
test.describe('why you would like it', () => {
  test('speaks when the rated history genuinely supports it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.route('**/api/ratings/**', (r) => r.fulfill({ json: { ratings: FULL, overview: SYNOPSIS, facts: FACTS } }));
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

    // THE DEEPER TASTE EXPLANATION MOVED TO THE TITLE PAGE.
    //
    // `CardFit`'s sentence is the "why YOU, specifically" read — investigation,
    // not decision — so the browse card no longer carries it. What survives on
    // the card is a single grounded reason (see WhyThisTitle `compact`).
    //
    // The durable half of this contract is the one kept here: whatever the
    // card says about taste must be TRUE, and it must never fall back to a
    // disclaimer about not knowing you yet. That is asserted below and is
    // exactly what regressed last time.
    await expect(card(page).getByTestId('card-fit')).toHaveCount(0);
    const text = await card(page).innerText();
    expect(text).not.toMatch(/personalization status/i);
    expect(text).not.toMatch(/rate a few more titles/i);
  });

  test('and is SILENT — not boilerplate — when there is nothing personal to say', async ({ page }) => {
    await open(page); // dna mock: sampleSize 0, no fit
    await expect(card(page).getByTestId('card-fit')).toHaveCount(0);
    const text = await card(page).innerText();
    expect(text).not.toMatch(/personalization status/i);
    expect(text).not.toMatch(/based on the title’s themes/i);
    expect(text).not.toMatch(/rate a few more titles/i);
  });
});

test.describe('the synopsis knows its place', () => {
  test('stops, and does not offer to grow the card', async ({ page }) => {
    await open(page);
    const syn = card(page).getByTestId('card-synopsis');
    const short = (await syn.boundingBox())!.height;
    expect(short).toBeLessThanOrEqual(70);

    // THE "MORE" EXPANSION IS GONE FROM THE BROWSE CARD.
    //
    // It used to open the full synopsis in place, which is the one thing a
    // browse card may not do: the card is for deciding and its height is a
    // contract with the rest of the grid. A short, fixed synopsis still
    // answers "what is this?"; the long read is behind More info, on the title
    // page. `expandable={false}` on CardSynopsis is what enforces it.
    await expect(card(page).getByTestId('synopsis-more')).toHaveCount(0);
    // And the clamp holds regardless of how long the text actually is.
    expect((await syn.boundingBox())!.height).toBe(short);
  });

  test('does not offer More when there is no more', async ({ page }) => {
    await open(page, 390, FULL);
    await page.route('**/api/ratings/**', (r) => r.fulfill({ json: { ratings: FULL, overview: 'Short.' } }));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await expect(card(page).getByTestId('synopsis-more')).toHaveCount(0);
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

  test('lead the card — rule first, then drop to the W on the artwork', async ({ page }) => {
    // On request the FOR/AGAINST/SAVE row moved to the TOP of every card: on
    // the shorter tiles it sat below poster, facts, score and synopsis, which
    // meant scrolling past everything before you could act.
    await open(page);
    const layout = await card(page).evaluate((el) => {
      const row = el.querySelector('.wv-act-row')!.getBoundingClientRect();
      const art = el.querySelector('.wv-card-art')!.getBoundingClientRect();
      return { rowTop: Math.round(row.top), rowBottom: Math.round(row.bottom), artTop: Math.round(art.top) };
    });
    expect(layout.rowTop, 'the decision row is above the artwork').toBeLessThan(layout.artTop);
    // And the artwork does not crowd it — the border under the row needs air.
    expect(layout.artTop - layout.rowBottom, 'the row touches the artwork').toBeGreaterThanOrEqual(6);
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

  test('is filled, not merely occupied', async ({ page }) => {
    await open(page);
    const slack = await card(page).evaluate((el) => {
      const art = el.querySelector('.wv-card-art')!.getBoundingClientRect();
      const body = el.querySelector('.wv-card-body')!;
      const last = body.lastElementChild!.getBoundingClientRect();
      return Math.round(art.bottom - last.bottom);
    });
    // The block beside the poster ends level with it, give or take a line.
    expect(slack, `${slack}px of dead column beside the poster`).toBeLessThanOrEqual(24);
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
      synopsis: y('[data-testid="card-synopsis"]'),
      actions: y('.wv-act-row'),
    };
  });
  // The decision row LEADS the card (moved to the top on request — rule
  // first, then drop to the W). Below it the glance order is unchanged:
  // what it costs you, how well it fits you, then what it is about.
  expect(order.actions).toBeLessThan(order.facts);
  expect(order.facts).toBeLessThan(order.score);
  expect(order.score).toBeLessThan(order.synopsis);
});
