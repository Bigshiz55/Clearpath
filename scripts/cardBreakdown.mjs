/** Print the height contributed by every region of the browse card. */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3211';
const W = Number(process.argv[3] ?? 1440);
const H = Number(process.argv[4] ?? 900);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.route('**/api/ratings/**', (r) =>
  r.fulfill({ json: { ratings: { standardScore: 81, tomatometer: 91, rtAudience: 78, imdb: 7.8 }, overview: 'A long synopsis '.repeat(30), facts: { runtimeMinutes: 105, contentRating: 'PG-13', genres: ['Crime', 'Thriller', 'Mystery'] }, providers: { flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: null }] } } }),
);
await page.route('**/api/dna/**', (r) =>
  r.fulfill({ json: { dna: { score: 81, confidence: 0.4, tasteScore: 78, available: true, sampleSize: 24, fit: { agree: [{ label: 'slow-burn crime' }, { label: 'ensemble casts' }] } } } }),
);
await page.route('**/api/availability/refresh', (r) => r.fulfill({ json: { available: false } }));
await page.goto(`${BASE}/dev/visual-qa`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);

const out = await page.getByTestId('qa-grid').locator('> div').first().evaluate((el) => {
  const rows = [];
  const push = (label, sel) => {
    const e = el.querySelector(sel);
    if (!e) return rows.push({ label, h: 0, note: 'absent' });
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    rows.push({ label, h: Math.round(r.height), top: Math.round(r.top), mt: cs.marginTop, pt: cs.paddingTop, pb: cs.paddingBottom });
  };
  push('CARD', ':scope');
  push('.wv-card', '.wv-card');
  push('.wv-card-art', '.wv-card-art');
  push('.wv-card-body', '.wv-card-body');
  push('heading', '.wv-card-body > :first-child');
  push('card-facts', '[data-testid="card-facts"]');
  push('.wv-score', '.wv-score');
  push('.wv-card-foot', '.wv-card-foot');
  push('.wv-reason', '.wv-reason');
  push('provider', '[data-testid="where-to-watch"]');
  push('.wv-act-row', '.wv-act-row');
  const foot = el.querySelector('.wv-card-foot');
  const footChildren = foot ? [...foot.children].map((c) => ({ cls: c.className.toString().slice(0, 40), h: Math.round(c.getBoundingClientRect().height) })) : [];
  const bodyChildren = [...el.querySelector('.wv-card-body').children].map((c) => ({ cls: c.className.toString().slice(0, 40) || c.tagName, h: Math.round(c.getBoundingClientRect().height) }));
  return { rows, footChildren, bodyChildren };
});
console.log(`=== ${W}x${H} ===`);
console.table(out.rows);
console.log('body children:'); console.table(out.bodyChildren);
console.log('foot children:'); console.table(out.footChildren);
await browser.close();
