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
/**
 * THE WIDTH AT WHICH A CARD CARRIES ITS EVIDENCE.
 *
 * A phone result tile is TWO ACROSS now (owner-approved): 138px at 320 up to
 * 193px at 430. What it carries is what you ACT on — the VERD1CT score, the
 * FOR/AGAINST ruling, Save and where to watch. What it does NOT carry is the
 * PROSE and the EVIDENCE: the three rating chips, the runtime/certificate/genre
 * line, the synopsis and the taste sentence. Those are `sm`-and-up on the card
 * (see PosterCard) and in full on the title page, because 122px of text lane
 * renders "IMDb 6.8" as "IMDb 6" — a wrong number, confidently displayed.
 *
 * So the tests BELOW that measure those blocks are not phone tests any more.
 * They are not weakened and they are not deleted: they run at the first width
 * where the card actually carries the thing they assert. 768 rather than a
 * desktop width because it is the narrowest full card — the tightest honest
 * case for "does the evidence fit" — and it is one of the acceptance widths.
 *
 * Anything that measures the SCORE, the RULING, Save, availability or the
 * card's own geometry still runs on the phone, where it belongs.
 */
const FULL_CARD = 768;

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

  // The ratings chips are `sm`-and-up on a card — see FULL_CARD.
  test('holds the score, the call and the ratings without a wasted row', async ({ page }) => {
    await open(page, FULL_CARD);
    const h = (await panel(page).boundingBox())!.height;
    // Two rows AT MOST — badge and call, then the ratings — inside the column
    // beside the poster. It was two stacked rows plus air, full-width, below.
    expect(h, `the panel is ${Math.round(h)}px tall`).toBeLessThanOrEqual(110);

    // Nothing was dropped to get there.
    await expect(panel(page)).toContainText('81');
    await expect(panel(page)).toContainText('STREAM IT');
    await expect(panel(page).locator('.wv-ratings-row > span')).toHaveCount(3);
  });

  /**
   * RETIRED ASSUMPTION: "beside the artwork".
   *
   * This measured `panel.x > art.x + art.width` — the panel in the text column
   * of a SIDEWAYS card. There is no sideways card any more at any width: the
   * phone tile is two-across and vertical, and from `sm` the tile was already a
   * column. So the geometry it asserted cannot be true anywhere, and re-pointing
   * it to another viewport would not save it.
   *
   * What it was actually protecting is kept, because that defect is still
   * possible: the score was once drawn full-width at the BOTTOM of the card,
   * below the synopsis and the availability block, which pushed the card ~75px
   * taller and put the number nowhere near the thing it describes. So the
   * assertion becomes the vertical form of the same rule — the panel follows the
   * artwork immediately, separated only by the title and its meta line, and it
   * comes BEFORE where-to-watch rather than after it.
   */
  test('follows the artwork immediately — the number is not stranded at the foot', async ({ page }) => {
    await open(page);
    const art = (await card(page).locator('.wv-card-art').boundingBox())!;
    const p = (await panel(page).boundingBox())!;
    const where = (await card(page).getByTestId('where-to-watch').boundingBox())!;

    expect(p.y, 'the panel is above the artwork').toBeGreaterThan(art.y);
    // Only the title (two lines) and the type/year line separate them.
    const gap = p.y - (art.y + art.height);
    expect(gap, `${Math.round(gap)}px between the artwork and the score`).toBeLessThanOrEqual(70);
    // …and the score still leads the availability answer, not the reverse.
    expect(p.y, 'the score fell below where-to-watch').toBeLessThan(where.y);
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

// The whole block is about the RATINGS ROW, which is `sm`-and-up on a card —
// see FULL_CARD. The data-honesty rules it encodes (never a placeholder dash,
// "not available" said once in words, one constant height) are unchanged; only
// the width they are measured at moved to one where the row is on the card.
test.describe('an unavailable rating is not drawn as a dash', () => {
  test('a source we do not hold simply is not there', async ({ page }) => {
    await open(page, FULL_CARD, { standardScore: 81, imdb: 7.8 });
    const chips = card(page).locator('.wv-ratings-row > span');
    await expect(chips).toHaveCount(1);
    await expect(chips.first()).toContainText('7.8');
    expect(await card(page).innerText(), 'a placeholder dash is back').not.toContain('–');
  });

  test('holding none of them is stated in words, once', async ({ page }) => {
    await open(page, FULL_CARD, { standardScore: 81 });
    await expect(card(page).getByTestId('ratings-none')).toBeVisible();
    await expect(card(page).getByTestId('ratings-none')).toContainText(/not available/i);
    expect(await card(page).innerText()).not.toContain('–');
  });

  test('and the row is the same height either way, so nothing moves', async ({ page }) => {
    await open(page, FULL_CARD, FULL);
    const full = (await card(page).locator('.wv-ratings-row').first().boundingBox())!.height;
    await open(page, FULL_CARD, { standardScore: 81 });
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
  // The taste sentence is `sm`-and-up on a card — see FULL_CARD.
  test('speaks when the rated history genuinely supports it', async ({ page }) => {
    await page.setViewportSize({ width: FULL_CARD, height: 1000 });
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

  // At FULL_CARD too: on a phone card the block is not rendered at all, so
  // "silent" would pass for the wrong reason. This asserts it stays silent
  // where it CAN speak.
  test('and is SILENT — not boilerplate — when there is nothing personal to say', async ({ page }) => {
    await open(page, FULL_CARD); // dna mock: sampleSize 0, no fit
    await expect(card(page).getByTestId('card-fit')).toHaveCount(0);
    const text = await card(page).innerText();
    expect(text).not.toMatch(/personalization status/i);
    expect(text).not.toMatch(/based on the title’s themes/i);
    expect(text).not.toMatch(/rate a few more titles/i);
  });
});

// The synopsis is `sm`-and-up on a card — see FULL_CARD.
test.describe('the synopsis knows its place', () => {
  test('stops at three lines and offers the rest', async ({ page }) => {
    await open(page, FULL_CARD);
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
    await open(page, FULL_CARD, FULL);
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

  /**
   * OWNER-DIRECTED REVERSAL: the row CLOSES the card, it does not lead it.
   *
   * It was moved to the top earlier so you could act without scrolling past
   * the poster and the score. That solved reachability and left the real
   * complaint standing: "FOR / AGAINST / SAVE do not stay vertically aligned
   * across cards because card content heights vary." A row pinned to the top
   * is at a constant offset from the top and says nothing about the card.
   *
   * The approved architecture is MEDIA → CONTENT → FLEXIBLE SPACE → ACTION
   * ROW, anchored at the bottom, so spare space collects above the row and
   * every card in a grid row shares one baseline. The baseline itself is
   * proven in card-alignment.spec.ts (including a negative control: with
   * `mt-auto` neutralised the same fixture goes 0px → 20px ragged).
   *
   * What this test still owns is the AIR: the buttons must not be crowded by
   * whatever now sits above them, and the row must keep a visible edge.
   */
  test('close the card — anchored at the floor, with air above the buttons', async ({ page }) => {
    await open(page);
    const layout = await card(page).evaluate((el) => {
      const rowEl = el.querySelector('.wv-act-row')!;
      const row = rowEl.getBoundingClientRect();
      const art = el.querySelector('.wv-card-art')!.getBoundingClientRect();
      const buttons = [...rowEl.querySelectorAll('button, a')].map((b) => b.getBoundingClientRect().bottom);
      const buttonTops = [...rowEl.querySelectorAll('button, a')].map((b) => b.getBoundingClientRect().top);
      return {
        rowTop: Math.round(row.top),
        rowBottom: Math.round(row.bottom),
        artBottom: Math.round(art.bottom),
        buttonTop: Math.round(Math.min(...buttonTops)),
        cardBottom: Math.round(el.getBoundingClientRect().bottom),
        rowBorder: getComputedStyle(rowEl).borderTopWidth,
      };
    });
    // The row is BELOW the artwork now, and sits on the floor of the card.
    expect(layout.rowTop, 'the decision row is not below the artwork').toBeGreaterThan(layout.artBottom);
    expect(layout.cardBottom - layout.rowBottom, 'the row is not anchored to the card floor').toBeLessThanOrEqual(2);
    // Whatever sits above must not crowd the buttons — the row keeps its own
    // top padding, same guarantee the old top-anchored version measured.
    expect(layout.buttonTop - layout.rowTop, 'content touches the buttons').toBeGreaterThanOrEqual(6);
    // A visible separator, not just space.
    expect(layout.rowBorder, 'the decision row lost its edge').not.toBe('0px');
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
// The facts line is `sm`-and-up on a card — see FULL_CARD. (These passed at
// 390 for the wrong reason: `toContainText` reads a `display:none` node's text
// happily, so they were asserting the content of a block nobody could see.)
test.describe('the space beside the poster', () => {
  test('carries the facts we already hold', async ({ page }) => {
    await open(page, FULL_CARD);
    const facts = card(page).getByTestId('card-facts');
    await expect(facts).toContainText('1h 45m');
    await expect(facts).toContainText('PG-13');
    await expect(facts).toContainText('Crime');
    await expect(facts).toContainText('Thriller');
  });

  test('claims nothing when TMDB gave us nothing', async ({ page }) => {
    await open(page, FULL_CARD, FULL, null);
    await expect(card(page).getByTestId('card-facts')).toHaveCount(0);
  });

  /**
   * RETIRED ASSUMPTION: "the column beside the poster".
   *
   * This measured `art.bottom - body.lastChild.bottom` — how much of the text
   * column ALONGSIDE a sideways poster was left black. A vertical card has no
   * column beside the poster, so on the new tile the artwork's bottom is above
   * the body entirely and the old expression is a large negative number that
   * passes the `<= 24` check without measuring anything.
   *
   * The defect it existed for — a card that reserves space and then leaves it
   * empty — is still worth guarding, so it is measured the way it now shows up:
   * slack between the body's last child and the bottom of the body itself.
   */
  test('is filled, not merely occupied', async ({ page }) => {
    await open(page);
    const slack = await card(page).evaluate((el) => {
      const body = el.querySelector('.wv-card-body')!;
      const last = body.lastElementChild!.getBoundingClientRect();
      return Math.round(body.getBoundingClientRect().bottom - last.bottom);
    });
    expect(slack, `${slack}px of dead space at the foot of the card body`).toBeLessThanOrEqual(24);
  });
});

// At FULL_CARD: the order runs through the facts line and the synopsis, and
// both are `sm`-and-up on a card (see FULL_CARD). On a phone tile the order
// that survives — ruling, then score, then availability — is asserted by
// 'follows the artwork immediately' above.
test('the reading order down the card is what a decision needs', async ({ page }) => {
  await open(page, FULL_CARD);
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
  // THE ORDER A DECISION IS MADE IN, top to bottom:
  //   what it is (facts) → how well it fits you (score) → what it is about
  //   (synopsis) → what you want to DO about it (actions).
  // The actions moved from the top to the bottom on request; the glance order
  // above them is unchanged, and the row is now the card's last word rather
  // than its first. See card-alignment.spec.ts for why the position matters.
  expect(order.facts).toBeLessThan(order.score);
  expect(order.score).toBeLessThan(order.synopsis);
  expect(order.synopsis, 'the decision row no longer closes the card').toBeLessThan(order.actions);
});
