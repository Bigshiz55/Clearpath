import { test, expect } from '@playwright/test';

/**
 * "DID WE GET IT RIGHT?" — the accuracy loop, on screen.
 *
 * The pure grading is covered exhaustively in `src/lib/verdict/postWatch.test.ts`.
 * What this suite proves is the part unit tests cannot: that the panel actually
 * renders, that it STAYS SILENT once we already hold an answer, that it admits a
 * wrong call in plain words rather than burying it, and that no percentage
 * reaches the screen before there is enough data to justify one.
 */

const ROUTE = '/dev/post-watch';

test.describe('the ask', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('asks the question in plain language with all four answers', async ({ page }) => {
    const ask = page.getByTestId('pw-ask');
    await expect(ask.getByRole('heading', { name: 'Did we get it right?' })).toBeVisible();
    for (const label of ['Loved it', 'Liked it', 'It was okay', 'Not for me']) {
      await expect(ask.getByRole('button', { name: new RegExp(label) })).toBeVisible();
    }
  });

  test('does not ask again once we already hold a rating', async ({ page }) => {
    // Asking twice would nag the user AND double-count in our own accuracy.
    const answered = page.getByTestId('pw-answered');
    await expect(answered).toBeAttached();
    await expect(answered).toBeEmpty();
  });

  test('can be dismissed without answering', async ({ page }) => {
    const ask = page.getByTestId('pw-ask');
    await ask.getByRole('button', { name: 'Not now' }).click();
    await expect(ask).toBeEmpty();
  });
});

test.describe('the grade', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('claims a hit only when it was one, and shows the working', async ({ page }) => {
    const hit = page.getByTestId('pw-grade-hit');
    await expect(hit).toContainText('We called it.');
    // Both halves of the comparison must be on screen — the score we published
    // and the reaction we got — or "we called it" is an unsupported claim.
    await expect(hit).toContainText('88');
    await expect(hit).toContainText('loved it');
  });

  test('ADMITS A WRONG CALL in plain words', async ({ page }) => {
    const miss = page.getByTestId('pw-grade-miss');
    await expect(miss).toContainText('We got that one wrong.');
    await expect(miss).toContainText('31');
  });

  test('says half right when it hedged', async ({ page }) => {
    await expect(page.getByTestId('pw-grade-partial')).toContainText('Half right.');
  });

  test('grades nothing when there was no score on record', async ({ page }) => {
    const ungraded = page.getByTestId('pw-grade-ungraded');
    await expect(ungraded).toContainText('Noted.');
    await expect(ungraded).toContainText('didn’t have a score');
    // It must not manufacture a verdict out of a missing number.
    await expect(ungraded).not.toContainText('We called it');
    await expect(ungraded).not.toContainText('wrong');
  });
});

test.describe('the accuracy claim is gated', () => {
  test('shows no percentage at all below the minimum sample', async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    const thin = await page.getByTestId('pw-acc-thin').innerText();
    // Three calls, two of them hits, is not "67% accurate".
    expect(thin).not.toMatch(/\d+\s?%/);
    expect(thin).toMatch(/more/);
  });

  test('states the rate once there is enough of it', async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pw-acc-enough')).toContainText('70%');
  });
});

test.describe('it fits the phone', () => {
  for (const w of [320, 390, 430]) {
    test(`no sideways scroll and four reachable answers @ ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 860 });
      await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `overflow at ${w}px`).toBeLessThanOrEqual(1);

      const buttons = page.getByTestId('pw-ask').locator('button[data-testid^="post-watch-"]');
      await expect(buttons).toHaveCount(4);
      for (let i = 0; i < 4; i++) {
        const box = await buttons.nth(i).boundingBox();
        expect(box, `answer ${i} has no box`).not.toBeNull();
        // A tap target that is off-screen or under the minimum height is not an
        // answer the user can actually give.
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(w + 1);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    });
  }
});
