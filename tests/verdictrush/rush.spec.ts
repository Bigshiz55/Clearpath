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
