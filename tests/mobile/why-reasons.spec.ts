import { test, expect, type Page } from '@playwright/test';

/**
 * THE CASE AGAINST, ON THE CARD — P0-F, PROVED IN A BROWSER.
 *
 * `whyThisTitle.ts` gained a `concern` reason and `WhyThisTitle` wires it to
 * `fit.clash`, the half of the DNA verdict the card had always dropped. Unit
 * tests prove the pure builder emits it; they cannot show that a reader ever
 * SEES it, that it is legible against a poster, that it does not lead the row,
 * and that it does not push a chip outside the card on a 320px phone.
 *
 * These run against `/dev/visual-qa`, which mounts the real `PosterCard` — and
 * therefore the real `WhyThisTitle` — inside the real `.poster-grid`. The two
 * endpoints the card fetches are stubbed, exactly as `cards.spec.ts` stubs the
 * ratings endpoint, because the harness has no Supabase session and no TMDB
 * key. The COMPONENT is real; only its inputs are supplied.
 *
 * Screenshots land in test-results/mobile-artifacts for review.
 */

/* EXACTLY THE SHAPE `matchHighlights` RETURNS — the axis NAME plus the note
   that reads it. Inventing prose here is how the unit tests came to pass on
   words the product never produces, and how "Heads up: Pace" reached a
   deployed card. See src/lib/scoring/dimensions.ts. */
const AGREE = [{ label: 'Pace', note: 'slow burn' }];
const CLASH = [{ label: 'Content edge', note: 'you lean tame' }];

const VIEWPORTS = [
  { name: 'phone-320', w: 320, h: 568 },
  { name: 'phone-390', w: 390, h: 844 },
  { name: 'tablet-834', w: 834, h: 1112 },
  { name: 'desktop-1280', w: 1280, h: 900 },
  { name: 'desktop-1680', w: 1680, h: 1050 },
];

async function open(page: Page, w: number, h: number, fit: unknown) {
  await page.setViewportSize({ width: w, height: h });
  await page.route('**/api/ratings/**', (r) =>
    r.fulfill({
      json: {
        ratings: { standardScore: 84, audience: 78, rtAudience: 81, tomatometer: 90, imdb: 7.8, metacritic: 72 },
        overview: 'A detective works a cold case that everyone else has agreed to forget.',
      },
    }),
  );
  await page.route('**/api/dna/**', (r) =>
    r.fulfill({
      json: {
        dna: {
          score: 78,
          confidence: 0.6,
          tasteScore: 78,
          available: true,
          sampleSize: 24,
          fit,
        },
      },
    }),
  );
  await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
}

/** The concern may sit behind "Why?" — that is the point of the ranking. */
async function revealAll(page: Page) {
  const expanders = page.getByTestId('why-expand');
  for (let i = (await expanders.count()) - 1; i >= 0; i -= 1) {
    await expanders.nth(i).click();
  }
}

for (const { name, w, h } of VIEWPORTS) {
  test(`the concern is shown, and shown as a caution @ ${name}`, async ({ page }) => {
    await open(page, w, h, { agree: AGREE, clash: CLASH });

    const why = page.getByTestId('why-this-title').first();
    await expect(why).toBeVisible();
    const lead = why.getByTestId('why-reason').first();
    await expect(lead).toBeVisible();
    await expect(lead, 'the positive chip names the taste, not the dial').toContainText(/slow burn/i);

    await revealAll(page);
    const concern = page.getByTestId('why-concern').first();
    await expect(concern).toBeVisible();
    /* The chip must READ the dial, not merely name it: the axis and the
       direction the reader leans, both from the DNA response. */
    await expect(concern).toContainText(/^Heads up:/);
    await expect(concern).toContainText(/content edge/i);
    await expect(concern).toContainText(/you lean tame/i);
    await expect(await concern.innerText(), 'a chip that only names the dial says nothing')
      .not.toMatch(/^Heads up:\s*content edge\s*$/i);

    /* AMBER, NOT EMERALD. A caution wearing the colour of an endorsement is
       worse than no caution at all — it reads as another thing to like. */
    const colours = await concern.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, background: cs.backgroundColor, border: cs.borderColor };
    });
    const rgb = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    const [cr, cg, cb] = rgb(colours.color);
    expect(cr, `text colour ${colours.color} must be warm`).toBeGreaterThan(cb!);
    expect(cg!, `text colour ${colours.color} must be warm`).toBeGreaterThan(cb!);
    const [br, bg, bb] = rgb(colours.border);
    expect(br!, `border ${colours.border} must be warm`).toBeGreaterThan(bb!);
    expect(bg!, `border ${colours.border} must be warm`).toBeGreaterThan(bb!);

    /* The CARD, not the viewport. A viewport shot of a wide desktop puts the
       reason row below the fold and proves nothing about the thing under
       test. */
    const card = why.locator('xpath=ancestor::*[contains(@class,"wv-card")][1]');
    await (await card.count() > 0 ? card : why).first().scrollIntoViewIfNeeded();
    await ((await card.count()) > 0 ? card.first() : why).screenshot({
      path: `test-results/mobile-artifacts/why-concern-${name}.png`,
    });
  });

  test(`the concern never leads the row, and never leaves the card @ ${name}`, async ({ page }) => {
    await open(page, w, h, { agree: AGREE, clash: CLASH });
    await revealAll(page);

    const why = page.getByTestId('why-this-title').first();
    const kinds = await why.locator('li[data-testid]').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-testid')),
    );
    expect(kinds.length, 'the row rendered chips').toBeGreaterThan(1);
    expect(kinds[0], 'the first chip is a reason FOR the title').toBe('why-reason');
    expect(kinds).toContain('why-concern');

    // No chip may spill out of the card that owns it, at any width.
    const card = why.locator('xpath=ancestor::*[contains(@class,"wv-card")][1]');
    const cardBox = (await card.boundingBox()) ?? (await why.boundingBox())!;
    const chips = why.locator('li[data-testid]');
    for (let i = 0; i < (await chips.count()); i += 1) {
      const b = (await chips.nth(i).boundingBox())!;
      expect(b.x, `chip ${i} left edge`).toBeGreaterThanOrEqual(cardBox.x - 1);
      expect(b.x + b.width, `chip ${i} right edge`).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
    }

    // And the page itself never scrolls sideways because of it.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
  });
}

/* THE HONEST NO-OP. With no profile the DNA endpoint returns `fit: null`, and
   a recommender that invents a caution is worse than one that stays quiet. */
test('with no taste profile there is no concern at all', async ({ page }) => {
  await open(page, 390, 844, null);
  await revealAll(page);
  await expect(page.getByTestId('why-concern')).toHaveCount(0);
});

/* AND THE OTHER HALF: agreements without clashes must not manufacture one. */
test('agreements alone produce reasons and no caution', async ({ page }) => {
  await open(page, 1280, 900, { agree: AGREE, clash: [] });
  await revealAll(page);
  await expect(page.getByTestId('why-reason').first()).toBeVisible();
  await expect(page.getByTestId('why-concern')).toHaveCount(0);
});
