import { chromium } from '@playwright/test';

const B = 'http://127.0.0.1:3311';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

for (const [w, h] of [[320, 568], [390, 844], [1280, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(B + '/dev/dna-quiz', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const out = await page.evaluate(() => {
    const doc = document.documentElement;
    const rows = [];
    for (const el of document.body.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0) continue;
      if (r.bottom > doc.clientHeight + 1) {
        rows.push({
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
          pos: cs.position,
          top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
          text: (el.textContent ?? '').trim().slice(0, 30),
        });
      }
    }
    return { sh: doc.scrollHeight, ch: doc.clientHeight, bodyH: Math.round(document.body.getBoundingClientRect().height), rows: rows.slice(0, 8) };
  });
  console.log(`\n=== ${w}x${h}  scrollHeight=${out.sh} clientHeight=${out.ch} bodyH=${out.bodyH}`);
  for (const r of out.rows) console.log(' ', JSON.stringify(r));
  await ctx.close();
}
await browser.close();
