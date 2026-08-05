import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await (await b.newContext({ viewport: { width: 390, height: 900 } })).newPage();
for (const u of ['/dev/channel-guide', '/dev/channel-guide?taste=1', '/dev/channel-guide?scored=1']) {
  await p.goto('http://127.0.0.1:3311' + u, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  console.log(u, JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('[data-testid="guide-channel-name"]')].map(e => e.textContent.trim()))));
}
await p.goto('http://127.0.0.1:3311/dev/channel-guide', { waitUntil: 'networkidle' });
console.log('lifetime upnext rows', await p.evaluate(() => {
  const r = [...document.querySelectorAll('[data-testid="guide-channel"]')].find(x => x.textContent.includes('Lifetime'));
  return { n: r.querySelectorAll('[data-testid="guide-up-next"] > div').length, txt: r.querySelector('[data-testid="guide-up-next"]').textContent };
}));
await b.close();
