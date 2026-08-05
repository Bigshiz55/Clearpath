import { chromium } from '@playwright/test';

const B = 'http://127.0.0.1:3311';
const LATE = 'A former Prohibition-era gangster returns to the Lower East Side of Manhattan thirty years later.';
const W = Number(process.env.W ?? 390);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: W, height: 900 } });
const page = await ctx.newPage();
let n = 0;
await page.route('**/api/ratings/**', async (r) => {
  await new Promise((res) => setTimeout(res, 400 + (n++ % 4) * 250));
  await r.fulfill({
    json: { ratings: { standardScore: 84, audience: 78, rtAudience: 81, tomatometer: 90, imdb: 7.8 }, overview: LATE },
  });
});

const measure = () =>
  page.evaluate(() => {
    const card = document.querySelectorAll('[data-testid="qa-grid"] [data-testid="poster-card"], [data-testid="qa-grid"] article, [data-testid="qa-grid"] .card')[0];
    if (!card) return null;
    const walk = (el, depth) => {
      const r = el.getBoundingClientRect();
      const out = [{ depth, tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70), h: Math.round(r.height), text: (el.textContent ?? '').trim().slice(0, 34) }];
      if (depth < 4) for (const c of el.children) out.push(...walk(c, depth + 1));
      return out;
    };
    return { h: Math.round(card.getBoundingClientRect().height), tree: walk(card, 0) };
  });

await page.goto(B + '/dev/visual-qa');
await page.waitForSelector('[data-testid="qa-grid"]');
const a = await measure();
await page.waitForTimeout(2600);
const b = await measure();

console.log(`card height ${a.h} -> ${b.h}  (delta ${b.h - a.h}) @ ${W}px`);
for (let i = 0; i < Math.max(a.tree.length, b.tree.length); i++) {
  const x = a.tree[i], y = b.tree[i];
  if (!x || !y) { console.log(`  [${i}] STRUCTURE CHANGED: ${x ? 'removed' : 'added'} ${(y ?? x).tag}.${(y ?? x).cls}`); continue; }
  if (x.h !== y.h) console.log(`  [${i}] ${'  '.repeat(x.depth)}${x.tag}.${x.cls}  ${x.h} -> ${y.h}   "${y.text}"`);
}
await browser.close();
