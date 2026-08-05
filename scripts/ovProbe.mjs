import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const w of [320, 360, 375, 390, 414, 430]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 } });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:3311/dev/on-tv', { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  const out = await p.evaluate(() => {
    const doc = document.documentElement;
    const over = doc.scrollWidth - doc.clientWidth;
    const rows = [];
    if (over > 1) for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > doc.clientWidth + 1) rows.push({ tag: el.tagName.toLowerCase(), cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60), right: Math.round(r.right), w: Math.round(r.width), text: (el.textContent ?? '').trim().slice(0, 28) });
    }
    return { over, rows: rows.slice(0, 6) };
  });
  console.log(w, JSON.stringify(out));
  await ctx.close();
}
await b.close();
