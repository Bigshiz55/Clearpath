import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
p.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 90)));
await p.goto('http://127.0.0.1:3313/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
writeFileSync('/tmp/client2.html', await p.content());
await b.close();
