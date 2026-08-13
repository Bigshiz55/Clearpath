/**
 * CARD GEOMETRY AUDIT — measures the real rendered card, not the intent.
 *
 * Answers three questions with numbers instead of adjectives:
 *   1. How tall is a browse card against the viewport it is browsed in?
 *   2. Do two cards in the same row agree on a height?
 *   3. Does the card stay whole while a trailer plays inside it?
 *
 * Usage: node scripts/cardAudit.mjs <outDir> [baseUrl]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'test-results/card-audit';
const BASE = process.argv[3] ?? 'http://127.0.0.1:3211';
mkdirSync(OUT, { recursive: true });

const RATINGS = { standardScore: 81, tomatometer: 91, rtAudience: 78, imdb: 7.8 };
const FACTS = { runtimeMinutes: 105, contentRating: 'PG-13', genres: ['Crime', 'Thriller', 'Mystery'] };
const SYNOPSIS =
  'A weary detective returns to the coastal town he grew up in to investigate a disappearance everybody there would rather forget, and finds his own family at the centre of it — a case the town buried once and would happily bury again.';

async function stub(page) {
  await page.route('**/api/ratings/**', (r) => r.fulfill({ json: { ratings: RATINGS, overview: SYNOPSIS, facts: FACTS } }));
  await page.route('**/api/dna/**', (r) =>
    r.fulfill({ json: { dna: { score: 81, confidence: 0.4, tasteScore: 78, available: true, sampleSize: 24, fit: { agree: [{ label: 'slow-burn crime' }, { label: 'ensemble casts' }] } } } }),
  );
  await page.route('**/api/availability/refresh', (r) => r.fulfill({ json: { available: false } }));
}

const rows = [];
function record(o) {
  rows.push(o);
  console.log(JSON.stringify(o));
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

for (const vp of [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '390x844', width: 390, height: 844 },
]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  await stub(page);
  await page.goto(`${BASE}/dev/visual-qa`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const cards = page.getByTestId('qa-grid').locator('> div');
  const n = await cards.count();
  const heights = [];
  for (let i = 0; i < n; i++) {
    const b = await cards.nth(i).boundingBox();
    if (b) heights.push(Math.round(b.height));
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  record({
    view: vp.name,
    cardHeights: heights,
    tallest: Math.max(...heights),
    shortest: Math.min(...heights),
    spread: Math.max(...heights) - Math.min(...heights),
    viewportH: vp.height,
    fitsInViewport: Math.max(...heights) <= vp.height,
    horizontalOverflow: overflow,
  });

  await page.screenshot({ path: `${OUT}/grid-${vp.name}.png`, fullPage: false });
  await ctx.close();
}

// The rail.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await stub(page);
  await page.goto(`${BASE}/dev/top10`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const before = await page.getByTestId('top10-items').boundingBox();
  await page.screenshot({ path: `${OUT}/rail-1440x900.png` });
  // Open a score panel and see whether the rail changes height.
  const score = page.getByTestId('rail-score-501');
  if (await score.count()) {
    await score.click();
    await page.waitForTimeout(300);
    const after = await page.getByTestId('top10-items').boundingBox();
    record({ view: 'rail-1440x900', railHeightClosed: Math.round(before.height), railHeightOpen: Math.round(after.height), grewBy: Math.round(after.height - before.height) });
    await page.screenshot({ path: `${OUT}/rail-1440x900-open.png` });
  }
  await ctx.close();
}

await browser.close();
console.log('\n--- SUMMARY ---');
console.table(rows);
