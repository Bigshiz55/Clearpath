import { test, expect, type Page } from '@playwright/test';

/**
 * THE GAME MUST BE PLAYABLE ON EVERY SHAPE OF SCREEN.
 *
 * Driven by SCREEN STATE, not by a script: each turn asks what is on screen and
 * answers it. A test that hard-codes a round order is testing a sequence the
 * planner does not have, and would keep passing after the planner stopped
 * adapting.
 */

type Screen = 'intent' | 'matchup' | 'reveal' | null;

async function screen(page: Page): Promise<Screen> {
  for (const [name, id] of [
    ['intent', 'showdown-intent'],
    ['matchup', 'showdown-matchup'],
    ['reveal', 'showdown-reveal'],
  ] as const) {
    if (await page.getByTestId(id).isVisible().catch(() => false)) return name;
  }
  return null;
}

async function open(page: Page) {
  await page.goto('/dev/showdown');
  await page.getByTestId('showdown-intent').waitFor({ timeout: 15_000 });
}

/** Answer one screen. `pick` chooses how a matchup is answered. */
async function answer(page: Page, pick: 'left' | 'right' | 'neither' | 'unseen', i = 0) {
  const s = await screen(page);
  if (s === 'intent') {
    await page.locator('[data-testid^="showdown-intent-"]').nth(i % 6).click();
  } else if (s === 'matchup') {
    await page.getByTestId(pick === 'left' || pick === 'right' ? `showdown-pick-${pick}` : `showdown-${pick}`).click();
  } else {
    return s;
  }
  // The surface guards a double tap for ADVANCE_MS; answering inside that
  // window is dropped by design, so the test would be measuring its own haste.
  await page.waitForTimeout(220);
  return s;
}

async function play(page: Page, pick: (i: number) => 'left' | 'right' | 'neither' | 'unseen', max = 20) {
  const seen: Screen[] = [];
  for (let i = 0; i < max; i++) {
    if (await page.getByTestId('showdown-reveal').isVisible().catch(() => false)) break;
    const s = await answer(page, pick(i), i);
    if (s === null) break;
    seen.push(s);
  }
  return seen;
}

test.describe('the session completes', () => {
  test('plays to the reveal without stalling, and with no console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));

    await open(page);
    const seen = await play(page, (i) => (i % 3 === 2 ? 'right' : 'left'));

    await expect(page.getByTestId('showdown-reveal')).toBeVisible();
    expect(seen, 'the session never showed a matchup').toContain('matchup');
    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('the planner puts up a controlled pair as well as confounded ones', async ({ page }) => {
    // The Twist is a ROUND TYPE, so it must actually occur in ordinary play
    // rather than being a code path nothing reaches.
    await open(page);
    await answer(page, 'left');

    const kinds = new Set<string>();
    for (let i = 0; i < 12; i++) {
      if (!(await page.getByTestId('showdown-matchup').isVisible().catch(() => false))) break;
      const kind = await page.getByTestId('showdown-question').getAttribute('data-kind');
      if (kind) kinds.add(kind);
      await answer(page, 'left', i);
    }
    expect([...kinds], 'the planner never produced a controlled pair').toContain('twist');
  });

  test('never repeats a matchup', async ({ page }) => {
    await open(page);
    await answer(page, 'left');

    const pairs: string[] = [];
    for (let i = 0; i < 12; i++) {
      if (!(await page.getByTestId('showdown-matchup').isVisible().catch(() => false))) break;
      const l = await page.getByTestId('showdown-pick-left').getAttribute('data-title-key');
      const r = await page.getByTestId('showdown-pick-right').getAttribute('data-title-key');
      const key = [l, r].sort().join('|');
      expect(pairs, 'the same pair was asked twice').not.toContain(key);
      pairs.push(key);
      await answer(page, 'left', i);
    }
    expect(pairs.length).toBeGreaterThan(2);
  });
});

test.describe('layout', () => {
  test('no horizontal overflow on any screen', async ({ page }) => {
    await open(page);
    await play(page, () => 'left', 8);
    // Checked on the reveal too, which is the longest screen.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
  });

  test('every control is reachable and big enough to hit', async ({ page }) => {
    await open(page);
    for (let i = 0; i < 6; i++) {
      const buttons = page.locator('button[data-testid^="showdown-"]:visible');
      const count = await buttons.count();
      for (let b = 0; b < count; b++) {
        const box = await buttons.nth(b).boundingBox();
        if (!box) continue;
        const label = (await buttons.nth(b).getAttribute('data-testid')) ?? `button ${b}`;
        expect(box.height, `${label} is only ${Math.round(box.height)}px tall`).toBeGreaterThanOrEqual(44);
        const vp = page.viewportSize();
        if (vp) {
          expect(box.x, `${label} starts off-screen`).toBeGreaterThanOrEqual(-1);
          expect(box.x + box.width, `${label} runs past the right edge`).toBeLessThanOrEqual(vp.width + 1);
          // The defect this suite exists for: controls below the fold at 200%
          // zoom, where nobody thinks to scroll for them.
          expect(box.y + box.height, `${label} sits below the fold`).toBeLessThanOrEqual(vp.height + 1);
        }
      }
      if ((await answer(page, 'left', i)) === null) break;
    }
  });

  test('the global feedback FAB never covers a control', async ({ page }) => {
    // REGRESSION for the previous build: the FAB is fixed bottom-left at z-40
    // and landed on the primary control. An element that is present but covered
    // passes every visibility assertion, so this asks the browser what is
    // actually at those coordinates.
    await open(page);
    await expect(page.getByTestId('feedback-fab')).toBeHidden();
    await answer(page, 'left');

    for (const id of ['showdown-neither', 'showdown-unseen', 'showdown-pick-left']) {
      const box = await page.getByTestId(id).boundingBox();
      if (!box) continue;
      const owner = await page.evaluate(
        ({ x, y }) => {
          const el = document.elementFromPoint(x, y);
          return el?.closest('button')?.getAttribute('data-testid') ?? el?.tagName ?? 'none';
        },
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      );
      expect(owner, `${id} is covered by something else`).not.toBe('feedback-fab');
    }
  });

  test('a poster that fails to load still leaves a readable tile', async ({ page }) => {
    // Artwork must never be able to create a dead zone.
    await page.route('**/image.tmdb.org/**', (r) => r.abort());
    await open(page);
    await answer(page, 'left');
    const left = page.getByTestId('showdown-pick-left');
    await expect(left).toBeVisible();
    expect(((await left.textContent()) ?? '').trim().length, 'the tile has no title on it').toBeGreaterThan(2);
  });

  test('captures each screen for visual review', async ({ page }, testInfo) => {
    await open(page);
    const shot = async (name: string) => {
      await page.screenshot({ path: `test-results/showdown/${testInfo.project.name}-${name}.png` });
    };
    await shot('intent');
    await answer(page, 'left');
    await shot('matchup');
    await play(page, () => 'left');
    await shot('reveal');
  });
});

test.describe('keyboard and motion', () => {
  test('a whole session can be played without a pointer', async ({ page }) => {
    await open(page);
    for (let i = 0; i < 20; i++) {
      if (await page.getByTestId('showdown-reveal').isVisible().catch(() => false)) break;
      let pressed = false;
      for (let tab = 0; tab < 25 && !pressed; tab++) {
        await page.keyboard.press('Tab');
        const id = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
        if (/^showdown-(intent-|pick-|neither$|unseen$|continue$)/.test(id)) {
          await page.keyboard.press('Enter');
          pressed = true;
        }
      }
      expect(pressed, 'a screen could not be answered from the keyboard').toBe(true);
      await page.waitForTimeout(220);
    }
    await expect(page.getByTestId('showdown-reveal')).toBeVisible();
  });

  test('completes with motion disabled', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await play(page, () => 'left');
    await expect(page.getByTestId('showdown-reveal')).toBeVisible();
  });
});

test.describe('honesty', () => {
  test('a session of “haven’t seen either” claims nothing was learned', async ({ page }) => {
    // Ignorance is not dislike. The reveal must not inflate a number after a
    // player recognised nothing.
    await open(page);
    await answer(page, 'unseen');
    await play(page, () => 'unseen');

    const reveal = page.getByTestId('showdown-reveal');
    await expect(reveal).toBeVisible();
    expect(Number(await reveal.getAttribute('data-events')), 'unseen produced evidence').toBe(0);
    expect(Number(await reveal.getAttribute('data-learned')), 'the number moved').toBe(0);
    await expect(reveal).toHaveText(/nothing learned/i);
  });

  test('picking does produce evidence, so the previous test means something', async ({ page }) => {
    await open(page);
    await answer(page, 'left');
    await play(page, () => 'left');
    const reveal = page.getByTestId('showdown-reveal');
    await expect(reveal).toBeVisible();
    expect(Number(await reveal.getAttribute('data-events'))).toBeGreaterThan(0);
  });
});
