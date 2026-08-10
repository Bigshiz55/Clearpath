import { test, expect } from '@playwright/test';
import { mountHarness, openGrid, grid, cards, card, posterOf, pointerTo } from './harness';

/**
 * VISUAL PROOF — and the measurement that makes the screenshots evidence
 * rather than illustration.
 *
 * A screenshot cannot fail. So every artifact this file writes is paired with
 * a measured assertion about the same frame: the alignment shots are taken
 * beside a check that every action row in a grid row shares a bottom edge, and
 * the More Info shots beside a check that the drawer is actually carrying the
 * blocks it is being photographed for. The images are for a human; the
 * expectations are for CI.
 *
 * Artifacts land in `test-results/desktop/` (git-ignored — evidence is
 * produced by a run, not committed).
 */
const SHOTS = 'test-results/desktop';

/** Every action row's bottom edge, grouped by the visual grid row it sits in. */
async function rowsByGridRow(page: import('@playwright/test').Page) {
  return grid(page).evaluate((g) => {
    const out: { top: number; bottoms: number[]; titles: string[] }[] = [];
    for (const c of [...g.children]) {
      const act = c.querySelector('[data-testid="card-action-row"]');
      if (!act) continue;
      const cardTop = Math.round(c.getBoundingClientRect().top);
      const bottom = Math.round(act.getBoundingClientRect().bottom);
      const title = (c.querySelector('.line-clamp-2')?.textContent ?? '').slice(0, 22);
      const row = out.find((r) => Math.abs(r.top - cardTop) <= 2);
      if (row) {
        row.bottoms.push(bottom);
        row.titles.push(title);
      } else {
        out.push({ top: cardTop, bottoms: [bottom], titles: [title] });
      }
    }
    return out;
  });
}

test.describe('12 — differing card content, one action-row baseline', () => {
  // Three desktop widths, because the column count differs at each and the
  // property must not depend on how many columns the grid happens to have.
  for (const w of [1280, 1440, 1728] as const) {
    test(`FOR / AGAINST / SAVE share one baseline per grid row @ ${w}`, async ({ page }) => {
      const h = await mountHarness(page);
      await page.setViewportSize({ width: w, height: 1100 });
      await openGrid(page, h);

      const rows = await rowsByGridRow(page);
      expect(rows.length, 'no cards with an action row were found').toBeGreaterThan(0);

      let compared = 0;
      for (const r of rows) {
        if (r.bottoms.length < 2) continue;
        compared += 1;
        const rag = Math.max(...r.bottoms) - Math.min(...r.bottoms);
        expect(
          rag,
          `action rows are ragged by ${rag}px across [${r.titles.join(' | ')}] @ ${w}`,
        ).toBeLessThanOrEqual(1);
      }
      expect(compared, `no grid row at ${w} had two cards to compare`).toBeGreaterThan(0);

      await page.screenshot({ path: `${SHOTS}/grid-alignment-${w}.png`, fullPage: true });
    });
  }

  test('the fixture really is ragged — one-line and two-line titles side by side', async ({ page }) => {
    // WITHOUT THIS, the alignment assertions above would also pass on a grid of
    // six identical cards, and would be proving nothing.
    const h = await mountHarness(page);
    await openGrid(page, h);

    const heights = await grid(page).evaluate((g) =>
      [...g.children].map((c) => {
        const t = c.querySelector('.line-clamp-2') as HTMLElement | null;
        return t ? Math.round(t.getBoundingClientRect().height) : 0;
      }),
    );
    const distinct = new Set(heights);
    expect(
      distinct.size,
      `every title rendered at the same height (${[...distinct].join(', ')}) — the fixture is not ragged`,
    ).toBeGreaterThan(1);

    // …and the availability block genuinely differs card to card.
    const where = await grid(page).evaluate((g) =>
      [...g.children].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ')),
    );
    expect(where.some((t) => /Netflix/i.test(t)), 'no card shows a provider').toBe(true);
    expect(
      where.some((t) => /not currently confirmed|Notify me|Check availability/i.test(t)),
      'no card shows the honest-unknown availability state',
    ).toBe(true);
  });

  test('ARTIFACT — a card with a provider beside one without, at the same baseline', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    // 1000 (Netflix, 84 STREAM IT) and 1002 (checked/none, 22 SKIP IT).
    await card(page, 0).screenshot({ path: `${SHOTS}/card-provider-present.png` });
    await card(page, 2).screenshot({ path: `${SHOTS}/card-provider-absent.png` });
    await card(page, 4).screenshot({ path: `${SHOTS}/card-never-checked.png` });
    await card(page, 1).screenshot({ path: `${SHOTS}/card-two-line-title.png` });

    // Every one of those four carries the whole decision row.
    for (const i of [0, 1, 2, 4]) {
      await expect(card(page, i).getByTestId('card-action-row')).toBeVisible();
      await expect(card(page, i).getByTestId('card-verdict-for')).toBeVisible();
      await expect(card(page, i).getByTestId('card-verdict-against')).toBeVisible();
    }
  });

  test('ARTIFACT — four distinct verdicts render across the grid', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    const seen = await grid(page).evaluate((g) =>
      [...g.querySelectorAll('[data-testid="wv-score"]')].map((el) => el.getAttribute('data-call')),
    );
    const distinct = new Set(seen.filter(Boolean));
    expect(
      distinct.size,
      `the grid only produced ${distinct.size} verdict(s): ${[...distinct].join(', ')}`,
    ).toBeGreaterThanOrEqual(3);

    await grid(page).screenshot({ path: `${SHOTS}/grid-verdict-variance.png` });
  });
});

test.describe('ARTIFACT — desktop More Info', () => {
  test('the drawer carries every block it claims to, and is photographed', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    await card(page, 0).getByTestId('more-info-open').first().click();
    const mi = page.getByTestId('more-info');
    await expect(mi).toBeVisible();

    // The pink WV score and the semantic verdict, together, in one place.
    await expect(mi.locator('[data-testid="wv-score"]').first()).toBeVisible();
    await expect(mi.getByTestId('mi-about')).toBeVisible();
    await expect(mi.getByTestId('mi-why')).toBeVisible();
    await expect(mi.getByTestId('mi-watch-out')).toBeVisible();
    await expect(mi.getByTestId('mi-for-you')).toBeVisible();
    await expect(mi.getByTestId('mi-against-you')).toBeVisible();
    // External ratings.
    await expect(mi.getByText(/IMDb|Rotten|Audience|Metacritic/i).first()).toBeVisible();
    // The explicit trailer control and the decision row.
    await expect(mi.getByTestId('more-info-trailer')).toBeVisible();
    await expect(mi.getByTestId('more-info-actions')).toBeVisible();
    await expect(mi.getByTestId('card-verdict-for')).toBeVisible();
    await expect(mi.getByTestId('card-verdict-against')).toBeVisible();
    await expect(mi.getByRole('button', { name: /^Save$|Saved/i }).first()).toBeVisible();
    await expect(mi.getByTestId('more-info-full-verdict')).toBeVisible();

    await mi.screenshot({ path: `${SHOTS}/more-info-desktop.png` });
    await page.screenshot({ path: `${SHOTS}/more-info-desktop-over-grid.png` });
  });

  test('a SKIP title reads as a SKIP in the drawer too', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    await card(page, 2).getByTestId('more-info-open').first().click();
    const mi = page.getByTestId('more-info');
    await expect(mi).toBeVisible();
    await expect(mi.locator('[data-testid="wv-score"]').first()).toHaveAttribute('data-call', /SKIP/i);
    await mi.screenshot({ path: `${SHOTS}/more-info-desktop-skip.png` });
  });
});

test.describe('ARTIFACT — hover preview', () => {
  test('a poster mid-preview, and the same poster restored', async ({ page }) => {
    const h = await mountHarness(page);
    await openGrid(page, h);

    await pointerTo(page, posterOf(page, 0));
    await expect(posterOf(page, 0)).toHaveAttribute('data-playing', '1');
    // LET THE CROSSFADE FINISH (500ms). Shooting the instant the attribute
    // flips catches the poster half-faded, and the artifact then shows neither
    // state cleanly.
    await page.waitForTimeout(700);

    /* CLIP, NOT `locator.screenshot()`.
       An element screenshot scrolls its target into view first — which moves
       the card out from under the stationary pointer, fires pointerleave, and
       ENDS the preview before the shutter. The artifact then showed a restored
       poster while claiming to show a running preview: a green test producing a
       false picture. Clipping the page leaves the layout, and the pointer,
       exactly where they are. */
    const box = (await card(page, 0).boundingBox())!;
    await page.screenshot({ path: `${SHOTS}/card-hover-preview-active.png`, clip: box });
    // AND THE SHUTTER DID NOT DISTURB IT. Without this the artifact can go
    // wrong silently again.
    await expect(
      posterOf(page, 0),
      'the preview stopped while it was being photographed — the artifact is a lie',
    ).toHaveAttribute('data-playing', '1');

    await page.mouse.move(2, 2);
    await expect(posterOf(page, 0)).toHaveAttribute('data-playing', '0');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/card-hover-preview-restored.png`, clip: box });
  });
});

test.describe('ARTIFACT — mobile More Info still correct after the shared-component work', () => {
  // MILESTONE 6 asks for the mobile sheet to be RECONFIRMED, not re-derived:
  // milestones 1–4 shipped it, and every change since has been to components
  // both widths share. This is the regression check for that sharing.
  test('the bottom sheet opens, is reachable, and closes @ 390', async ({ page }) => {
    const h = await mountHarness(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openGrid(page, h);

    await cards(page).first().getByTestId('more-info-open').first().click();
    const mi = page.getByTestId('more-info');
    await expect(mi).toBeVisible();

    // THE STACKING-CONTEXT REGRESSION. `.card` carries `backdrop-blur`, which
    // creates a stacking context a nested `z-[60]` overlay cannot escape — the
    // close control sat UNDER the site header at 390px and could not be
    // clicked at all. The dialog is portalled to document.body; this proves it
    // still is, by clicking the control rather than by inspecting a z-index.
    const close = page.getByTestId('more-info-close');
    await expect(close).toBeVisible();
    const box = (await close.boundingBox())!;
    const onTop = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return !!el?.closest('[data-testid="more-info-close"]');
      },
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(onTop, 'something is covering the close control — the portal regressed').toBe(true);

    await mi.screenshot({ path: `${SHOTS}/more-info-mobile-390.png` });
    await close.click();
    await expect(mi).toHaveCount(0);
  });

  test('a tap never starts a hover preview on a touch viewport', async ({ page, browser }) => {
    // A REAL touch context — `hasTouch: true`, `(hover: none)`. The desktop
    // project cannot prove this by resizing, which is the whole reason the
    // desktop project exists in the first place.
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 3,
    });
    const p = await ctx.newPage();
    const h2 = await mountHarness(p);
    await openGrid(p, h2);

    const poster = p.getByTestId('qa-grid').locator('> div').first().getByTestId('trailer-media');
    await poster.tap();
    await p.waitForTimeout(900);

    await expect(poster, 'a tap started a trailer preview').toHaveAttribute('data-playing', '0');
    // The tap did what a tap is supposed to do.
    await expect(p.getByTestId('more-info')).toBeVisible();
    expect(h2.trailerRequests(), 'a tap hit the trailer resolver').toBe(0);

    await ctx.close();
  });

  test('the poster is a full-size tap target at 390, not a 32px sliver', async ({ page }) => {
    const h = await mountHarness(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openGrid(page, h);

    // THE TAP-TARGET REGRESSION. `h-full` on the poster link resolved against
    // the placeholder's own 32px inside the aspect-ratio box, so the largest
    // thing on the card was a 32px target. It is `absolute inset-0` now.
    const link = cards(page).first().getByTestId('more-info-open').first();
    const box = (await link.boundingBox())!;
    expect(box.height, `the poster tap target is ${Math.round(box.height)}px tall`).toBeGreaterThanOrEqual(44);

    // And the title's own 44px floor.
    const titleLink = cards(page).first().getByTestId('more-info-open').nth(1);
    const tbox = (await titleLink.boundingBox())!;
    expect(tbox.height, `the title tap target is ${Math.round(tbox.height)}px tall`).toBeGreaterThanOrEqual(44);
  });
});
