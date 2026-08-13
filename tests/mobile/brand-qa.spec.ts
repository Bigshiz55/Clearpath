import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * BRAND QA ACROSS EVERY SURFACE THAT NAMES A SERVICE OR A NETWORK.
 *
 * The rule this suite defends: a streaming brand WatchVerd1ct knows renders its
 * OWN mark; a brand we hold no verified asset for renders its official NAME; a
 * distribution route stays text on purpose; a linear network shows the guide's
 * deliberate monogram until a licensed station logo exists. Nothing anywhere is
 * an emoji.
 *
 * The harness browser cannot reach image.tmdb.org, so `tests/fixtures/
 * provider-logos/` serves the ACTUAL verified bytes for the paths in
 * `providers/assets.ts` — the same images production serves. A path with no
 * fixture is aborted, which is deliberate: it makes an unexpected asset request
 * show up as a broken image rather than passing silently.
 */
const LOGOS = join(__dirname, '..', 'fixtures', 'provider-logos');

async function serveLogos(page: Page) {
  await page.route('**://image.tmdb.org/**', async (r) => {
    const file = join(LOGOS, new URL(r.request().url()).pathname.split('/').pop()!);
    if (existsSync(file)) return r.fulfill({ contentType: 'image/jpeg', body: readFileSync(file) });
    return r.abort();
  });
}

/** Every <img> on the page actually decoded. A brand mark that 404s is worse
 *  than the text fallback it replaced. */
async function noBrokenImages(page: Page) {
  const broken = await page.evaluate(() =>
    [...document.querySelectorAll('img')]
      .filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => i.getAttribute('src')?.slice(0, 80) ?? '(no src)'),
  );
  expect(broken, `broken images: ${broken.join(', ')}`).toEqual([]);
}

/**
 * Brand marks are aspect-preserved — never stretched to fill a box.
 *
 * Scoped to marks, not to every image: a POSTER is allowed to be cropped by
 * `object-cover` (that is the card's design), a company's logo never is.
 */
async function logosNotStretched(page: Page, scope = 'body') {
  const bad = await page.evaluate((sel) => {
    const out: string[] = [];
    for (const i of document.querySelectorAll<HTMLImageElement>(`${sel} img[data-testid="brand-mark"]`)) {
      if (!i.naturalWidth || !i.naturalHeight) continue;
      const fit = getComputedStyle(i).objectFit;
      const natural = i.naturalWidth / i.naturalHeight;
      const drawn = i.clientWidth / i.clientHeight;
      // `contain` guarantees it; anything else must still land near the
      // source's own ratio.
      if (fit !== 'contain' && Math.abs(natural - drawn) / natural > 0.12) {
        out.push(`${i.alt || i.src.slice(-24)} ${natural.toFixed(2)}→${drawn.toFixed(2)} (${fit})`);
      }
    }
    return out;
  }, scope);
  expect(bad, `stretched logos: ${bad.join(' | ')}`).toEqual([]);
}

async function noOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

const WIDTHS = [1440, 390];

/* ---------------------------------------------------------------- 1-3 ---- */
/* Landing example: the card, Where to Watch, and the Why-Verd1ct row.        */
const RATINGS = { standardScore: 88, tomatometer: 97, rtAudience: 98, imdb: 9.2 };
const FACTS = { runtimeMinutes: 175, contentRating: 'R', genres: ['Drama', 'Crime'] };
const PROVIDERS = {
  region: 'US',
  options: [
    // TMDB's own spellings. Three states in one strip: a brand with a verified
    // mark, another with one, and a DISTRIBUTION ROUTE that must stay text.
    { name: 'Paramount Plus', type: 'flatrate', link: null, logo: null },
    { name: 'fuboTV', type: 'flatrate', link: null, logo: null },
    { name: 'Paramount+ Amazon Channel', type: 'flatrate', link: null, logo: null },
    { name: 'A Very Long Regional Streaming Service Name', type: 'rent', link: null, logo: null },
  ],
  checkedAt: '2026-08-13T00:00:00.000Z',
};

for (const w of WIDTHS) {
  test(`landing example @${w}: known brands draw marks, routes and unknowns stay text`, async ({ page }) => {
    await serveLogos(page);
    await page.setViewportSize({ width: w, height: 1200 });
    await page.route('**/api/ratings/**', (r) =>
      r.fulfill({ json: { ratings: RATINGS, overview: 'A chronicle of the Corleone family.', facts: FACTS, providers: PROVIDERS } }),
    );
    await page.route('**/api/dna/**', (r) => r.fulfill({ json: { dna: null } }));
    await page.route('**/api/availability/refresh', (r) => r.fulfill({ json: { available: false } }));
    await page.goto('/dev/landing-example', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('example-verdict-card')).toBeVisible();
    await page.waitForTimeout(400);

    const strip = page.getByTestId('where-to-watch-providers');
    await expect(strip.locator('img[alt*="Paramount+"]')).toHaveCount(1);
    await expect(strip.locator('img[alt*="Fubo"]')).toHaveCount(1);
    // THE ROUTE NEVER WEARS THE BASE BRAND'S MARK. In this strip it does not
    // get a tile at all: `dedupeByBrand` collapses plan/route variants so a
    // card shows one tile per brand, and the FIRST row wins — which is the base
    // Paramount+ subscription, not the Amazon Channel. Three tiles, not four.
    // (That a route resolves to NO asset of its own is pinned separately, in
    // providers/assets.test.ts.)
    await expect(strip.getByTestId('where-to-watch-line')).toHaveCount(3);
    // A brand with no asset degrades to a clean name — never an emoji, and it
    // is truncated rather than allowed to blow the row apart.
    await expect(strip).toContainText('A Very Long Regional');

    // Why this Verd1ct? — the availability row, opened.
    await page.getByTestId('why-verdict').getByText('Why this Verd1ct?').click();
    const row = page.getByTestId('why-availability');
    await expect(row.locator('img[alt*="Paramount+"]')).toHaveCount(1);
    await expect(row).toContainText('Included with subscription');
    await expect(page.getByTestId('why-verdict')).not.toContainText('📺');

    await noBrokenImages(page);
    await logosNotStretched(page);
    await noOverflow(page);
    await page.screenshot({ path: `test-results/mobile/brand-landing-${w}.png`, fullPage: true });
  });
}

/* ------------------------------------------------------------------ 4 ---- */
for (const w of WIDTHS) {
  test(`subscription picker @${w}: every curated service shows its own mark`, async ({ page }) => {
    await serveLogos(page);
    await page.setViewportSize({ width: w, height: 1200 });
    await page.goto('/dev/onboarding', { waitUntil: 'networkidle' });
    // The picker is the last step of the real form — walk to it rather than
    // rendering a stand-in, so this QA is against the shipped screen.
    await page.getByTestId('onboarding-welcome').getByRole('button').first().click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /Continue|Next/ }).first().click();
    await page.waitForTimeout(400);

    // 14 of the 15 curated services have a verified asset; Showtime is the
    // documented upstream gap and renders as its official name.
    const marks = page.locator('img[alt="Netflix"], img[alt="Hulu"], img[alt="Max"], img[alt="Starz"], img[alt="Tubi (free)"], img[alt="Fubo"]');
    expect(await marks.count(), 'curated brands drawing marks').toBeGreaterThanOrEqual(5);
    await expect(page.getByText('Showtime', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('📺');

    await noBrokenImages(page);
    await logosNotStretched(page);
    await noOverflow(page);
    await page.screenshot({ path: `test-results/mobile/brand-picker-${w}.png`, fullPage: true });
  });
}

/* ------------------------------------------------------------------ 5 ---- */
for (const w of WIDTHS) {
  test(`group verdict (ProviderNameList) @${w}: names resolve to marks`, async ({ page }) => {
    await serveLogos(page);
    await page.setViewportSize({ width: w, height: 1200 });
    await page.goto('/dev/court-vote', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    const availability = page.getByTestId('candidate-availability');
    await expect(availability).toBeVisible();
    // The voting floor knows only the NAME "Netflix" — the registry is what
    // turns that into Netflix's mark. This is the surface that used to read
    // "📺 Netflix".
    await expect(availability.locator('img[alt="Netflix"]')).toHaveCount(1);
    await expect(availability).not.toContainText('📺');

    await noBrokenImages(page);
    await logosNotStretched(page);
    await noOverflow(page);
    await page.screenshot({ path: `test-results/mobile/brand-group-${w}.png`, fullPage: true });
  });
}

/* ------------------------------------------------------------------ 6 ---- */
for (const w of WIDTHS) {
  test(`TV channel guide @${w}: deliberate monogram, never a borrowed mark`, async ({ page }) => {
    await serveLogos(page);
    await page.setViewportSize({ width: w, height: 1200 });
    await page.goto('/dev/channel-guide', { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);

    await expect(page.getByTestId('guide-channel').first()).toBeVisible();
    // No station in the stack carries a licensed logo (nothing writes
    // `tv_stations.logo_url` — see BACKLOG.md's coverage report), so every row
    // shows its monogram. The one thing that must never happen is a STREAMING
    // provider's mark standing in for a network.
    await expect(page.locator('[data-testid="guide-channel"] img')).toHaveCount(0);
    await expect(page.getByTestId('guide-channel-name').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('📺');

    await noBrokenImages(page);
    await noOverflow(page);
    await page.screenshot({ path: `test-results/mobile/brand-guide-${w}.png`, fullPage: true });
  });
}

/* ------------------------------------------------------------ contrast --- */
test('brand marks sit on their own light plate, so a dark wordmark stays legible', async ({ page }) => {
  await serveLogos(page);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/dev/onboarding', { waitUntil: 'networkidle' });
  await page.getByTestId('onboarding-welcome').getByRole('button').first().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Continue|Next/ }).first().click();
  await page.waitForTimeout(400);
  // Provider logos arrive in every brand colour, including near-black
  // wordmarks. The chip paints a near-white plate behind the mark rather than
  // trusting the page's dark ground — that is what keeps Apple TV and Starz
  // readable in the same row as Netflix.
  const plate = await page.locator('img[alt="Netflix"]').first().evaluate((i) => getComputedStyle(i.parentElement!).backgroundColor);
  const [r, g, b] = /rgba?\(([^)]+)\)/.exec(plate)![1]!.split(',').map((n) => Number(n.trim()));
  expect(Math.min(r!, g!, b!), `chip plate is ${plate}`).toBeGreaterThan(200);
});
