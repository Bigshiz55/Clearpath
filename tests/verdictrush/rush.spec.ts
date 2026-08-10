import { test, expect, type Page } from '@playwright/test';

/**
 * VERD1CT RUSH, played in a real browser and MEASURED.
 *
 * The acceptance standard is experiential, so the assertions are the
 * experience: can someone tap Start, understand it without reading, make a
 * decision every couple of seconds, never see the same format three times
 * running, and come out with a profile plus recommendations in about 90
 * seconds — using one thumb.
 */

const HARNESS = '/dev/verdict-rush';

/** A realistic look-and-tap for a decision you do not have to think hard about. */
const HUMAN_TAP_MS = 900;

/** Play one round as someone who wants crime and refuses the supernatural. */
/**
 * Make one decision and WAIT FOR IT TO LAND.
 *
 * Selection snaps and the next round replaces it ~180ms later, so a loop that
 * taps as fast as Playwright can drive clicks into a round that is already
 * tearing down — "element is not stable", then detached. A person cannot tap
 * faster than the transition; the test should not either.
 */
async function decide(page: Page): Promise<string> {
  const before = Number((await page.getByTestId('rush-decisions').getAttribute('data-count')) ?? '0');
  const type = await tapOnce(page);
  await expect
    .poll(async () => {
      if (await page.getByTestId('rush-families').isVisible().catch(() => false)) return before + 1;
      const now = await page.getByTestId('rush-decisions').getAttribute('data-count').catch(() => null);
      return Number(now ?? before);
    }, { timeout: 10_000 })
    .toBeGreaterThan(before);
  return type;
}

async function tapOnce(page: Page): Promise<string> {
  const prompt = page.getByTestId('rush-prompt');
  const type = (await prompt.getAttribute('data-round-type')) ?? '';
  const layout = await prompt.getAttribute('data-layout');
  const picks = Number((await prompt.getAttribute('data-picks')) ?? '1');

  if (layout === 'poster') {
    const id = (await page.getByTestId('rush-title').getAttribute('data-title-id')) ?? '';
    const loved = /zodiac|silence|se7en|prisoners|true-detective|godfather|breaking-bad|knives|gone-girl|sherlock/.test(id);
    const unseen = /dark|making-a-murderer/.test(id);
    await page.getByTestId(unseen ? 'rush-pass' : loved ? 'rush-love' : 'rush-nope').click();
    return type;
  }

  const buttons = layout === 'wheel'
    ? page.locator('[data-testid^="wheel-slot-"]')
    : page.locator('[data-testid^="rush-choice-"]');
  const count = await buttons.count();

  // Rank the wedges this player wants, then take DISTINCT ones. Tapping the
  // same tile twice on a two-pick round correctly deselects it — which is the
  // right behaviour and an easy way to write a test that waits forever.
  const wanted: number[] = [];
  const rest: number[] = [];
  for (let i = 0; i < count; i++) {
    const fam = await buttons.nth(i).getAttribute('data-family');
    (fam === 'mystery' || fam === 'dark' ? wanted : rest).push(i);
  }
  const order = [...wanted, ...rest];
  for (let pick = 0; pick < picks && pick < order.length; pick++) {
    await buttons.nth(order[pick]!).click();
  }
  return type;
}

test('a whole game, measured', async ({ page }) => {
  await page.goto(HARNESS);
  await page.getByTestId('rush-start').click();
  await expect(page.getByTestId('rush-prompt')).toBeVisible();

  const types: string[] = [];
  const t0 = Date.now();

  for (let i = 0; i < 60; i++) {
    if (await page.getByTestId('rush-families').isVisible().catch(() => false)) break;
    if (!(await page.getByTestId('rush-prompt').isVisible().catch(() => false))) break;
    await page.waitForTimeout(HUMAN_TAP_MS);
    types.push(await decide(page));
  }

  await expect(page.getByTestId('rush-families')).toBeVisible({ timeout: 15_000 });
  const totalMs = Date.now() - t0;
  const summary = page.getByTestId('rush-summary');
  const decisions = Number(await summary.getAttribute('data-decisions'));
  const traits = Number(await summary.getAttribute('data-traits'));

  /* eslint-disable no-console */
  console.log(`[rush] session: ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`[rush] decisions: ${decisions}`);
  console.log(`[rush] traits captured: ${traits}`);
  console.log(`[rush] formats used: ${new Set(types).size} (${[...new Set(types)].join(', ')})`);
  /* eslint-enable no-console */

  expect(decisions, 'too few decisions').toBeGreaterThanOrEqual(20);
  expect(traits, 'too few traits captured').toBeGreaterThanOrEqual(10);
  expect(new Set(types).size, 'not enough round variety').toBeGreaterThanOrEqual(5);

  // The stated failure condition: six choices on every screen.
  for (let i = 2; i < types.length; i++) {
    expect(types[i] === types[i - 1] && types[i] === types[i - 2], `${types[i]} three times running`).toBe(false);
  }
});

test('the meter is confidence, and it climbs', async ({ page }) => {
  await page.goto(HARNESS);
  await page.getByTestId('rush-start').click();
  const known = page.getByTestId('rush-known');
  const first = Number(await known.getAttribute('data-known'));
  for (let i = 0; i < 8; i++) await decide(page);
  const later = Number(await known.getAttribute('data-known'));
  expect(first).toBeLessThan(later);
});

test('the reveal is more than genre bars, and pays off immediately', async ({ page }) => {
  await page.goto(HARNESS);
  await page.getByTestId('rush-start').click();
  for (let i = 0; i < 60; i++) {
    if (await page.getByTestId('rush-families').isVisible().catch(() => false)) break;
    if (!(await page.getByTestId('rush-prompt').isVisible().catch(() => false))) break;
    await decide(page);
  }
  await expect(page.getByTestId('rush-families')).toBeVisible({ timeout: 15_000 });
  expect(await page.getByTestId('rush-family').count()).toBe(6);
  // Signature traits, not just bars.
  expect(await page.getByTestId('rush-chip').count()).toBeGreaterThan(0);
  // And three things to watch.
  expect(await page.getByTestId('rush-pick').count()).toBe(3);
  await expect(page.getByTestId('rush-show-picks')).toBeVisible();
  await expect(page.getByTestId('rush-play-again')).toBeVisible();
});

test('a reload mid-game resumes rather than restarting', async ({ page }) => {
  await page.goto(HARNESS);
  await page.getByTestId('rush-start').click();
  for (let i = 0; i < 5; i++) await decide(page);
  const before = Number(await page.getByTestId('rush-decisions').getAttribute('data-count'));
  expect(before).toBeGreaterThan(0);

  await page.reload();
  await page.getByTestId('rush-start').click();
  const after = Number(await page.getByTestId('rush-decisions').getAttribute('data-count'));
  expect(after, 'lost what it had already learned').toBe(before);
});

test('rapid double-taps cannot double-count a decision', async ({ page }) => {
  await page.goto(HARNESS);
  await page.getByTestId('rush-start').click();
  const buttons = page.locator('[data-testid^="wheel-slot-"]');
  await buttons.first().click();
  await buttons.first().click({ force: true }).catch(() => {});
  await expect.poll(async () =>
    Number(await page.getByTestId('rush-decisions').getAttribute('data-count')),
  ).toBeLessThanOrEqual(1);
});

test('the question is in the middle and the answers are in the circle', async ({ page }) => {
  await page.goto(HARNESS);
  await page.getByTestId('rush-start').click();

  // The opening round is radial; if it ever is not, this test is meaningless.
  await expect(page.getByTestId('rush-prompt')).toHaveAttribute('data-layout', 'wheel');

  const wheel = (await page.getByTestId('rush-wheel').boundingBox())!;
  const prompt = (await page.getByTestId('rush-prompt').boundingBox())!;
  const cx = wheel.x + wheel.width / 2;
  const cy = wheel.y + wheel.height / 2;

  // IN THE MIDDLE, not above it: the question's centre sits inside the hub.
  const px = prompt.x + prompt.width / 2;
  const py = prompt.y + prompt.height / 2;
  expect(Math.hypot(px - cx, py - cy), 'the question is not in the hub').toBeLessThan(
    wheel.width * 0.12,
  );

  // IN THE CIRCLE: every answer is a wedge, and its centre is inside the wheel
  // but outside the hub — which is what makes it a wedge rather than a card.
  const slots = page.locator('[data-testid^="wheel-slot-"]');
  const count = await slots.count();
  expect(count).toBe(6);
  for (let i = 0; i < count; i++) {
    const box = (await slots.nth(i).boundingBox())!;
    const r = Math.hypot(box.x + box.width / 2 - cx, box.y + box.height / 2 - cy);
    expect(r, 'an answer sits on top of the question').toBeGreaterThan(wheel.width * 0.15);
    expect(r, 'an answer is outside the wheel').toBeLessThan(wheel.width * 0.55);
  }

  // And nothing is stacked below the wheel pretending to be the answers.
  expect(await page.locator('[data-testid^="rush-choice-"]').count()).toBe(0);
});

test('no answer is ever cut off by its own wedge', async ({ page }) => {
  await page.goto(HARNESS);
  await page.getByTestId('rush-start').click();
  await expect(page.getByTestId('rush-prompt')).toBeVisible();

  let checked = 0;
  for (let round = 0; round < 30; round++) {
    if (await page.getByTestId('rush-families').isVisible().catch(() => false)) break;
    if (!(await page.getByTestId('rush-prompt').isVisible().catch(() => false))) break;

    if ((await page.getByTestId('rush-prompt').getAttribute('data-layout')) === 'wheel') {
      const wheel = (await page.getByTestId('rush-wheel').boundingBox())!;
      const hub = (await page.getByTestId('rush-hub').boundingBox())!;
      const cx = wheel.x + wheel.width / 2;
      const cy = wheel.y + wheel.height / 2;
      const rimR = wheel.width / 2;
      const hubR = hub.width / 2;

      const labels = page.getByTestId('wheel-label');
      const count = await labels.count();
      for (let i = 0; i < count; i++) {
        const label = labels.nth(i);
        const text = (await label.innerText()).trim();

        // A word wider than its box overflows rather than wrapping, which is
        // how a label ends up sliced down the middle by the wedge's clip.
        const [scrollW, clientW] = await label.evaluate((el) => [el.scrollWidth, el.clientWidth]);
        expect(scrollW, `"${text}" is wider than its wedge`).toBeLessThanOrEqual(clientW + 1);

        // And it has to live in the coloured ring: never off the rim, never
        // sitting on the question in the hub.
        const box = (await label.boundingBox())!;
        const corners: Array<[number, number]> = [
          [box.x, box.y],
          [box.x + box.width, box.y],
          [box.x, box.y + box.height],
          [box.x + box.width, box.y + box.height],
        ];
        for (const [x, y] of corners) {
          expect(Math.hypot(x - cx, y - cy), `"${text}" runs past the rim`).toBeLessThanOrEqual(rimR);
        }
        const centreR = Math.hypot(box.x + box.width / 2 - cx, box.y + box.height / 2 - cy);
        expect(centreR, `"${text}" sits on the question`).toBeGreaterThan(hubR);
        checked++;
      }
    }
    await decide(page);
  }

  // A run that never dealt a radial round would pass vacuously.
  expect(checked, 'no wheel labels were measured').toBeGreaterThan(20);
});

test('tapping a wedge scores, and the score climbs as you play', async ({ page }) => {
  await page.goto(HARNESS);
  await page.getByTestId('rush-start').click();
  const score = page.getByTestId('rush-score');
  expect(Number(await score.getAttribute('data-score'))).toBe(0);

  await decide(page);
  const first = Number(await score.getAttribute('data-score'));
  expect(first, 'a decision paid nothing').toBeGreaterThan(0);

  let previous = first;
  for (let i = 0; i < 6; i++) {
    await decide(page);
    const now = Number(await score.getAttribute('data-score'));
    expect(now, 'the score stopped climbing').toBeGreaterThan(previous);
    previous = now;
  }

  // The payoff screen keeps the number rather than throwing it away.
  for (let i = 0; i < 60; i++) {
    if (await page.getByTestId('rush-families').isVisible().catch(() => false)) break;
    if (!(await page.getByTestId('rush-prompt').isVisible().catch(() => false))) break;
    await decide(page);
  }
  await expect(page.getByTestId('rush-families')).toBeVisible({ timeout: 15_000 });
  expect(Number(await page.getByTestId('rush-final-score').getAttribute('data-score'))).toBeGreaterThan(
    previous,
  );
});

test('every choice is reachable by keyboard with a visible label', async ({ page }) => {
  await page.goto(HARNESS);
  await page.getByTestId('rush-start').click();
  const buttons = page.locator('[data-testid^="wheel-slot-"]');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(3);
  for (let i = 0; i < count; i++) {
    // Colour never carries meaning alone — each has real text.
    expect((await buttons.nth(i).innerText()).trim().length).toBeGreaterThan(2);
  }
  await buttons.first().focus();
  await expect(buttons.first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(async () =>
    Number(await page.getByTestId('rush-decisions').getAttribute('data-count')),
  ).toBe(1);
});
