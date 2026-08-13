import { test, expect, type Page } from '@playwright/test';

/**
 * THE LANDING "EXAMPLE VERD1CT" IS THE PRODUCT, NOT A DRAWING OF IT.
 *
 * The section used to render a bespoke horizontal report — a thumbnail poster
 * in an oversized empty box, a standalone FOR pill, ± evidence bullets outside
 * the card, availability as a sentence, and its own underlined link. A visitor
 * who signed in never saw that layout again.
 *
 * These assertions pin the replacement: the REAL `PosterCard` and the REAL
 * "Why this Verd1ct?" panel, in the shipped anonymous state (no Taste DNA, so
 * no invented Match), at a production card's proportions on a laptop and the
 * production row card on a phone. Screenshots land in test-results/mobile/.
 */
const RATINGS = { standardScore: 88, tomatometer: 97, rtAudience: 98, imdb: 9.2 };
const FACTS = { runtimeMinutes: 175, contentRating: 'R', genres: ['Drama', 'Crime'] };
const SYNOPSIS =
  'Spanning the years 1945 to 1955, a chronicle of the fictional Italian-American Corleone crime family, and the reluctant son who inherits it.';
/** Two real services, no logo paths — the documented ProviderLogos state when
 *  TMDB gave us no logo, so the strip renders without reaching the network. */
const PROVIDERS = {
  region: 'US',
  options: [
    // TMDB's own spellings — the brand registry is what turns them into the
    // official wordmarks ("Paramount+", "Fubo") wherever they are shown.
    { name: 'Paramount Plus', type: 'flatrate', link: null, logo: null },
    { name: 'fuboTV', type: 'flatrate', link: null, logo: null },
    { name: 'Prime Video', type: 'rent', link: null, logo: null },
  ],
  checkedAt: '2026-08-13T00:00:00.000Z',
};

/** Every per-title path the card asked for, so the identity it resolves can be
 *  asserted rather than assumed. */
const titleRequests: string[] = [];

async function open(page: Page, w: number) {
  titleRequests.length = 0;
  await page.setViewportSize({ width: w, height: 1100 });
  await page.route('**/api/ratings/**', (r) => {
    titleRequests.push(new URL(r.request().url()).pathname);
    return r.fulfill({ json: { ratings: RATINGS, overview: SYNOPSIS, facts: FACTS, providers: PROVIDERS } });
  });
  // THE TRUE ANONYMOUS ANSWER. `/api/dna` returns exactly this for a visitor
  // with no account — the section must be honest against the real response,
  // not against a stubbed profile.
  await page.route('**/api/dna/**', (r) => r.fulfill({ json: { dna: null } }));
  await page.route('**/api/availability/refresh', (r) => r.fulfill({ json: { available: false } }));
  await page.goto('/dev/landing-example', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('example-verdict-card')).toBeVisible();
  await page.waitForTimeout(500);
}

const card = (page: Page) => page.getByTestId('example-verdict-card').locator('.card').first();

test.describe('it renders the production card, not a landing-only one', () => {
  test('the real PosterCard structure is what is on screen', async ({ page }) => {
    await open(page, 1440);
    // The shipped card's own classes — art box, body, foot, tile edge.
    await expect(card(page)).toHaveClass(/wv-tile/);
    await expect(card(page).locator('.wv-card-art')).toHaveCount(1);
    await expect(card(page).locator('.wv-card-body')).toHaveCount(1);
    await expect(card(page).locator('.wv-card-foot')).toHaveCount(1);
    // And every production block the card carries.
    await expect(card(page).getByTestId('verdict-panel')).toBeVisible();
    await expect(card(page).getByTestId('card-facts')).toBeVisible();
    await expect(card(page).getByTestId('where-to-watch')).toBeVisible();
    await expect(card(page).getByTestId('why-verdict')).toBeVisible();
  });

  test('nothing from the old bespoke report survives', async ({ page }) => {
    await open(page, 1440);
    await expect(page.getByText('Strong evidence — independent sources agree.')).toHaveCount(0);
    await expect(page.getByText('illustrative — no taste profile yet')).toHaveCount(0);
    await expect(page.getByText(/^Available on /)).toHaveCount(0);
    await expect(page.getByText(/^The Alternate:/)).toHaveCount(0);
    await expect(page.getByText('sample presentation, not current availability')).toHaveCount(0);
    await expect(page.getByText('Enter WatchVerd1ct for your own Verd1ct →')).toHaveCount(0);
    // No courtroom/jury language anywhere in the section — that ceremony
    // belongs to the Live Jury / Verdict Room, never the front door.
    await expect(page.getByTestId('example-verdict').getByText(/courtroom|jury|gavel/i)).toHaveCount(0);
  });

  test('the card resolves the canonical entity movie:238, by id', async ({ page }) => {
    await open(page, 1440);
    // Whatever the card hydrates, it hydrates for the one fixed title — there
    // is no search step whose ordering could hand it a different one.
    expect(titleRequests.length).toBeGreaterThan(0);
    for (const path of titleRequests) expect(path).toBe('/api/ratings/movie/238');
    await expect(card(page).getByRole('link', { name: /Poster for The Godfather/ })).toHaveAttribute(
      'href',
      '/app/title/movie/238',
    );
  });

  test('availability is the provider strip, never a sentence', async ({ page }) => {
    await open(page, 1440);
    const strip = card(page).getByTestId('where-to-watch-providers');
    await expect(strip).toBeVisible();
    await expect(strip.getByTestId('where-to-watch-line')).toHaveCount(3);
    // The OFFICIAL wordmarks, from the one brand registry — not TMDB's raw
    // labels, and never a television emoji.
    await expect(strip).toContainText('Paramount+');
    await expect(strip).toContainText('Fubo');
    await expect(strip).not.toContainText('Paramount Plus');
    await expect(strip).not.toContainText('fuboTV');
  });
});

test.describe('the product tour', () => {
  test('desktop: six gutter callouts, and not one of them covers the card', async ({ page }) => {
    await open(page, 1440);
    const callouts = page.getByTestId('tour-callout');
    await expect(callouts).toHaveCount(6);
    const cardBox = (await card(page).boundingBox())!;
    const boxes: { x: number; y: number; width: number; height: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const b = (await callouts.nth(i).boundingBox())!;
      boxes.push(b);
      // NO OVERLAP WITH THE CARD, measured — an annotation must never sit on
      // top of a provider tile, a link or the "Why this Verd1ct?" summary.
      const overlaps =
        b.x < cardBox.x + cardBox.width && b.x + b.width > cardBox.x &&
        b.y < cardBox.y + cardBox.height && b.y + b.height > cardBox.y;
      expect(overlaps, `callout ${i + 1} overlaps the card`).toBe(false);
      // And each one still points at the card's vertical span, not off in space.
      expect(b.y + b.height).toBeGreaterThan(cardBox.y);
      expect(b.y).toBeLessThan(cardBox.y + cardBox.height);
    }
    // AND THEY DO NOT COLLIDE WITH EACH OTHER. Two callouts running into one
    // another is the same defect as one covering the card — unreadable, and
    // the reason the vertical offsets are tuned rather than guessed.
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, c = boxes[j]!;
        const hit =
          a.x < c.x + c.width && a.x + a.width > c.x && a.y < c.y + c.height && a.y + a.height > c.y;
        expect(hit, `callouts ${i + 1} and ${j + 1} overlap`).toBe(false);
      }
    }
    // The legend is the phone presentation; a laptop must not show both.
    await expect(page.getByTestId('tour-legend')).toBeHidden();
    await page.screenshot({ path: 'test-results/mobile/landing-tour-desktop.png', fullPage: true });
  });

  test('the Match callout promises a Match only AFTER Taste DNA', async ({ page }) => {
    await open(page, 1440);
    const match = page.getByTestId('tour-callout').filter({ hasText: 'Your Match' });
    await expect(match).toContainText('Taste DNA');
    await expect(match).toContainText('never invent');
  });

  test('mobile 390: no leader lines, a numbered legend under the card instead', async ({ page }) => {
    await open(page, 390);
    await expect(page.getByTestId('tour-gutter-left')).toBeHidden();
    await expect(page.getByTestId('tour-gutter-right')).toBeHidden();
    const legend = page.getByTestId('tour-legend');
    await expect(legend).toBeVisible();
    await expect(legend).toContainText('What you’re looking at');
    await expect(legend.getByTestId('tour-legend-item')).toHaveCount(6);
    // Directly below the card, not floating over it.
    const cardBox = (await card(page).boundingBox())!;
    const legendBox = (await legend.boundingBox())!;
    expect(legendBox.y).toBeGreaterThan(cardBox.y + cardBox.height);
    await page.screenshot({ path: 'test-results/mobile/landing-tour-390.png', fullPage: true });
  });
});

test.describe('the anonymous state is the real one, not invented personalization', () => {
  test('the panel says WatchVerd1ct, not "Your VERD1CT", and shows the general score', async ({ page }) => {
    await open(page, 1440);
    const panel = card(page).getByTestId('verdict-panel');
    await expect(panel).toContainText('WatchVerd1ct');
    await expect(panel).not.toContainText('Your VERD1CT');
    // The general quality number the server passed as `objectiveScore`.
    await expect(panel).toContainText('88');
    await expect(panel.getByTestId('verdict-call')).toBeVisible();
  });

  test('no fabricated Match, and the section says why', async ({ page }) => {
    await open(page, 1440);
    // CardFit is the "why YOU'd like it" line; with no DNA it renders nothing.
    await expect(card(page).getByTestId('card-fit')).toHaveCount(0);
    await expect(page.getByTestId('example-verdict-anon')).toHaveText(
      'The general Verd1ct. Build your Taste DNA and it becomes your Match.',
    );
    await page.getByTestId('why-verdict').getByText('Why this Verd1ct?').click();
    await expect(page.getByTestId('why-verdict')).toContainText('No personal taste signal yet');
  });

  test('why-watch and watch-out live inside the card, not as loose ± rows', async ({ page }) => {
    await open(page, 1440);
    const why = card(page).getByTestId('why-verdict');
    await why.getByText('Why this Verd1ct?').click();
    await expect(why.getByTestId('why-matched')).toBeVisible();
    await expect(why.getByTestId('why-know')).toBeVisible();
    await page.screenshot({ path: 'test-results/mobile/landing-example-why-open.png', fullPage: true });
  });

  test('the availability row uses the official provider treatment, not "📺 fuboTV"', async ({ page }) => {
    await open(page, 1440);
    const why = card(page).getByTestId('why-verdict');
    await why.getByText('Why this Verd1ct?').click();
    const row = why.getByTestId('why-availability');
    await expect(row).toBeVisible();
    // The site's provider chip, the access level and the confidence as their
    // own parts — and the OFFICIAL wordmark, not TMDB's raw label.
    await expect(row).toContainText('Paramount+');
    await expect(row).not.toContainText('Paramount Plus');
    await expect(row).toContainText('Included with subscription');
    await expect(row).toHaveAttribute('data-confidence', 'likely');
    // No television emoji anywhere in the panel.
    await expect(why).not.toContainText('📺');
  });

  test('the write actions are off — nothing that answers a tap with an error', async ({ page }) => {
    await open(page, 1440);
    await expect(card(page).getByTestId('card-verdict-for')).toHaveCount(0);
    await expect(card(page).getByTestId('card-verdict-against')).toHaveCount(0);
    await expect(card(page).getByTestId('w-check-238')).toHaveCount(0);
  });
});

test.describe('the transition and the one entrance', () => {
  test('uses the site primary CTA, same class and destination as the hero', async ({ page }) => {
    await open(page, 1440);
    await expect(page.getByTestId('example-verdict-transition')).toContainText(
      'This is the generic verdict. Yours gets personal.',
    );
    const cta = page.getByTestId('example-verdict-cta');
    await expect(cta).toHaveClass(/btn-watchverdict/);
    await expect(cta).toContainText('Enter WatchVerd1ct');
    await expect(cta).toHaveAttribute('href', '/app');
  });
});

test.describe('proportions', () => {
  test('desktop: a production-width card, not a full-bleed rectangle of dead space', async ({ page }) => {
    await open(page, 1440);
    const box = (await card(page).boundingBox())!;
    const art = (await card(page).locator('.wv-card-art').boundingBox())!;
    // A `poster-grid` column, not a banner.
    expect(box.width, `card is ${Math.round(box.width)}px wide`).toBeLessThanOrEqual(340);
    expect(box.width).toBeGreaterThan(240);
    // The poster owns the card's full width and leads it — the old layout gave
    // an 80px thumbnail a 512px box to rattle around in.
    expect(art.width / box.width, 'the poster spans the card').toBeGreaterThan(0.85);
    expect(art.y).toBeLessThan(box.y + box.height / 2);
    await page.screenshot({ path: 'test-results/mobile/landing-example-desktop.png', fullPage: true });
  });

  test('mobile 390: collapses into the existing phone card pattern', async ({ page }) => {
    await open(page, 390);
    const box = (await card(page).boundingBox())!;
    const art = (await card(page).locator('.wv-card-art').boundingBox())!;
    // Full-width, exactly like a phone card in the app.
    expect(box.width).toBeGreaterThan(300);
    // `.wv-card`'s row: the poster is ~38% of the card and the text sits beside
    // it, which is the shipped phone card — not a custom landing stack.
    expect(art.width / box.width).toBeGreaterThan(0.3);
    expect(art.width / box.width).toBeLessThan(0.5);
    expect(art.height / art.width).toBeGreaterThan(1.4); // still true 2:3
    await page.screenshot({ path: 'test-results/mobile/landing-example-390.png', fullPage: true });
  });

  test('no sideways scroll at 390 or 1440', async ({ page }) => {
    for (const w of [390, 1440]) {
      await open(page, w);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `overflow at ${w}`).toBeLessThanOrEqual(1);
    }
  });
});
