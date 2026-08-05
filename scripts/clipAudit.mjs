import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';
const ROUTES = (process.env.ROUTES ?? '/dev/verdict,/dev/title-page,/dev/visual-qa,/dev/report-tabs,/dev/verdict-evidence').split(',');
const WIDTHS = (process.env.WIDTHS ?? '320,360,390').split(',').map(Number);

const probe = () => {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    const label = (el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className : '')).slice(0, 160);
    const text = (el.textContent ?? '').trim().slice(0, 90);

    // Horizontal clipping: content wider than the box, and the box hides it.
    const xHidden = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
    if (xHidden && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      const key = 'x|' + label + '|' + text;
      if (!seen.has(key)) { seen.add(key); out.push({ kind: 'clip-x', label, text, scrollW: el.scrollWidth, clientW: el.clientWidth }); }
    }

    // Vertical truncation of copy: line-clamp / ellipsis actually cutting text.
    const clamp = cs.webkitLineClamp;
    const clamped = (clamp && clamp !== 'none') || cs.textOverflow === 'ellipsis';
    if (clamped && el.scrollHeight > el.clientHeight + 1) {
      const key = 'y|' + label + '|' + text;
      if (!seen.has(key)) { seen.add(key); out.push({ kind: 'truncate-y', label, text, clamp, scrollH: el.scrollHeight, clientH: el.clientHeight }); }
    }
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
      const key = 'e|' + label + '|' + text;
      if (!seen.has(key)) { seen.add(key); out.push({ kind: 'ellipsis-x', label, text, scrollW: el.scrollWidth, clientW: el.clientWidth }); }
    }
  }
  const doc = document.documentElement;
  return { findings: out, pageScrollW: doc.scrollWidth, pageClientW: doc.clientWidth };
};

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
let total = 0;
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  for (const route of ROUTES) {
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 60000 });
    } catch { console.log(`[${w}] ${route} — LOAD FAILED`); continue; }
    await page.waitForTimeout(600);
    const { findings, pageScrollW, pageClientW } = await page.evaluate(probe);
    const overflow = pageScrollW > pageClientW + 1 ? ` PAGE-OVERFLOW ${pageScrollW}>${pageClientW}` : '';
    console.log(`\n=== [${w}px] ${route} — ${findings.length} finding(s)${overflow}`);
    for (const f of findings) {
      total++;
      console.log(`  ${f.kind} :: ${f.label}\n      text="${f.text}"\n      ${JSON.stringify(f).slice(0, 300)}`);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(`\nTOTAL FINDINGS: ${total}`);
