import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3311';
const ROUTE = process.env.ROUTE ?? '/dev/report-tabs';
const SEL = process.env.SEL ?? 'header.card';
const W = Number(process.env.W ?? 320);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE + ROUTE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(600);

const out = await page.evaluate((sel) => {
  const host = document.querySelector(sel);
  if (!host) return { error: 'no host for ' + sel };
  const hr = host.getBoundingClientRect();
  const rows = [];
  for (const el of host.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const overRight = r.right - hr.right;
    const overLeft = hr.left - r.left;
    if (overRight > 0.5 || overLeft > 0.5) {
      rows.push({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 110),
        text: (el.textContent ?? '').trim().slice(0, 60),
        left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
        overRight: Math.round(overRight), overLeft: Math.round(overLeft),
      });
    }
  }
  return { host: { left: Math.round(hr.left), right: Math.round(hr.right), w: Math.round(hr.width) }, rows };
}, SEL);

console.log(JSON.stringify(out, null, 2));
await browser.close();
