import { test, expect } from '@playwright/test';
import { mountHarness, openGrid, grid, cards, card, posterOf, pointerTo, players } from './harness';

/**
 * THE DESKTOP INTERACTION CONTRACT, ASSERTED AS A CONTRACT.
 *
 *   Poster hover  → muted trailer preview     (hover-trailer.spec.ts)
 *   Poster click  → More Info
 *   Title click   → More Info
 *   Trailer       → deliberate playback, and NOTHING else
 *   FOR           → vote only
 *   AGAINST       → vote only
 *   SAVE          → save only
 *
 * The through-line is that no child action may bubble into More Info. Every
 * control on the card is a SIBLING of the poster link rather than a descendant
 * of it (see PosterCard), which is what makes that structural instead of a
 * `stopPropagation` someone can forget on the next control they add.
 */

test.describe('click = understand it', () => {
  test('7 — clicking the poster opens More Info without leaving the results', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);
    const url = page.url();

    await card(page, 0).getByTestId('more-info-open').first().click();

    await expect(page.getByTestId('more-info')).toBeVisible();
    expect(page.url(), 'clicking the poster navigated away from the results').toBe(url);
    await expect(grid(page), 'the results unmounted').toBeAttached();
    await expect(cards(page)).toHaveCount(6);
  });

  test('8 — clicking the title opens the same More Info', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    // Two openers per card: the poster, then the heading.
    const opens = card(page, 0).getByTestId('more-info-open');
    await expect(opens).toHaveCount(2);
    await opens.nth(1).click();

    await expect(page.getByTestId('more-info')).toBeVisible();
    await expect(page.getByTestId('more-info-actions')).toBeVisible();
  });

  test('a modified click is not stolen — the real page still opens in a new tab', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    const link = card(page, 0).getByTestId('more-info-open').first();
    await expect(link).toHaveAttribute('href', /\/app\/title\//);
    await link.click({ modifiers: ['ControlOrMeta'] });
    await expect(page.getByTestId('more-info'), 'a modified click was swallowed by More Info').toHaveCount(0);
  });
});

test.describe('10 — FOR / AGAINST / SAVE do their own job and nothing else', () => {
  test('FOR votes and does not open More Info', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    const c = card(page, 0);
    await c.getByTestId('card-verdict-for').click();
    await expect(c.getByTestId('card-verdict-for')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('more-info'), 'FOR opened More Info').toHaveCount(0);
  });

  test('AGAINST votes and does not open More Info', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    const c = card(page, 0);
    await c.getByTestId('card-verdict-against').click();
    await expect(c.getByTestId('card-verdict-against')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('more-info'), 'AGAINST opened More Info').toHaveCount(0);
  });

  test('SAVE saves and does not open More Info', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    const save = card(page, 0).getByRole('button', { name: /^Save$|Saved/i }).first();
    await expect(save).toBeVisible();
    await save.click();
    await expect(page.getByTestId('more-info'), 'SAVE opened More Info').toHaveCount(0);
  });

  test('the W on the artwork — the highest-risk bubbling case — stays isolated', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    // The W sits INSIDE the poster box, the one place a control shares a
    // container with the card's click target.
    const w = card(page, 0).locator('button[data-testid^="w-check-"]').first();
    await expect(w).toBeVisible();
    await w.click();
    await expect(page.getByTestId('more-info'), 'the W opened More Info').toHaveCount(0);
  });

  test('every isolated control still works while a hover preview is running', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    // Start a preview, THEN act on the card. A preview must not make the rest
    // of the card unreachable.
    await pointerTo(page, posterOf(page, 0));
    await expect(posterOf(page, 0)).toHaveAttribute('data-playing', '1');

    const c = card(page, 0);
    await c.getByTestId('card-verdict-for').click();
    await expect(c.getByTestId('card-verdict-for')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('more-info')).toHaveCount(0);
  });
});

test.describe('11 — More Info restores the exact result state on close', () => {
  test('SCROLL RESTORATION — the card is where it was, and so is the page', async ({ page }) => {
    const h = await mountHarness(page);
    await page.setViewportSize({ width: 1440, height: 700 });
    await openGrid(page, h);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
    const scrolled = await page.evaluate(() => window.scrollY);
    expect(scrolled, 'the fixture must be scrollable for this test to mean anything').toBeGreaterThan(150);

    const target = cards(page).last();
    const opener = target.getByTestId('more-info-open').first();
    /* SETTLE THE VIEWPORT BEFORE TAKING THE BASELINE.
       Playwright's `click()` scrolls its target into view before dispatching,
       so a baseline captured earlier compares two different scroll positions
       and fails a component that is behaving correctly. Measured during the
       mobile pass: the page moved 1040 → 350 on the click, the drawer captured
       and restored 350 exactly, and the test called it a 690px regression. */
    await opener.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const settled = await page.evaluate(() => window.scrollY);
    const yBefore = (await target.boundingBox())!.y;

    await opener.click();
    await expect(page.getByTestId('more-info')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('more-info')).toHaveCount(0);
    await page.waitForTimeout(250);

    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - settled), `scroll jumped ${Math.round(after - settled)}px`).toBeLessThanOrEqual(2);
    const yAfter = (await target.boundingBox())!.y;
    expect(Math.abs(yAfter - yBefore), 'the card moved in the viewport').toBeLessThanOrEqual(2);
  });

  test('votes cast before opening survive the close', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    const c = card(page, 0);
    await c.getByTestId('card-verdict-for').click();
    await expect(c.getByTestId('card-verdict-for')).toHaveAttribute('data-active', 'true');

    await c.getByTestId('more-info-open').nth(1).click();
    await expect(page.getByTestId('more-info')).toBeVisible();
    await page.getByTestId('more-info-close').click();
    await expect(page.getByTestId('more-info')).toHaveCount(0);

    await expect(c.getByTestId('card-verdict-for'), 'the vote was lost on close').toHaveAttribute(
      'data-active',
      'true',
    );
    await expect(cards(page)).toHaveCount(6);
  });
});

test.describe('16 — keyboard and focus', () => {
  test('Enter on the focused poster link opens More Info, Escape closes it, focus returns', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    const opener = card(page, 0).getByTestId('more-info-open').first();
    await opener.focus();
    await expect(opener).toBeFocused();

    await page.keyboard.press('Enter');
    const mi = page.getByTestId('more-info');
    await expect(mi).toBeVisible();

    // Focus ENTERED the dialog rather than being left behind on the card.
    const insidePanel = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="more-info"]');
      return !!panel && (panel === document.activeElement || panel.contains(document.activeElement));
    });
    expect(insidePanel, 'focus stayed outside the dialog').toBe(true);

    await page.keyboard.press('Escape');
    await expect(mi).toHaveCount(0);
    await expect(opener, 'focus was not returned to the invoking card').toBeFocused();
  });

  test('Tab cycles inside the dialog and never escapes into the results behind it', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    await card(page, 0).getByTestId('more-info-open').first().click();
    await expect(page.getByTestId('more-info')).toBeVisible();

    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="more-info"]');
        return !!panel && panel.contains(document.activeElement);
      });
      expect(inside, `Tab #${i + 1} walked out of the dialog into the inert results`).toBe(true);
    }
  });

  test('the poster and the trailer control are announced as different things', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    const c = card(page, 0);
    await expect(c.getByTestId('more-info-open').first()).toHaveAttribute('aria-label', /more information/i);
    await expect(c.getByTestId('trailer-play')).toHaveAttribute('aria-label', /play .* trailer/i);
  });
});

test.describe('More Info content — desktop', () => {
  test('13 — the WatchVerd1ct mark is the SAME pink component on the card and in the drawer', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    /* THE BRAND PINK IS READ FROM COMPUTED STYLE, NOT FROM THE MARKUP.
       `#ff1493` is written as an inline style in `Verd1ctBadge`, and the
       browser serialises it back as `rgb(255, 20, 147)` — so a string search
       for the hex in `innerHTML` finds nothing and would fail a mark that is
       drawn perfectly. Asking the engine what colour it actually painted is
       both correct and stricter: it would also catch the colour being
       overridden by a later rule. */
    const read = (sel: string) =>
      page.locator(sel).first().evaluate((el) => {
        const PINK = 'rgb(255, 20, 147)';
        const paintsBrandPink = [el, ...el.querySelectorAll('*')].some((node) => {
          const cs = getComputedStyle(node as Element);
          return [cs.backgroundImage, cs.backgroundColor, cs.color, cs.fill, cs.borderColor, cs.boxShadow].some(
            (v) => (v ?? '').includes(PINK),
          );
        });
        const call = el.querySelector('[data-testid="wv-score-call"]');
        return {
          hasBadgeSvg: !!el.querySelector('svg'),
          call: el.getAttribute('data-call'),
          // The semantic verdict pill keeps its own colour — green/amber/red —
          // which is the distinction the owner fixed: the SCORE identity is
          // pink, the VERDICT stays semantic.
          callClasses: (call as HTMLElement | null)?.className ?? '',
          paintsBrandPink,
        };
      });

    const onCard = await read('[data-testid="qa-grid"] [data-testid="wv-score"]');
    expect(onCard.hasBadgeSvg, 'the card lost the pink Verd1ct mark').toBe(true);
    expect(onCard.paintsBrandPink, 'the card’s score is not drawn in the brand pink').toBe(true);

    await card(page, 0).getByTestId('more-info-open').first().click();
    await expect(page.getByTestId('more-info')).toBeVisible();
    const inDrawer = await read('[data-testid="more-info"] [data-testid="wv-score"]');

    expect(inDrawer.hasBadgeSvg, 'More Info lost the pink Verd1ct mark').toBe(true);
    expect(inDrawer.paintsBrandPink, 'the drawer’s score is not drawn in the brand pink').toBe(true);
    expect(inDrawer.call).toBe(onCard.call);
  });

  test('the verdict keeps SEMANTIC colour while the score stays pink', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    /* MEASURED IN PAINTED COLOUR, NOT IN CLASS NAMES.
       `emerald-100` is a Tailwind token, and asserting on the token proves the
       class survived, not that anything is green. Reading back what the engine
       painted is what the claim actually is — and it keeps working if the
       palette is renamed. */
    const calls = await grid(page).evaluate((g) => {
      const rgb = (v: string): [number, number, number] => {
        const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
      };
      return [...g.querySelectorAll('[data-testid="wv-score"]')].map((el) => {
        // The card overrides the call's test id (`verdict-call`); the drawer
        // and the strip keep the default. Accept either — the component is the
        // same one, which is the point of the shared mark.
        const pill = el.querySelector('[data-testid="verdict-call"], [data-testid="wv-score-call"]');
        const cs = pill ? getComputedStyle(pill) : null;
        return {
          call: el.getAttribute('data-call'),
          score: el.getAttribute('data-score'),
          text: cs ? rgb(cs.color) : null,
        };
      });
    });
    expect(calls.length, 'no scores rendered on the grid').toBeGreaterThan(0);

    const green = calls.find((c) => /STREAM/i.test(c.call ?? ''));
    const red = calls.find((c) => /SKIP/i.test(c.call ?? ''));
    expect(green, 'the fixture produced no STREAM IT verdict').toBeTruthy();
    expect(red, 'the fixture produced no SKIP verdict').toBeTruthy();

    const [gr, gg] = green!.text!;
    const [rr, rg] = red!.text!;
    expect(gg, 'STREAM IT is not drawn in a positive (green-dominant) colour').toBeGreaterThan(gr);
    expect(rr, 'SKIP is not drawn in a negative (red-dominant) colour').toBeGreaterThan(rg);
  });

  test('14 + 15 — WHY YOU’LL LIKE IT and WATCH OUT render from real evidence', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    await card(page, 0).getByTestId('more-info-open').first().click();
    const mi = page.getByTestId('more-info');
    await expect(mi).toBeVisible();

    await expect(mi.getByTestId('mi-why')).toBeVisible();
    await expect(mi.getByTestId('mi-watch-out')).toBeVisible();

    // THE EVIDENCE IS NAMED, and it is the same evidence the sentences were
    // composed from — the axes the profile actually holds, not adjectives.
    await expect(mi.getByTestId('mi-for-you')).toContainText(/Mystery complexity/i);
    await expect(mi.getByTestId('mi-against-you')).toContainText(/Pacing/i);

    // The sentences must be BUILT FROM those axes, not written alongside them.
    // A generic hype line would satisfy "a paragraph is present"; naming the
    // axis is what makes it evidence.
    const why = (await mi.getByTestId('mi-why').textContent()) ?? '';
    expect(why.toLowerCase(), `Why you'll like it did not cite an axis: "${why}"`).toContain('puzzle-forward');
    const watchOut = (await mi.getByTestId('mi-watch-out').textContent()) ?? '';
    expect(watchOut.toLowerCase(), `Watch out did not cite an axis: "${watchOut}"`).toContain('pacing');

    // …and the copy is not the mangled double-phrasing a wrong note shape
    // produces ("You rate you rate these highly …").
    expect(why, 'the personalization sentence is malformed').not.toMatch(/You rate you rate/i);

    // WHAT IT'S ABOUT stays a separate, objective block.
    await expect(mi.getByTestId('mi-about')).toContainText(/seven deadly sins/i);
  });

  test('personalization is SILENT rather than generic when there is no profile', async ({ page }) => {
    const h = await mountHarness(page);
    // A profile with too few samples to personalize — the block must render
    // nothing at all rather than inventing a preference.
    await page.route('**/api/dna/**', (route) =>
      route.fulfill({ json: { dna: { score: 70, confidence: 0.1, available: false, sampleSize: 0, fit: null } } }),
    );
    await openGrid(page, h);

    await card(page, 0).getByTestId('more-info-open').first().click();
    const mi = page.getByTestId('more-info');
    await expect(mi).toBeVisible();
    await expect(mi.getByTestId('mi-about')).toBeVisible(); // the objective half still shows
    await expect(mi.getByTestId('mi-fit'), 'personalization was invented without a profile').toHaveCount(0);
  });

  test('More Info carries the full decision — act without opening Full Verdict', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    await card(page, 0).getByTestId('more-info-open').first().click();
    const mi = page.getByTestId('more-info');
    await expect(mi.getByTestId('card-verdict-for')).toBeVisible();
    await expect(mi.getByTestId('card-verdict-against')).toBeVisible();
    await expect(mi.getByRole('button', { name: /^Save$|Saved/i }).first()).toBeVisible();
    await expect(mi.getByTestId('more-info-trailer')).toBeVisible();
    await expect(mi.getByTestId('more-info-full-verdict')).toBeVisible();
    await expect(mi.locator('[data-testid="wv-score"]').first()).toBeVisible();
  });

  test('the drawer’s trailer is EXPLICIT — opening More Info never starts one', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    await card(page, 0).getByTestId('more-info-open').first().click();
    const mi = page.getByTestId('more-info');
    await expect(mi).toBeVisible();
    await expect(mi.locator('iframe'), 'More Info autoplayed a trailer on open').toHaveCount(0);
    // …and no card preview is left running behind it either.
    await expect(players(page)).toHaveCount(0);

    await mi.getByTestId('more-info-trailer').click();
    await expect(mi.locator('iframe')).toHaveCount(1);
  });
});
