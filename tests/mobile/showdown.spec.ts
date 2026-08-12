import { test, expect, type Page } from '@playwright/test';

/**
 * DNA SHOWDOWN ON A PHONE — the geometry, and the follow-up rounds.
 *
 * The game's whole promise is speed: two posters, one tap, next. That promise
 * dies the moment a control needs scrolling to reach, and it dies quietly —
 * the page still works, it just costs a swipe per round and feels like a form.
 * So the constraint is asserted rather than eyeballed: at 390x844 nothing
 * overflows either axis and every control is thumb-sized.
 *
 * THE FOLLOW-UP ROUNDS ARE THE RISK. They add a chip grid below the posters, so
 * they are the state most likely to push the layout past the fold — and they
 * appear only on some rounds, which is exactly the kind of thing a manual pass
 * misses. The spec plays until one appears and measures it there.
 */

const IPHONE_13 = { width: 390, height: 844 };

/** Apple's minimum comfortable target. Anything smaller is a mis-tap generator. */
const MIN_TARGET = 44;

async function overflows(page: Page) {
  return page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
}

/**
 * THE GAME'S OWN CONTROLS, not every button on the page.
 *
 * Scoped to `data-testid^="showdown-"` because the dev harness renders an
 * environment banner that is deliberately tiny and is not a control anyone taps.
 * Measuring the whole document made the harness fail its own spec for a reason
 * that says nothing about the product.
 */
async function tooSmall(page: Page) {
  return page.evaluate((min) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('button[data-testid^="showdown-"]'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // not rendered
      if (r.height < min) out.push(`${el.textContent?.trim().slice(0, 30)} (${Math.round(r.height)}px)`);
    }
    return out;
  }, MIN_TARGET);
}

test.describe('DNA Showdown at 390x844', () => {
  test.use({ viewport: IPHONE_13 });

  test('the game fits the screen with nothing to scroll', async ({ page }) => {
    await page.goto('/dev/dna-showdown');
    await expect(page.getByTestId('showdown-prompt')).toBeVisible();

    const o = await overflows(page);
    expect(o.x, 'the game scrolls sideways on a phone').toBeLessThanOrEqual(0);
    expect(o.y, 'a control is below the fold — that is a swipe per round').toBeLessThanOrEqual(0);
    expect(await tooSmall(page), 'a control is under 44px tall').toEqual([]);
  });

  test('all four answers are reachable without scrolling', async ({ page }) => {
    await page.goto('/dev/dna-showdown');
    await expect(page.getByTestId('showdown-prompt')).toBeVisible();

    // FOUR ANSWERS, NOT THREE PLUS A SKIP. `Both` is the mirror of `Neither`,
    // and it existed in the engine long before it existed on screen.
    for (const id of ['showdown-neither', 'showdown-both', 'showdown-unseen']) {
      await expect(page.getByTestId(id)).toBeInViewport();
    }
  });

  test('a follow-up round still fits, chips and all', async ({ page }) => {
    await page.goto('/dev/dna-showdown');
    await expect(page.getByTestId('showdown-prompt')).toBeVisible();

    // Play until the engine decides to ask a second question. It spends a fixed
    // budget on the most confounded rounds, so this is a handful of taps.
    let found = '';
    for (let i = 0; i < 12 && !found; i++) {
      await page.locator('[data-testid^="showdown-pick-"]').first().click();
      await page.waitForTimeout(260);
      const kind = await page.getByTestId('showdown-prompt').getAttribute('data-followup');
      if (kind) found = kind;
    }
    expect(found, 'no follow-up was offered in twelve rounds').not.toBe('');

    const o = await overflows(page);
    expect(o.x, 'the follow-up scrolls sideways').toBeLessThanOrEqual(0);
    expect(o.y, 'the follow-up pushed a control below the fold').toBeLessThanOrEqual(0);
    expect(await tooSmall(page), 'a follow-up control is under 44px tall').toEqual([]);

    if (found === 'why') {
      const chips = page.getByTestId('showdown-why-chip');
      // Fewer than two is not a choice; more than four is a menu.
      const count = await chips.count();
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(4);
      await expect(page.getByTestId('showdown-why-gut')).toBeInViewport();
    } else {
      await expect(page.getByTestId('showdown-intensity-relative')).toBeInViewport();
    }

    await page.screenshot({ path: `test-results/mobile/showdown-followup-${found}.png` });
  });

  test('answering a follow-up returns to the game', async ({ page }) => {
    await page.goto('/dev/dna-showdown');
    await expect(page.getByTestId('showdown-prompt')).toBeVisible();

    let kind: string | null = null;
    for (let i = 0; i < 12 && !kind; i++) {
      await page.locator('[data-testid^="showdown-pick-"]').first().click();
      await page.waitForTimeout(260);
      kind = await page.getByTestId('showdown-prompt').getAttribute('data-followup');
      if (!kind) kind = null;
    }
    expect(kind).toBeTruthy();

    const before = Number(await page.getByTestId('showdown-progress').getAttribute('data-decisions'));
    if (kind === 'why') {
      await page.getByTestId('showdown-why-chip').first().click();
    } else {
      await page.getByTestId('showdown-intensity-keen').click();
    }
    await page.waitForTimeout(200);

    // Back to two posters and a tap — and NOT re-asking the round just answered.
    await expect(page.getByTestId('showdown-prompt')).toHaveAttribute('data-followup', '');
    await expect(page.getByTestId('showdown-neither')).toBeVisible();
    expect(
      Number(await page.getByTestId('showdown-progress').getAttribute('data-decisions')),
      'the follow-up rewound or double-counted the round',
    ).toBe(before);
  });
});
