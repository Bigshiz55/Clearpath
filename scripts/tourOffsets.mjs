/**
 * Measure the landing example card's regions so the tour's callout offsets are
 * derived from the rendered card rather than guessed. Run after a card layout
 * change; paste the numbers into `TOUR_STOPS` in ExampleTour.tsx.
 *
 * Usage: node scripts/tourOffsets.mjs [baseUrl]
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3211';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
await page.goto(`${BASE}/dev/landing-example`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const out = await page.getByTestId('example-verdict-card').evaluate((el) => {
  const card = el.getBoundingClientRect();
  const at = (sel) => {
    const e = el.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { top: Math.round(r.top - card.top), height: Math.round(r.height) };
  };
  return {
    cardHeight: Math.round(card.height),
    art: at('.wv-card-art'),
    score: at('.wv-score'),
    reason: at('.wv-reason'),
    providers: at('[data-testid="where-to-watch"]'),
    whyVerdict: at('[data-testid="why-verdict"]'),
    footChildren: [...(el.querySelector('.wv-card-foot')?.children ?? [])].map((c) => ({
      cls: c.className.toString().slice(0, 44),
      top: Math.round(c.getBoundingClientRect().top - card.top),
      h: Math.round(c.getBoundingClientRect().height),
    })),
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
