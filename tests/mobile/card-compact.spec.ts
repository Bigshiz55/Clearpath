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

  test('holds the score, the call and the ratings without a wasted row', async ({ page }) => {
    await open(page);
    const h = (await panel(page).boundingBox())!.height;
    // Two rows AT MOST — badge and call, then the ratings — inside the column
    // beside the poster. It was two stacked rows plus air, full-width, below.
    expect(h, `the panel is ${Math.round(h)}px tall`).toBeLessThanOrEqual(110);

    // Nothing was dropped to get there.
    await expect(panel(page)).toContainText('81');
    await expect(panel(page)).toContainText('STREAM IT');
    await expect(panel(page).locator('.wv-ratings-row > span')).toHaveCount(3);
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
    const chips = card(page).locator('.wv-ratings-row > span');
    await expect(chips).toHaveCount(1);
    await expect(chips.first()).toContainText('7.8');
    expect(await card(page).innerText(), 'a placeholder dash is back').not.toContain('–');
  });

  test('holding none of them is stated in words, once', async ({ page }) => {
    await open(page, 390, { standardScore: 81 });
    await expect(card(page).getByTestId('ratings-none')).toBeVisible();
    await expect(card(page).getByTestId('ratings-none')).toContainText(/not available/i);
    expect(await card(page).innerText()).not.toContain('–');
  });

  test('and the row is the same height either way, so nothing moves', async ({ page }) => {
    await open(page, 390, FULL);
    const full = (await card(page).locator('.wv-ratings-row').first().boundingBox())!.height;
    await open(page, 390, { standardScore: 81 });
    const none = (await card(page).locator('.wv-ratings-row').first().boundingBox())!.height;
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

    const fit = card(page).getByTestId('card-fit');
    await expect(fit).toBeVisible();
    await expect(fit).toContainText('edge-of-seat tension');
    // Shown in full — a clamped reason reads as a system that would not finish.
    const overflow = await fit.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(overflow).toBeLessThanOrEqual(1);
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
  test('stops at three lines and offers the rest', async ({ page }) => {
    await open(page);
    const syn = card(page).getByTestId('card-synopsis');
    const short = (await syn.boundingBox())!.height;
    expect(short).toBeLessThanOrEqual(70); // three lines at 13px/relaxed

    const more = card(page).getByTestId('synopsis-more');
    await expect(more).toBeVisible();
    await more.click();
    const long = (await syn.boundingBox())!.height;
    expect(long, 'More opened onto nothing').toBeGreaterThan(short);
    await expect(more).toHaveText('Less');
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

  test('have real air above them', async ({ page }) => {
    await open(page);
    const gap = await card(page).evaluate((el) => {
      const row = el.querySelector('.wv-act-row') as HTMLElement;
      const above = row.previousElementSibling as HTMLElement;
      return Math.round(row.getBoundingClientRect().top - above.getBoundingClientRect().bottom);
    });
    expect(gap, 'the buttons still touch the evidence').toBeGreaterThanOrEqual(10);
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
  // At a glance: poster, title, what it costs you, how well it fits you.
  // Then what it is about, then the decision itself. (The personalization
  // status block is gone at the user's request — the honest "not personal
  // yet" state lives in the badge's own label now.)
  expect(order.facts).toBeLessThan(order.score);
  expect(order.score).toBeLessThan(order.synopsis);
  expect(order.synopsis).toBeLessThan(order.actions);
});
