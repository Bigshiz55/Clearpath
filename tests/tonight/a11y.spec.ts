import { test, expect } from '@playwright/test';
import { currentAct, openFresh, playToReveal } from './drive';

/**
 * PLAYABLE WITHOUT A TOUCHSCREEN, AND WITHOUT MOTION.
 *
 * The Tonight Machine is a fast tapping game, which is exactly the kind of
 * surface that ends up mouse-only by accident. These specs complete a whole
 * session using nothing but the keyboard, and again with motion disabled.
 */

test.describe('keyboard only', () => {
  test('a whole session can be played without a pointer', async ({ page }) => {
    await openFresh(page);

    for (let i = 0; i < 40; i++) {
      if (await page.getByTestId('tonight-reveal').isVisible().catch(() => false)) break;
      const act = await currentAct(page);
      if (!act) break;

      // Tab until focus lands on a control that answers the current move, then
      // press it. No clicks anywhere in this test.
      let pressed = false;
      for (let tab = 0; tab < 25 && !pressed; tab++) {
        await page.keyboard.press('Tab');
        const testid = await page.evaluate(
          () => document.activeElement?.getAttribute('data-testid') ?? '',
        );
        if (/^tonight-(option-|pull$|keep$|cut$|unseen$|twist-stay$|final-|continue$)/.test(testid)) {
          await page.keyboard.press('Enter');
          pressed = true;
        }
      }
      expect(pressed, `${act} could not be answered from the keyboard`).toBe(true);
      await page.waitForTimeout(240);
    }

    await expect(page.getByTestId('tonight-reveal')).toBeVisible();
  });

  test('focus is always visible on the control that has it', async ({ page }) => {
    await openFresh(page);
    await page.keyboard.press('Tab');

    // A keyboard player who cannot see where they are cannot play at all.
    const visible = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return false;
      const s = getComputedStyle(el);
      const ring = s.getPropertyValue('box-shadow');
      const outline = s.getPropertyValue('outline-style');
      return (outline !== 'none' && outline !== '') || (ring !== 'none' && ring !== '');
    });
    expect(visible, 'the focused control has no visible focus indicator').toBe(true);
  });
});

test.describe('reduced motion', () => {
  test('the session still completes with motion disabled', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFresh(page);
    await playToReveal(page);

    await expect(page.getByTestId('tonight-reveal')).toBeVisible();
    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([]);
  });
});

test.describe('semantics', () => {
  test('each act announces itself with a heading or a label', async ({ page }) => {
    await openFresh(page);

    await playToReveal(page, {
      onMove: async () => {
        const act = await currentAct(page);
        if (!act) return;
        // Something on screen must name what is being asked — a screen reader
        // landing on four unlabelled buttons has been told nothing.
        const named = await page.evaluate(() => {
          const heading = document.querySelector('h1, h2');
          const labelled = document.querySelector('[aria-label]');
          return Boolean(heading?.textContent?.trim() || labelled?.getAttribute('aria-label')?.trim());
        });
        expect(named, `${act} presents no heading or label`).toBe(true);
      },
    });
  });

  test('every control has an accessible name', async ({ page }) => {
    await openFresh(page);

    await playToReveal(page, {
      onMove: async () => {
        const unnamed = await page.evaluate(() =>
          [...document.querySelectorAll('button')]
            .filter((b) => (b as HTMLElement).offsetParent !== null)
            .filter((b) => !(b.textContent?.trim() || b.getAttribute('aria-label')?.trim()))
            .map((b) => b.getAttribute('data-testid') ?? b.outerHTML.slice(0, 60)),
        );
        expect(unnamed, `controls with no accessible name: ${unnamed.join(', ')}`).toEqual([]);
      },
    });
  });
});
