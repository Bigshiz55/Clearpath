import { expect, type Page, type Locator } from '@playwright/test';

/**
 * THE DESKTOP HARNESS FIXTURE.
 *
 * Every desktop spec drives `/dev/visual-qa`, which renders the REAL
 * `PosterCard` (not a copy) six times over a deliberately ragged fixture: a
 * five-character title beside a 97-character one, a title with meta and one
 * without, a null year, no artwork. That raggedness is the input the alignment
 * and hover contracts have to survive.
 *
 * Everything the cards fetch is intercepted here, per title id, so a spec
 * asserts about BEHAVIOUR and never about what TMDB happened to return today.
 * The variation is deliberate and is itself part of the proof:
 *
 *   1000  Se7en (one-line)     trailer ✓   Netflix          84 · STREAM IT
 *   1001  the long title       trailer ✓   Hulu + Max       61 · MAYBE
 *   1002  "A" (one-line, TV)   trailer ✓   no provider      38 · SKIP
 *   1003  accented/CJK title   trailer ✓   Prime Video      72 · STREAM IT
 *   1004  no year, no meta     NO TRAILER  no provider      55 · MAYBE
 *   1005  two-line TV title    trailer ✓   Disney+          90 · STREAM IT
 */

export const HARNESS_IDS = [1000, 1001, 1002, 1003, 1004, 1005] as const;

/** The one title in the fixture that genuinely has no trailer. */
export const NO_TRAILER_ID = 1004;

interface TitleFixture {
  score: number;
  ratings: { standardScore: number; audience: number | null; tomatometer: number | null; imdb: number | null };
  providers: { name: string; type: string; link: string | null; logo: string | null }[] | null;
}

const FIXTURES: Record<number, TitleFixture> = {
  1000: {
    score: 84,
    ratings: { standardScore: 84, audience: 88, tomatometer: 82, imdb: 8.6 },
    providers: [{ name: 'Netflix', type: 'flatrate', link: 'https://example.invalid/n', logo: null }],
  },
  1001: {
    score: 61,
    ratings: { standardScore: 61, audience: 54, tomatometer: 66, imdb: 6.1 },
    providers: [
      { name: 'Hulu', type: 'flatrate', link: 'https://example.invalid/h', logo: null },
      { name: 'Max', type: 'flatrate', link: 'https://example.invalid/m', logo: null },
    ],
  },
  // PROVIDER ABSENT, and absent as a RESULT (`providers: []`) — the card must
  // say so honestly rather than leaving a gap where a logo would be.
  1002: {
    score: 38,
    ratings: { standardScore: 38, audience: 31, tomatometer: 22, imdb: 4.4 },
    providers: [],
  },
  1003: {
    score: 72,
    ratings: { standardScore: 72, audience: 70, tomatometer: 75, imdb: 7.2 },
    providers: [{ name: 'Prime Video', type: 'flatrate', link: 'https://example.invalid/p', logo: null }],
  },
  // NEVER LOOKED (`providers: null`) — the third availability state, and a
  // different sentence from "nothing streams this here".
  1004: {
    score: 55,
    ratings: { standardScore: 55, audience: null, tomatometer: null, imdb: 5.5 },
    providers: null,
  },
  1005: {
    score: 90,
    ratings: { standardScore: 90, audience: 94, tomatometer: 97, imdb: 9.0 },
    providers: [{ name: 'Disney Plus', type: 'flatrate', link: 'https://example.invalid/d', logo: null }],
  },
};

function idFromUrl(url: string): number | null {
  const m = url.match(/\/(?:movie|tv)\/(\d+)/);
  return m ? Number(m[1]) : null;
}

export interface HarnessHandle {
  /** How many times a card asked the server to resolve a trailer. */
  trailerRequests(): number;
  resetTrailerRequests(): void;
}

/**
 * Mount the fixture. Call BEFORE `page.goto` (it installs the routes).
 *
 * `reducedMotion` is passed through to `emulateMedia` because the only honest
 * way to test the reduced-motion path is to let the browser report it, not to
 * poke a flag the component reads.
 */
export async function mountHarness(
  page: Page,
  opts: { reducedMotion?: 'reduce' | 'no-preference' } = {},
): Promise<HarnessHandle> {
  let trailerRequests = 0;

  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: opts.reducedMotion });

  // The per-title hydration every card component shares (ratings, facts,
  // synopsis, providers) — see src/lib/tileFacts.ts.
  await page.route('**/api/ratings/**', (route) => {
    const id = idFromUrl(route.request().url());
    const f = (id != null && FIXTURES[id]) || FIXTURES[1000]!;
    void route.fulfill({
      json: {
        ratings: f.ratings,
        overview:
          'Two detectives, a rookie and a veteran, hunt a serial killer who uses the seven deadly sins as his motives.',
        facts: { runtimeMinutes: 127, certificate: 'R', genres: ['Crime', 'Thriller'] },
        providers: f.providers == null ? null : { options: f.providers, checkedAt: '2026-08-01T00:00:00.000Z' },
      },
    });
  });

  // The personalization signal behind WHY YOU'LL LIKE IT / WATCH OUT. Real
  // agree/clash evidence, so `PersonalizedFit` renders from evidence rather
  // than from a placeholder — and so a spec can assert the words came from it.
  await page.route('**/api/dna/**', (route) => {
    const id = idFromUrl(route.request().url());
    const f = (id != null && FIXTURES[id]) || FIXTURES[1000]!;
    void route.fulfill({
      json: {
        dna: {
          score: f.score,
          confidence: 0.82,
          tasteScore: f.score,
          available: true,
          sampleSize: 140,
          fit: {
            agree: [
              { label: 'Investigative mystery', note: 'you rate these highly' },
              { label: 'Bleak, rain-soaked cities', note: 'a look you keep coming back to' },
            ],
            clash: [{ label: 'Slow burn', note: 'you tend to bail early' }],
          },
        },
      },
    });
  });

  await page.route('**/api/availability/refresh**', (route) => route.fulfill({ json: { available: false } }));

  await page.route('**/api/quicklook/**', (route) => {
    const id = idFromUrl(route.request().url()) ?? 1000;
    const f = FIXTURES[id] ?? FIXTURES[1000]!;
    void route.fulfill({
      json: {
        id,
        mediaType: 'movie',
        title: 'Se7en',
        year: 1995,
        overview:
          'Two detectives, a rookie and a veteran, hunt a serial killer who uses the seven deadly sins as his motives.',
        backdropUrl: null,
        posterUrl: null,
        trailerUrl: id === NO_TRAILER_ID ? null : 'https://www.youtube.com/watch?v=znmZoVkCjpI',
        genres: ['Crime', 'Thriller'],
        contentRating: 'R',
        status: null,
        runtime: '2h 7m',
        score: f.score,
        standardScore: f.ratings.standardScore,
        ratings: f.ratings,
        where: f.providers?.map((p) => p.name) ?? [],
      },
    });
  });

  // THE TRAILER RESOLVER. Counted, because "no request was made" is how the
  // laziness requirement is proved — a component that preloads every card's
  // trailer looks identical on screen and is exactly what must not ship.
  await page.route('**/api/trailer/**', (route) => {
    trailerRequests += 1;
    const id = idFromUrl(route.request().url());
    if (id === NO_TRAILER_ID) {
      void route.fulfill({ json: { trailer: null } });
      return;
    }
    void route.fulfill({
      json: {
        trailer: {
          provider: 'youtube',
          videoId: `vid${id}`,
          source: 'tmdb',
          language: 'en',
          country: 'US',
          type: 'trailer',
          official: true,
          confidence: 95,
          autoplayEligible: true,
        },
      },
    });
  });

  // The embed host is unreachable from the test sandbox; a stub keeps the
  // iframe from hanging the page while still exercising the real embed URL
  // (which the specs assert on for `mute=1`).
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stub</title>' }),
  );
  await page.route('https://www.youtube.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stub</title>' }),
  );

  return {
    trailerRequests: () => trailerRequests,
    resetTrailerRequests: () => {
      trailerRequests = 0;
    },
  };
}

/** Load the grid and wait for the cards to settle. */
export async function openGrid(page: Page, handle?: HarnessHandle): Promise<void> {
  await page.goto('/dev/visual-qa', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
  await expect(page.getByTestId('qa-grid').locator('> div')).toHaveCount(6);
  // Let the per-title hydration land so nothing shifts under the pointer.
  await page.waitForTimeout(700);
  // Park the pointer well clear of the grid: Playwright's mouse starts at
  // (0,0) but any earlier action leaves it where it was, and a cursor resting
  // on a card would arm a hover the spec never asked for.
  await page.mouse.move(5, 5);
  handle?.resetTrailerRequests();
}

export const grid = (page: Page): Locator => page.getByTestId('qa-grid');
export const cards = (page: Page): Locator => grid(page).locator('> div');
export const card = (page: Page, i: number): Locator => cards(page).nth(i);

/** The poster box of card `i` — the hover target and the click target. */
export const posterOf = (page: Page, i: number): Locator => card(page, i).getByTestId('trailer-media');

/**
 * Move the pointer to the centre of a locator without Playwright's own hover
 * actionability dance, so dwell timing is under the spec's control.
 *
 * SCROLL FIRST, MEASURE SECOND. `boundingBox()` is viewport-relative, and the
 * lower rows of a six-card grid start below the fold at 900px tall — moving to
 * an off-screen coordinate is a silent no-op that reads as "hover did nothing"
 * and would have been blamed on the component. (Same family of mistake as the
 * scroll-restoration gotcha: measure only after the viewport has settled.)
 */
export async function pointerTo(page: Page, target: Locator, dx = 0, dy = 0): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error('target has no box');
  const x = box.x + box.width / 2 + dx;
  const y = box.y + box.height / 2 + dy;
  const vp = page.viewportSize();
  if (vp && (x < 0 || y < 0 || x > vp.width || y > vp.height)) {
    throw new Error(`pointer target is outside the viewport at (${Math.round(x)}, ${Math.round(y)})`);
  }
  await page.mouse.move(x, y);
}

/** Park the pointer somewhere that is not a card. */
export async function pointerAway(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
}

/**
 * Count every iframe INSERTION from now on. A preview that restarts looks
 * identical in a snapshot to one that never restarted — only the mutation
 * record tells them apart, which is what makes the jitter assertion real.
 */
export async function watchIframeInsertions(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __wvIframeAdds?: number; __wvObs?: MutationObserver };
    w.__wvObs?.disconnect();
    w.__wvIframeAdds = 0;
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.tagName === 'IFRAME' || node.querySelector('iframe')) w.__wvIframeAdds = (w.__wvIframeAdds ?? 0) + 1;
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    w.__wvObs = obs;
  });
}

export async function iframeInsertions(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __wvIframeAdds?: number }).__wvIframeAdds ?? 0);
}

/** How many trailer players are mounted anywhere on the page. */
export const players = (page: Page): Locator => page.locator('[data-testid="trailer-player"]');
