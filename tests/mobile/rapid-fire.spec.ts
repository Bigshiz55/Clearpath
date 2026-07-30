import { test, expect, type Page } from '@playwright/test';

/**
 * RAPID FIRE, DRIVEN FOR REAL.
 *
 * Runs against `/dev/rapid-fire`, which mounts the actual demo — same queue
 * builder, same card, same answers that ship.
 *
 * The assertions that matter are the honesty ones: the sample data must be
 * labelled as sample and must not be persisted, the abandoned titles must come
 * first, and the two escape hatches must be present on every single card.
 */
const PHONES = [
  { w: 320, h: 568 },
  { w: 390, h: 844 },
  { w: 440, h: 956 },
];

async function open(page: Page, w = 390, h = 844) {
  await page.setViewportSize({ width: w, height: h });
  // The harness has no TMDB key; the poster lookup must degrade, not hang.
  await page.route('**/api/search**', (r) => r.fulfill({ json: { results: [] } }));
  await page.goto('/dev/rapid-fire', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('rapid-fire')).toBeVisible();
}

test('says loudly that the data is fake and is not being saved', async ({ page }) => {
  await open(page);
  const notice = page.getByTestId('rapid-demo-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(/sample data/i);
  await expect(notice).toContainText(/nothing you tap here is saved/i);
});

test('opens on an abandoned title — the question nobody else asks', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('rapid-kind')).toContainText(/stopped watching/i);
  await expect(page.getByTestId('rapid-question')).toContainText(/started this and stopped/i);
  // And it separates giving up from being interrupted.
  await expect(page.getByTestId('rapid-answer-bailed')).toBeVisible();
  await expect(page.getByTestId('rapid-answer-interrupted')).toBeVisible();
});

test('every card offers both escape hatches, all the way through', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 8; i++) {
    await expect(page.getByTestId('rapid-answer-not_me'), `card ${i}`).toBeVisible();
    await expect(page.getByTestId('rapid-answer-dont_remember'), `card ${i}`).toBeVisible();
    await page.getByTestId('rapid-answer-liked').click();
  }
});

test('shows the evidence line so the question is answerable', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('rapid-evidence')).toContainText(/episode|watched/i);
});

test('advances, and Back genuinely reverses', async ({ page }) => {
  await open(page);
  const first = await page.getByTestId('rapid-progress').innerText();
  await page.getByTestId('rapid-answer-liked').click();
  await expect(page.getByTestId('rapid-progress')).not.toHaveText(first);
  await page.getByTestId('rapid-back').click();
  await expect(page.getByTestId('rapid-progress')).toHaveText(first);
});

test('"don’t remember" is never counted as something learned', async ({ page }) => {
  await open(page);
  await page.getByTestId('rapid-answer-dont_remember').click();
  await page.getByTestId('rapid-answer-dont_remember').click();
  await expect(page.getByTestId('rapid-live')).not.toContainText(/opinion/i);
  await expect(page.getByTestId('rapid-live')).toContainText(/left alone/i);
});

test('counts what it actually learned, separately from what it dropped', async ({ page }) => {
  await open(page);
  await page.getByTestId('rapid-answer-bailed').click();
  await page.getByTestId('rapid-answer-not_me').click();
  const live = page.getByTestId('rapid-live');
  await expect(live).toContainText(/1 real opinion/i);
  await expect(live).toContainText(/someone else/i);
});

test('stopping reads back honestly and offers to continue', async ({ page }) => {
  await open(page);
  // The first card is an abandoned title, so it offers "Gave up on it" rather
  // than "Loved it" — the answer set is meant to change with the question.
  await page.getByTestId('rapid-answer-bailed').click();
  await page.getByTestId('rapid-stop').click();
  await expect(page.getByTestId('rapid-done')).toBeVisible();
  await expect(page.getByTestId('rapid-continue')).toBeVisible();
  await page.getByTestId('rapid-continue').click();
  await expect(page.getByTestId('rapid-fire')).toBeVisible();
});

test('the keyboard answers the current card', async ({ page }) => {
  await open(page, 1280, 900);
  const first = await page.getByTestId('rapid-progress').innerText();
  await page.keyboard.press('1');
  await expect(page.getByTestId('rapid-progress')).not.toHaveText(first);
});

for (const { w, h } of PHONES) {
  test(`every answer is a real tap target and nothing overflows @ ${w}x${h}`, async ({ page }) => {
    await open(page, w, h);
    const answers = page.locator('[data-testid^="rapid-answer-"]');
    const n = await answers.count();
    expect(n).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < n; i++) {
      const box = await answers.nth(i).boundingBox();
      expect(box!.height, `answer ${i} height`).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no sideways scroll').toBeLessThanOrEqual(1);
  });
}

test('a missing poster degrades to the title rather than a broken image', async ({ page }) => {
  await open(page);
  const card = page.locator('[data-testid^="rapid-card-"]').first();
  await expect(card).toBeVisible();
  expect(await card.locator('img').count()).toBe(0);
});


/**
 * THE END OF THE RUN HAS A WAY OUT.
 *
 * The finish panel offered only "Keep going". The one moment somebody had just
 * taught the recommender something was the moment the app gave them nowhere to
 * go and look at what it did.
 *
 * The demo is the deliberate exception: it writes nothing, so it must NOT offer
 * to show you what it changed.
 */
async function playToTheEnd(page: import('@playwright/test').Page) {
  for (let i = 0; i < 60; i++) {
    if ((await page.getByTestId('rapid-done').count()) > 0) return;
    const liked = page.getByTestId('rapid-answer-liked');
    if ((await liked.count()) === 0) return;
    await liked.click();
  }
}

test('the demo finishes without offering a payoff it cannot deliver', async ({ page }) => {
  await open(page);
  await playToTheEnd(page);
  await expect(page.getByTestId('rapid-done')).toBeVisible();

  // Nothing was saved, so there is nothing to go and see.
  await expect(page.getByTestId('see-recommendations')).toHaveCount(0);
  // But the run still ends on a real next step rather than a dead end.
  await expect(page.getByTestId('rapid-done').locator('..').getByRole('link', { name: /import your real history/i })).toBeVisible();
});
