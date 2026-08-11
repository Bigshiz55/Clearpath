import { test, expect } from '@playwright/test';
import { currentAct, openFresh, playToReveal, type Act } from './drive';

/**
 * A SESSION MUST BE COMPLETABLE ON EVERY SHAPE OF SCREEN.
 *
 * These run across five viewports including a 320px phone and a 200%-zoom
 * desktop, because "it works" on one device is not a claim about the product.
 * Everything here is a property of a session the engine chose, not of a script:
 * no test asserts which act comes when.
 */

test.describe('the session completes', () => {
  test('plays through to the Reveal without stalling', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));

    await openFresh(page);
    const acts = await playToReveal(page);

    await expect(page.getByTestId('tonight-reveal')).toBeVisible();
    // A session with no reel is not a session — the reel is where taste is
    // learned, and a run that skipped it would mean the engine had gone inert.
    expect(acts, 'the session never showed a stimulus').toContain('stimulus');
    expect(acts.length, 'the session was suspiciously short').toBeGreaterThan(2);
    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('every act fits its viewport with no horizontal overflow', async ({ page }) => {
    await openFresh(page);
    const checked = new Set<Act>();

    await playToReveal(page, {
      onMove: async () => {
        const act = await currentAct(page);
        if (!act || checked.has(act)) return;
        checked.add(act);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        // One pixel of tolerance for sub-pixel layout rounding; anything more
        // is content the player has to scroll sideways to reach.
        expect(overflow, `${act} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
      },
    });

    expect(checked.size, 'no acts were inspected').toBeGreaterThan(1);
  });

  test('every control is reachable and big enough to hit', async ({ page }) => {
    await openFresh(page);

    await playToReveal(page, {
      onMove: async () => {
        // The machine's own controls. The dev harness renders a build badge
        // that is not part of the product and is not held to this standard.
        const buttons = page.locator('button[data-testid^="tonight-"]:visible');
        const count = await buttons.count();
        for (let i = 0; i < count; i++) {
          const box = await buttons.nth(i).boundingBox();
          if (!box) continue;
          const label = (await buttons.nth(i).getAttribute('data-testid')) ?? `button ${i}`;
          // 44px is the accessibility floor for a touch target. A control the
          // player cannot reliably hit is a control that is not there.
          expect(box.height, `${label} is only ${Math.round(box.height)}px tall`).toBeGreaterThanOrEqual(44);
          // Fully inside the viewport, not clipped off an edge.
          const viewport = page.viewportSize();
          if (viewport) {
            expect(box.x, `${label} starts off-screen`).toBeGreaterThanOrEqual(-1);
            expect(box.x + box.width, `${label} runs past the right edge`).toBeLessThanOrEqual(viewport.width + 1);
          }
        }
      },
    });
  });

  test('the primary control is never covered by global chrome', async ({ page }) => {
    // REGRESSION. The feedback FAB is fixed bottom-left and landed on top of
    // the primary answer button, eating the tap. An element that is present but
    // covered passes every visibility assertion, so this asks the browser what
    // is actually at those coordinates.
    await openFresh(page);
    await expect(page.getByTestId('feedback-fab')).toBeHidden();

    await playToReveal(page, {
      onMove: async () => {
        const act = await currentAct(page);
        const primary =
          act === 'stimulus' ? page.getByTestId('tonight-pull')
          : act === 'twist' ? page.getByTestId('tonight-twist-stay')
          : null;
        if (!primary) return;
        const box = await primary.boundingBox();
        if (!box) return;
        const owner = await page.evaluate(
          ({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            return el?.closest('button')?.getAttribute('data-testid') ?? el?.tagName ?? 'none';
          },
          { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        );
        expect(owner, `${act}: something else owns the primary button's centre`).not.toBe('feedback-fab');
      },
    });
  });

  test('captures every act for visual review', async ({ page }, testInfo) => {
    /*
     * SCREENSHOTS, BECAUSE DOM ASSERTIONS ARE NOT VISUAL PROOF.
     *
     * Three real defects on this surface — the Twist rendered as a sentence
     * floating in an empty phone, the no-artwork card reading as a failed
     * image, and global chrome sitting on top of the primary button — passed
     * every assertion that existed while being obviously wrong to look at.
     *
     * An earlier version of this file tried to catch emptiness numerically, by
     * measuring the largest vertical gap between elements that paint. It was
     * deleted rather than tuned: the app draws a full-bleed background
     * gradient, so every screen counted as fully painted and the check could
     * never fire. A threshold strict enough to fire would have failed the
     * no-artwork card, which is a known gap awaiting real poster data, not a
     * regression to freeze into a passing test.
     *
     * So this writes one image per act per viewport to test-results/tonight/
     * and makes no claim about them. A person looks.
     *
     * Written to a path rather than attached: the `list` reporter discards
     * attachment bodies, so `testInfo.attach` produced a green test and zero
     * files on disk — proof that existed only inside the process that made it.
     */
    await openFresh(page);
    const captured = new Set<Act>();

    const shoot = async () => {
      const act = await currentAct(page);
      if (!act || captured.has(act)) return;
      captured.add(act);
      await page.screenshot({ path: `test-results/tonight/${testInfo.project.name}-${act}.png` });
    };

    await shoot();
    await playToReveal(page, { onMove: shoot });
    await shoot();

    expect(captured.size, 'no acts were captured').toBeGreaterThan(2);
  });
});
