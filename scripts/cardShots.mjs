/**
 * BEFORE / AFTER visual evidence for the card + trailer redesign.
 *
 * Usage: node scripts/cardShots.mjs <outDir> [baseUrl]
 *
 * ── ON THE TRAILER SHOTS ──────────────────────────────────────────────────
 * The harness has no TMDB key and this sandbox has no route to YouTube, so
 * `/api/trailer` and the youtube-nocookie embed are STUBBED. The stub is a
 * deliberately obvious synthetic slate that says so on its face — the point of
 * these shots is the GEOMETRY (a real <iframe> of the real dimensions mounted
 * in the media frame, with the whole card still on screen), and dressing the
 * stub up as real key art would make the screenshot a lie about what ran.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'test-results/shots';
const BASE = process.argv[3] ?? 'http://127.0.0.1:3211';
mkdirSync(OUT, { recursive: true });

const RATINGS = { standardScore: 81, tomatometer: 91, rtAudience: 78, imdb: 7.8 };
const FACTS = { runtimeMinutes: 105, contentRating: 'PG-13', genres: ['Crime', 'Thriller', 'Mystery'] };
const SYNOPSIS =
  'A weary detective returns to the coastal town he grew up in to investigate a disappearance everybody there would rather forget, and finds his own family at the centre of it — a case the town buried once and would happily bury again.';

const PROVIDERS = {
  1000: ['Netflix'],
  1001: [],
  1002: ['Netflix', 'Hulu', 'Max', 'Disney+', 'Peacock'],
  1003: ['Prime Video'],
  1004: [],
  1005: ['Apple TV', 'Hulu'],
};

const DNA_STRONG = {
  score: 81, confidence: 0.6, tasteScore: 78, available: true, sampleSize: 96,
  fit: { agree: [{ label: 'slow-burn crime' }, { label: 'ensemble casts' }], clash: [] },
};
const DNA_NONE = { score: 74, confidence: 0, tasteScore: null, available: false, sampleSize: 0, fit: null };

const STUB_EMBED = `<html><head><meta charset="utf-8"></head><body style="margin:0;height:100%;background:#0a0d16;
  display:flex;align-items:center;justify-content:center;font-family:system-ui;color:#7d8aa8">
  <div style="text-align:center;line-height:1.5">
    <div style="font-size:34px">▶</div>
    <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase">Trailer embed</div>
    <div style="font-size:9px;opacity:.7">stubbed — no TMDB key in harness</div>
  </div></body></html>`;

async function stub(page, { trailers = false } = {}) {
  await page.route('**/api/ratings/**', (r) => {
    const id = Number(new URL(r.request().url()).pathname.split('/').pop());
    const names = PROVIDERS[id] ?? [];
    return r.fulfill({
      json: {
        ratings: RATINGS,
        overview: SYNOPSIS,
        facts: FACTS,
        providers: names.length
          ? { region: 'US', checkedAt: '2026-08-01T00:00:00Z', options: names.map((name) => ({ name, type: 'flatrate', link: null, logo: null })) }
          : null,
      },
    });
  });
  await page.route('**/api/dna/**', (r) => {
    const id = Number(new URL(r.request().url()).pathname.split('/').pop());
    return r.fulfill({ json: { dna: id % 2 === 0 ? DNA_STRONG : DNA_NONE } });
  });
  await page.route('**/api/availability/refresh', (r) => r.fulfill({ json: { available: false } }));
  await page.route('**/api/quicklook/**', (r) =>
    r.fulfill({
      json: {
        id: 1000, mediaType: 'movie', title: 'Se7en', year: 1995, overview: SYNOPSIS,
        backdropUrl: null, posterUrl: null,
        trailerUrl: 'https://www.youtube.com/watch?v=stubtrailer1',
        genres: ['Crime', 'Thriller', 'Mystery'], contentRating: 'R', status: null, runtime: '2h 7m',
        score: 81, standardScore: 81, ratings: RATINGS, where: ['Netflix'],
      },
    }),
  );
  if (trailers) {
    await page.route('**/api/trailer/**', (r) =>
      r.fulfill({ json: { trailer: { videoId: 'stubtrailer1', official: true, type: 'Trailer', autoplayEligible: true } } }),
    );
    await page.route('https://www.youtube-nocookie.com/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: STUB_EMBED }),
    );
  }
}

/** Dismiss the docket coach-mark so it does not sit over the first card. */
async function calmHarness(page) {
  await page.evaluate(() => {
    try {
      window.localStorage.setItem('wv.docket.coach.v1', 'done');
      window.localStorage.setItem('wv.coach.wcheck.v1', 'done');
    } catch { /* ignore */ }
  });
  const got = page.getByTestId('w-coach-dismiss').first();
  if (await got.count()) await got.click().catch(() => {});
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

async function shot(name, { width, height, path: url, prepare, trailers = false }) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  await stub(page, { trailers });
  await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });
  await calmHarness(page);
  await page.waitForTimeout(900);
  if (prepare) await prepare(page);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`✓ ${name}.png (${width}×${height})`);
  await ctx.close();
}

// 3 — the ordinary grid, three across, before any preview.
await shot('03-grid-three-up-poster', { width: 1100, height: 900, path: '/dev/visual-qa' });

// 4 — the SAME grid with the centre card's trailer playing. The proof shot.
await shot('04-grid-three-up-trailer-playing', {
  width: 1100, height: 900, path: '/dev/visual-qa', trailers: true,
  prepare: async (page) => {
    const cards = page.getByTestId('qa-grid').locator('> div');
    await cards.nth(1).getByTestId('trailer-play').click();
    await cards.nth(1).getByTestId('trailer-player').waitFor();
    await page.waitForTimeout(700);
  },
});

// 2 — the redesigned Top Picks rail, and the same rail previewing.
await shot('02-top-picks-redesigned', { width: 1440, height: 700, path: '/dev/top10' });
await shot('02b-top-picks-trailer-playing', {
  width: 1440, height: 700, path: '/dev/top10', trailers: true,
  prepare: async (page) => {
    const item = page.locator('[data-testid="rail-item-501"]');
    await item.getByTestId('trailer-play').click();
    await item.getByTestId('trailer-player').waitFor();
    await page.waitForTimeout(700);
  },
});
await shot('02c-top-picks-why-open', {
  width: 1440, height: 700, path: '/dev/top10',
  prepare: async (page) => {
    await page.getByTestId('rail-score-501').click();
    await page.getByTestId('rail-work-501').waitFor();
    await page.waitForTimeout(400);
  },
});

// 5 — More Info, with its own large trailer region.
await shot('05-more-info-with-trailer', {
  width: 1440, height: 900, path: '/dev/visual-qa', trailers: true,
  prepare: async (page) => {
    await page.getByTestId('qa-grid').locator('> div').first().getByTestId('card-more-info').click();
    await page.getByTestId('quicklook').waitFor();
    await page.waitForTimeout(500);
    await page.getByTestId('quicklook-play').click();
    await page.getByTestId('quicklook-trailer').waitFor();
    await page.waitForTimeout(700);
  },
});

// 6 — 390px mobile: the grid, a card previewing, and the More Info sheet.
await shot('06-mobile-390-grid', { width: 390, height: 844, path: '/dev/visual-qa' });
await shot('06b-mobile-390-trailer-playing', {
  width: 390, height: 844, path: '/dev/visual-qa', trailers: true,
  prepare: async (page) => {
    const card = page.getByTestId('qa-grid').locator('> div').first();
    await card.getByTestId('trailer-play').click();
    await card.getByTestId('trailer-player').waitFor();
    await page.waitForTimeout(700);
  },
});
await shot('06c-mobile-390-more-info', {
  width: 390, height: 844, path: '/dev/visual-qa',
  prepare: async (page) => {
    await page.getByTestId('qa-grid').locator('> div').first().getByTestId('card-more-info').click();
    await page.getByTestId('quicklook').waitFor();
    await page.waitForTimeout(600);
  },
});

// The two desktop widths the work order names, for the record.
await shot('07-desktop-1440x900', { width: 1440, height: 900, path: '/dev/visual-qa' });
await shot('08-desktop-1280x800', { width: 1280, height: 800, path: '/dev/visual-qa' });

await browser.close();
console.log(`\nShots in ${OUT}`);
