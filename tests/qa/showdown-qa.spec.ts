import { test, expect } from '@playwright/test';
const OUT = '/tmp/claude-0/-home-user-Clearpath/7bed97c5-9653-5e4e-a7e5-75fc18d685dd/scratchpad/shots';

for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
  test(`showdown visual QA — ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/dev/dna-showdown', { waitUntil: 'domcontentloaded' });

    // 1. COLD OPEN
    await expect(page.getByTestId('showdown-cold-open')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}-1-cold-open.png`, fullPage: false });

    // horizontal overflow check
    const ox = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(ox, `${name} cold open overflows horizontally by ${ox}px`).toBeLessThanOrEqual(1);

    // 2. MATCHUP
    await page.getByTestId('showdown-start').click();
    await expect(page.getByTestId('showdown-pair')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}-2-matchup.png` });

    const ox2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(ox2, `${name} matchup overflows horizontally by ${ox2}px`).toBeLessThanOrEqual(1);

    // poster share of viewport — the whole point of the redesign
    const box = await page.getByTestId('showdown-pair').boundingBox();
    console.log(`[${name}] pair box: ${JSON.stringify(box)} viewport ${vp.width}x${vp.height}`);

    // 3. PLAY THROUGH to results
    for (let i = 0; i < 70; i++) {
      if (await page.getByTestId('showdown-results').isVisible().catch(() => false)) break;
      const rapid = await page.getByTestId('showdown-rapid').isVisible().catch(() => false);
      if (rapid && i < 12) { await page.screenshot({ path: `${OUT}/${name}-3-rapid.png` }); }
      const calib = await page.getByTestId('showdown-calibration').isVisible().catch(() => false);
      if (calib) {
        await page.screenshot({ path: `${OUT}/${name}-4-calibration.png` });
        await page.getByTestId('showdown-calibration-value').nth(7).click();
        await page.waitForTimeout(1100);
        continue;
      }
      const why = await page.getByTestId('showdown-why').isVisible().catch(() => false);
      if (why) { await page.getByTestId('showdown-why-gut').click(); await page.waitForTimeout(250); continue; }
      const intensity = await page.getByTestId('showdown-intensity').isVisible().catch(() => false);
      if (intensity) { await page.getByTestId('showdown-intensity-relative').click(); await page.waitForTimeout(250); continue; }
      const tiles = page.locator('[data-testid^="showdown-pick-"]');
      if (await tiles.count() > 0) { await tiles.first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(320); continue; }
      await page.waitForTimeout(300);
    }

    // 5. RESULTS
    await expect(page.getByTestId('showdown-results')).toBeVisible({ timeout: 25000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}-5-results.png`, fullPage: true });
    const ox3 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(ox3, `${name} results overflows horizontally by ${ox3}px`).toBeLessThanOrEqual(1);
    console.log(`[${name}] thin results:`, await page.getByTestId('showdown-results').getAttribute('data-thin'));
  });
}
