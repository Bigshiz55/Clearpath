import { test, expect, type Page } from '@playwright/test';

/**
 * THE RE-VERD1CT, DRIVEN FOR REAL.
 *
 * Runs against `/dev/reverdict`, which mounts the actual PosterCard (so the R
 * stamp is the one that ships), the real tray and the real quiz.
 *
 * What is being proved is the interaction, not the pixels: the R is a real tap
 * target that survives 320px, the W and the R are mutually exclusive, the tray
 * refuses to deliver under the minimum, and the quiz's Back genuinely reverses.
 */
const PHONES = [
  { w: 320, h: 568 },
  { w: 390, h: 844 },
  { w: 440, h: 956 },
];

async function open(page: Page, w = 390, h = 844) {
  await page.setViewportSize({ width: w, height: h });
  // Clear ONCE per tab, not on every navigation. An unguarded init script wipes
  // the docket on the reload that the persistence test exists to check, and
  // then reports the product as broken.
  await page.addInitScript(() => {
    try {
      if (window.sessionStorage.getItem('__wv_cleared') === '1') return;
      window.sessionStorage.setItem('__wv_cleared', '1');
      window.localStorage.removeItem('wv.docket.v1');
      window.localStorage.removeItem('wv.rdocket.v1');
      window.localStorage.removeItem('wv.rewatch-quiz.v1');
    } catch {
      /* private mode — nothing to clear */
    }
  });
  await page.goto('/dev/reverdict', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('rv-grid')).toBeVisible();
}

for (const { w, h } of PHONES) {
  test(`the R is a real tap target and never overflows @ ${w}x${h}`, async ({ page }) => {
    await open(page, w, h);
    const r = page.getByTestId('r-check-949');
    await expect(r).toBeVisible();
    const box = await r.boundingBox();
    expect(box!.height, 'R height').toBeGreaterThanOrEqual(44);
    expect(box!.width, 'R width').toBeGreaterThanOrEqual(44);

    // It sits below the W, not beside it — two 44px targets side by side in a
    // poster corner is a mis-tap waiting to happen.
    const wBox = await page.getByTestId('w-check-949').boundingBox();
    expect(box!.y, 'R below W').toBeGreaterThanOrEqual(wBox!.y + wBox!.height - 1);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no sideways scroll').toBeLessThanOrEqual(1);
  });
}

test('the R and the W are mutually exclusive — one title, one question', async ({ page }) => {
  await open(page);
  await page.getByTestId('w-check-949').click();
  await expect(page.getByTestId('w-check-949')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('r-check-949').click();
  await expect(page.getByTestId('r-check-949')).toHaveAttribute('aria-pressed', 'true');
  // Tapping the R must take it off the first-watch docket, or the same title
  // produces two contradictory rulings.
  await expect(page.getByTestId('w-check-949')).toHaveAttribute('aria-pressed', 'false');
});

test('the tray appears with the first R, counts up, and refuses to rule early', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('reverdict-tray')).toHaveCount(0);

  await page.getByTestId('r-check-949').click();
  await expect(page.getByTestId('reverdict-tray')).toBeVisible();
  await expect(page.getByTestId('reverdict-not-ready')).toBeVisible();
  await expect(page.getByTestId('reverdict-deliver')).toHaveCount(0);
  await expect(page.getByTestId('reverdict-status')).toContainText('2 more');

  await page.getByTestId('r-check-9403').click();
  await page.getByTestId('r-check-1620').click();
  await expect(page.getByTestId('reverdict-deliver')).toBeVisible();
  await expect(page.getByTestId('reverdict-status')).toContainText('ready');
});

test('taking the last one off makes the tray disappear entirely', async ({ page }) => {
  await open(page);
  await page.getByTestId('r-check-949').click();
  await expect(page.getByTestId('reverdict-tray')).toBeVisible();
  await page.getByTestId('r-check-949').click();
  // It must cost no screen space when nobody is using it.
  await expect(page.getByTestId('reverdict-tray')).toHaveCount(0);
});

test('the R docket survives a reload — it is tonight’s question, not this render’s', async ({ page }) => {
  await open(page);
  await page.getByTestId('r-check-949').click();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByTestId('r-check-949')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('reverdict-tray')).toBeVisible();
});

test('the rewatch quiz advances, and Back genuinely reverses', async ({ page }) => {
  await open(page);
  const quiz = page.getByTestId('rewatch-quiz');
  await expect(quiz).toBeVisible();
  await expect(page.getByTestId('rewatch-progress')).toContainText('1 of');

  await page.getByTestId('rewatch-answer-exactly').click();
  await expect(page.getByTestId('rewatch-progress')).toContainText('2 of');

  await page.getByTestId('rewatch-back').click();
  await expect(page.getByTestId('rewatch-progress')).toContainText('1 of');
});

test('the quiz offers exactly four answers, all real tap targets at 320px', async ({ page }) => {
  await open(page, 320, 568);
  const answers = page.locator('[data-testid^="rewatch-answer-"]');
  await expect(answers).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    const box = await answers.nth(i).boundingBox();
    expect(box!.height, `answer ${i} height`).toBeGreaterThanOrEqual(44);
  }
});

test('finishing reads the profile back instead of just ending', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 4; i++) await page.getByTestId('rewatch-answer-exactly').click();
  await page.getByTestId('rewatch-finish').click();
  const done = page.getByTestId('rewatch-quiz-done');
  await expect(done).toBeVisible();
  await expect(done).toContainText(/rewatch/i);
  // And it is honest about the bound on what it can move.
  await expect(done).toContainText('10 points');
});
