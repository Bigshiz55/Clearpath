import { chromium } from '@playwright/test';

const B = 'http://127.0.0.1:3311';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
const page = await ctx.newPage();

async function snap(url, label) {
  await page.goto(B + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const out = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="guide-channel"]')];
    return {
      count: rows.length,
      names: rows.map((r) => (r.querySelector('h3')?.textContent ?? '').trim()),
      stats: document.querySelector('[data-testid="guide-stats"]')?.textContent ?? null,
      forYou: document.querySelectorAll('[data-testid="guide-for-you"]').length,
      scoreBadges: [...document.querySelectorAll('[data-testid="score-badge"]')].map((s) => s.textContent?.trim()),
      upNextRows: document.querySelectorAll('[data-testid="guide-up-next"] > div').length,
      remindBtns: document.querySelectorAll('button[data-testid^="guide-remind-"]').length,
      hallmarkUpNext: [...document.querySelectorAll('[data-testid="guide-channel"]')]
        .filter((r) => r.textContent?.includes('Hallmark'))
        .map((r) => r.querySelector('[data-testid="guide-up-next"]')?.textContent ?? ''),
    };
  });
  console.log(`\n### ${label} (${url})`);
  console.log(JSON.stringify(out, null, 2));
  return out;
}

await snap('/dev/channel-guide', 'default');
await snap('/dev/channel-guide?taste=1', 'taste');
await snap('/dev/channel-guide?scored=1', 'scored');

// filter behaviour
await page.goto(B + '/dev/channel-guide', { waitUntil: 'networkidle' });
await page.getByTestId('guide-media-movie').click();
await page.waitForTimeout(300);
console.log('\n### after Movies toggle');
console.log(JSON.stringify(await page.evaluate(() => ({
  names: [...document.querySelectorAll('[data-testid="guide-channel"] h3')].map((h) => h.textContent?.trim()),
  stats: document.querySelector('[data-testid="guide-stats"]')?.textContent,
})), null, 2));
await page.getByTestId('guide-media-tv').click();
await page.waitForTimeout(300);
console.log('### after Shows toggle');
console.log(JSON.stringify(await page.evaluate(() => ({
  names: [...document.querySelectorAll('[data-testid="guide-channel"] h3')].map((h) => h.textContent?.trim()),
})), null, 2));
await page.getByTestId('guide-media-all').click();
await page.getByTestId('guide-cat-sports').click();
await page.waitForTimeout(300);
console.log('### after Sports chip');
console.log(JSON.stringify(await page.evaluate(() => ({
  names: [...document.querySelectorAll('[data-testid="guide-channel"] h3')].map((h) => h.textContent?.trim()),
})), null, 2));

await browser.close();
