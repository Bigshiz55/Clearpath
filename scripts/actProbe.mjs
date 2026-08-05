import { chromium } from '@playwright/test';

const B = 'http://127.0.0.1:3311';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

for (const w of [320, 375, 390, 414]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(B + '/dev/on-tv', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const out = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="card-verdict-against"]');
    if (!btn) return { error: 'no against button' };
    const label = btn.querySelector('.wv-act-label');
    const b = btn.getBoundingClientRect();
    const l = label.getBoundingClientRect();
    const cs = getComputedStyle(btn);
    const row = btn.closest('.wv-act-row');
    const kids = row ? [...row.querySelectorAll('.wv-act')].map((k) => Math.round(k.getBoundingClientRect().width)) : [];
    return {
      btnW: Math.round(b.width), labelW: Math.round(l.width),
      leftSlack: Math.round(l.x - b.x), rightSlack: Math.round(b.x + b.width - (l.x + l.width)),
      padding: cs.paddingInlineStart + '/' + cs.paddingInlineEnd,
      rowW: row ? Math.round(row.getBoundingClientRect().width) : null,
      buttons: kids,
      rowLines: row ? new Set([...row.querySelectorAll('.wv-act')].map((k) => Math.round(k.getBoundingClientRect().y))).size : null,
      iconShown: !!btn.querySelector('.wv-act-icon') && getComputedStyle(btn.querySelector('.wv-act-icon')).display !== 'none',
    };
  });
  console.log(w, JSON.stringify(out));
  await ctx.close();
}
await browser.close();
