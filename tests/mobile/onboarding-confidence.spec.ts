import { test, expect, type Page } from '@playwright/test';

/**
 * THE TWO THINGS A FIRST-TIME USER NEEDS, PROVEN IN A REAL BROWSER.
 *
 *  1. THE W EXPLAINS ITSELF. It is the app's most distinctive control and its
 *     least self-evident — a letter on a poster that quietly builds a
 *     shortlist. A coach mark teaches it once, then gets out of the way.
 *  2. THE SCORE SAYS HOW SURE IT IS. A match percentage and a confidence are
 *     different claims; showing only the number manufactures precision.
 *
 * Both must hold WITHOUT changing the W/gavel behaviour itself, which
 * `decision-pool.spec.ts` guards separately.
 */
async function open(page: Page, w = 390) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.route('**/api/ratings/**', (r) =>
    r.fulfill({ json: { ratings: { standardScore: 84, audience: 78 }, overview: 'A synopsis.' } }),
  );
  await page.goto('/dev/visual-qa', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('qa-grid')).toBeVisible();
}

/** The W BUTTONS only — `w-check-tick` / `-announce` / `-refused` share the
 *  prefix and are not controls. */
const ws = (page: Page) => page.locator('button[data-testid^="w-check-"]');

test.describe('the W teaches itself, once', () => {
  test('a brand-new visitor is told what the W does', async ({ page }) => {
    await open(page);
    const coach = page.getByTestId('w-coach');
    await expect(coach).toBeVisible();
    await expect(coach).toHaveAttribute('data-step', 'explain');
    await expect(coach).toContainText(/Tap W to add this title/i);
  });

  test('exactly ONE coach mark exists, however many posters are on screen', async ({ page }) => {
    await open(page, 1440);
    expect(await ws(page).count()).toBeGreaterThan(3);
    await expect(page.getByTestId('w-coach')).toHaveCount(1);
  });

  test('after the first selection it switches to what unlocks the gavel', async ({ page }) => {
    await open(page);
    await ws(page).first().click();
    const coach = page.getByTestId('w-coach');
    await expect(coach).toHaveAttribute('data-step', 'progress');
    await expect(coach).toContainText('1 selected');
    await expect(coach).toContainText(/unlock the gavel/i);
  });

  test('the count in the coach tracks the real docket', async ({ page }) => {
    await open(page);
    await ws(page).nth(0).click();
    await ws(page).nth(1).click();
    await expect(page.getByTestId('w-coach')).toContainText('2 selected');
    // And the docket agrees — the coach is reading real state, not its own.
    await expect(page.getByTestId('docket-count')).toHaveText('2');
  });

  test('"Got it" dismisses it, and it does not come back on reload', async ({ page }) => {
    await open(page);
    const dismiss = page.getByTestId('w-coach-dismiss');
    // The coach hangs off the first poster, which can sit below the fold on a
    // tall harness page — scroll to it the way a real user would.
    await dismiss.scrollIntoViewIfNeeded();
    await dismiss.click();
    await expect(page.getByTestId('w-coach')).toHaveCount(0);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('w-coach')).toHaveCount(0);
  });

  test('it retires itself for good once a full docket has been assembled', async ({ page }) => {
    await open(page);
    for (let i = 0; i < 3; i++) await ws(page).nth(i).click();
    await expect(page.getByTestId('docket-deliver')).toBeVisible(); // gavel unlocked
    await expect(page.getByTestId('w-coach')).toHaveCount(0);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('w-coach')).toHaveCount(0);
  });

  /**
   * THE COACH STAYS ON THE SCREEN. It was anchored to the W's right edge, and
   * the W sits at the poster's top-RIGHT — so on a phone a 216px panel grew
   * leftward from a poster ~140px wide and landed at x = -48, entirely off
   * the screen. Caught by "Got it" being unclickable; pinned here at the
   * narrowest widths the app supports.
   */
  for (const w of [320, 360, 390, 430]) {
    test(`the coach is fully on screen and tappable @ ${w}px`, async ({ page }) => {
      await open(page, w);
      const coach = page.getByTestId('w-coach');
      const box = (await coach.boundingBox())!;
      expect(box.x, `coach escapes the left edge at ${w}`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `coach escapes the right edge at ${w}`).toBeLessThanOrEqual(w + 1);
      // And the page itself never scrolls sideways because of it.
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `horizontal overflow at ${w}`).toBeLessThanOrEqual(1);
    });
  }

  test('the coach never blocks the W it is teaching', async ({ page }) => {
    await open(page);
    const w = ws(page).first();
    const coach = page.getByTestId('w-coach');
    const [wb, cb] = [await w.boundingBox(), await coach.boundingBox()];
    // The mark sits BELOW the control, never over it.
    expect(cb!.y).toBeGreaterThanOrEqual(wb!.y + wb!.height - 1);
    // And the control still works with the mark on screen.
    await w.click();
    await expect(w).toHaveAttribute('aria-pressed', 'true');
  });
});

/**
 * CONFIDENCE LIVES ON THE VERDICT PAGE, where the decision is made and there
 * is room to say it properly.
 *
 * It is deliberately NOT on every grid card: that card's score panel is a
 * measured space (three separate layout specs defend its height and its
 * one-line ratings row), and a fourth element in it either wrapped the panel
 * onto an extra row or squeezed the rating chips until they clipped. Both
 * were caught by those specs during this work.
 */
test.describe('the verdict says how sure it is', () => {
  async function openReport(page: Page, w = 390) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/dev/report-tabs', { waitUntil: 'networkidle' });
  }

  test('the headline call carries a confidence badge beside it', async ({ page }) => {
    await openReport(page);
    const badge = page.getByTestId('confidence-badge').first();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/High confidence|Medium confidence|Early prediction/);
  });

  test('a visitor with no ratings is told this is an EARLY prediction, never "high"', async ({ page }) => {
    await openReport(page);
    // The harness has no signed-in user and no DNA, so nothing may claim to
    // be a confident PERSONAL call however good the reviews are.
    await expect(page.getByTestId('confidence-badge').first()).toHaveAttribute('data-level', 'early');
  });

  test('tapping it explains itself in plain language', async ({ page }) => {
    await openReport(page);
    await page.getByTestId('confidence-badge').first().click();
    const why = page.getByTestId('confidence-why').first();
    await expect(why).toBeVisible();
    await expect(why).toContainText(/taste ratings|evidence|rated title|rating sources/i);
  });

  test('it never uses the words "low confidence" — that reads as a bad title', async ({ page }) => {
    await openReport(page);
    await expect(page.locator('body')).not.toContainText(/low confidence/i);
  });

  for (const w of [320, 390, 768, 1440]) {
    test(`the badge fits and never scrolls the page sideways @ ${w}px`, async ({ page }) => {
      await openReport(page, w);
      const box = (await page.getByTestId('confidence-badge').first().boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(w + 1);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `horizontal overflow at ${w}`).toBeLessThanOrEqual(1);
    });
  }
});
