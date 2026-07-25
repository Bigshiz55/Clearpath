import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * VERDICT EVIDENCE — the score screen's honesty and layout, in a real browser.
 *
 * The defect this guards against: a title with one real rating rendered that
 * rating followed by eight "Not available" rows, so absence visually outweighed
 * evidence and every source looked equally involved in the score.
 */

const HARNESS = '/dev/verdict-evidence';
const SHOTS = 'test-results/verdict-evidence';

/** Data conditions A–J, from `src/lib/verdict/evidenceFixtures.ts`. */
const SCENARIOS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;

/** K–O: mobile portrait/landscape, iPad portrait/landscape, desktop. */
const VIEWPORTS: [string, number, number][] = [
  ['mobile-portrait', 390, 844],
  ['mobile-landscape', 844, 390],
  ['ipad-portrait', 820, 1180],
  ['ipad-landscape', 1180, 820],
  ['desktop', 1440, 900],
];

const go = (page: Page, scenario?: string) =>
  page.goto(scenario ? `${HARNESS}?scenario=${scenario}` : HARNESS);

/** Widest horizontal overflow anywhere on the page, in px. */
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const docOver = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    let worst = docOver;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('main *'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      worst = Math.max(worst, Math.ceil(r.right - document.documentElement.clientWidth));
    }
    return worst;
  });
}

test.describe('absence never dominates the default view', () => {
  test('the one-source case shows the source, not eight empty rows', async ({ page }) => {
    await go(page, 'A');
    const card = page.getByTestId('source-confidence');
    await expect(card).toBeVisible();

    // The one real source is named and valued, up front.
    await expect(page.getByTestId('evidence-headline')).toHaveText('Based on TMDB Audience.');
    await expect(page.getByTestId('contributing-sources')).toContainText('8.3/10 (443 votes)');

    // The eight missing ones are ONE summary line, not eight rows.
    await expect(page.getByTestId('unavailable-note')).toHaveText(
      '8 other rating sources were unavailable and were not counted.',
    );
    // "Not available" must not appear anywhere in the collapsed default view.
    await expect(card).not.toContainText('Not available');

    // And the collapsed card stays compact: the old panel grew with every
    // missing source, this one must not.
    const box = (await card.boundingBox())!;
    expect(box.height).toBeLessThan(320);
  });

  test('the default view is no taller when sources are missing than when present', async ({ page }) => {
    await go(page, 'D'); // everything present
    const full = (await page.getByTestId('source-confidence').boundingBox())!.height;
    await go(page, 'A'); // one present, eight missing
    const sparse = (await page.getByTestId('source-confidence').boundingBox())!.height;
    // The sparse case must not be the taller of the two — that inversion is
    // exactly the reported defect.
    expect(sparse).toBeLessThanOrEqual(full);
  });

  test('no unavailable source is listed by name until the details are opened', async ({ page }) => {
    await go(page, 'A');
    const NAMES = ['IMDb', 'Rotten Tomatoes', 'Metacritic', 'Trakt', 'Letterboxd', 'Roger Ebert'];

    // Read what a user can actually SEE. `toContainText` walks textContent, so
    // it would find the collapsed <details> markup and prove nothing about the
    // rendered view — the whole defect is about visual dominance.
    const visible = () =>
      page.evaluate(() => {
        const card = document.querySelector('[data-testid="source-confidence"]')!;
        let text = '';
        const walk = (n: Element) => {
          for (const child of Array.from(n.children)) {
            if (child.tagName === 'DETAILS' && !(child as HTMLDetailsElement).open) continue;
            walk(child);
          }
          if (n.children.length === 0) text += ` ${(n as HTMLElement).innerText ?? ''}`;
        };
        walk(card);
        return text;
      });

    const collapsed = await visible();
    for (const name of NAMES) expect(collapsed, name).not.toContain(name);
    await expect(page.getByTestId('detail-unavailable')).toBeHidden();

    await page.getByTestId('source-details-toggle').click();
    const body = page.getByTestId('source-details-body');
    for (const name of NAMES) await expect(body).toContainText(name);
  });
});

test.describe('the source-details expansion', () => {
  test('is collapsed by default and opens on click', async ({ page }) => {
    await go(page, 'D');
    await expect(page.getByTestId('source-details-body')).toBeHidden();
    await page.getByTestId('source-details-toggle').click();
    await expect(page.getByTestId('source-details-body')).toBeVisible();
  });

  test('identifies every contributing source and says whether it was counted', async ({ page }) => {
    await go(page, 'D');
    await page.getByTestId('source-details-toggle').click();

    const counted = page.getByTestId('detail-counted');
    for (const name of ['TMDB Audience', 'IMDb', 'Rotten Tomatoes', 'RT Audience', 'Metacritic']) {
      await expect(counted).toContainText(name);
    }
    // Each counted row states its share of the blend.
    expect((await counted.innerText()).match(/Counted — \d+% of the blended quality score/g))
      .toHaveLength(5);

    // The community feeds are present but explicitly NOT counted — the old
    // panel listed them identically to the ones that were.
    const context = page.getByTestId('detail-context');
    for (const name of ['Metacritic Users', 'Trakt', 'Letterboxd', 'Roger Ebert']) {
      await expect(context).toContainText(name);
    }
    expect((await context.innerText()).match(/not counted toward the score/gi)).toHaveLength(4);
  });

  test('states a retrieval date and refuses to claim per-source freshness', async ({ page }) => {
    await go(page, 'A');
    await page.getByTestId('source-details-toggle').click();
    const note = page.getByTestId('detail-footnote');
    await expect(note).toContainText('Ratings retrieved');
    await expect(note).toContainText('do not publish a per-source timestamp');
  });

  test('is reachable and operable from the keyboard', async ({ page }) => {
    await go(page, 'A');
    await page.getByTestId('source-details-toggle').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('source-details-body')).toBeVisible();
  });
});

test.describe('unavailable values are never presented as scores', () => {
  test('a missing source reads as absent, not as a low rating', async ({ page }) => {
    await go(page, 'A');
    await page.getByTestId('source-details-toggle').click();
    const unavailable = page.getByTestId('detail-unavailable');
    const text = await unavailable.innerText();
    expect(text).toContain('No data');
    expect(text).toContain('not treated as a low score');
    // No numeric value may appear beside an unavailable source.
    expect(text).not.toMatch(/\b\d+(\.\d+)?\s*(\/10|%|\/100)\b/);
  });

  test('a critic score is never implied when critics are missing', async ({ page }) => {
    await go(page, 'H'); // strong audience, no critic aggregator
    const body = (await page.getByTestId('scenario-H').innerText()).toLowerCase();
    expect(body).not.toMatch(/estimated critic|inferred critic|reconstruct/);
  });

  test('a neutral baseline is labelled as a baseline', async ({ page }) => {
    await go(page, 'I'); // critics present, no audience rating
    await expect(page.getByTestId('baseline-audience')).toBeVisible();
    await expect(page.getByTestId('basis-audience')).toContainText('neutral baseline');
    await expect(page.getByTestId('basis-audience')).toContainText('Nothing was inferred');
    // …and not applied where the data does exist.
    await go(page, 'B');
    await expect(page.getByTestId('baseline-audience')).toHaveCount(0);
  });
});

test.describe('evidence strength and score qualification', () => {
  test('every scenario shows a strength label', async ({ page }) => {
    await go(page);
    for (const id of SCENARIOS) {
      const section = page.getByTestId(`scenario-${id}`);
      await expect(section.getByTestId('evidence-strength'), id).toBeVisible();
      await expect(section.getByTestId('evidence-strength')).toContainText(/Strong|Moderate|Limited/);
    }
  });

  test('labels are deterministic across reloads', async ({ page }) => {
    const read = async () => {
      await go(page);
      return Promise.all(
        SCENARIOS.map((id) => page.getByTestId(`scenario-${id}`).getAttribute('data-strength')),
      );
    };
    expect(await read()).toEqual(await read());
  });

  test('thin evidence qualifies the score instead of hiding it', async ({ page }) => {
    await go(page, 'E'); // nothing available at all
    await expect(page.getByTestId('score-qualifier')).toHaveText('Early prediction');
    await expect(page.getByTestId('scenario-E')).toContainText('Watchability score');

    await go(page, 'F'); // one source, 7 votes
    await expect(page.getByTestId('score-qualifier')).toHaveText('Limited-source prediction');
  });

  test('well-evidenced scores carry no qualifier', async ({ page }) => {
    await go(page, 'D');
    await expect(page.getByTestId('score-qualifier')).toHaveCount(0);
  });
});

test.describe('derived factors state their basis', () => {
  test('all four factors explain what they are computed from', async ({ page }) => {
    await go(page, 'B');
    for (const key of ['quality', 'audience', 'watchability', 'engagement']) {
      const basis = page.getByTestId(`basis-${key}`);
      await expect(basis, key).toBeVisible();
      expect((await basis.innerText()).length, key).toBeGreaterThan(20);
    }
    await expect(page.getByTestId('basis-quality')).toContainText('IMDb');
    await expect(page.getByTestId('basis-audience')).toContainText('vote');
    await expect(page.getByTestId('basis-watchability')).toContainText('runtime');
  });

  test('every factor in every scenario has a basis — no unexplained precision', async ({ page }) => {
    await go(page);
    for (const id of SCENARIOS) {
      const section = page.getByTestId(`scenario-${id}`);
      for (const key of ['quality', 'audience', 'watchability', 'engagement']) {
        await expect(section.getByTestId(`basis-${key}`), `${id}/${key}`).not.toBeEmpty();
      }
    }
  });
});

test.describe('Your Match adjustments stay attached to the explanation', () => {
  test('sit inside the same section as the score factors', async ({ page }) => {
    await go(page, 'A');
    const sameSection = await page.evaluate(() => {
      const adj = document.querySelector('[data-testid="match-adjustments"]');
      const factors = document.querySelector('[data-testid="score-factors"]');
      return adj?.closest('section') === factors?.closest('section');
    });
    expect(sameSection).toBe(true);
  });

  test('follow the factors closely, not adrift down the page', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await go(page, 'A');
    const factors = (await page.getByTestId('score-factors').boundingBox())!;
    const adj = (await page.getByTestId('match-adjustments').boundingBox())!;
    const gap = adj.y - (factors.y + factors.height);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(120);
  });
});

test.describe('layout across every breakpoint', () => {
  for (const [label, w, h] of VIEWPORTS) {
    test(`no overflow, no clipping at ${label} (${w}×${h})`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await go(page);
      expect(await overflow(page), 'horizontal overflow').toBeLessThanOrEqual(0);

      // Every scenario's card is visible and no text is clipped out of it.
      for (const id of SCENARIOS) {
        const card = page.getByTestId(`scenario-${id}`).getByTestId('source-confidence');
        await expect(card, `${id} @ ${label}`).toBeVisible();
        const clipped = await card.evaluate(
          (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
        );
        expect(clipped, `${id} clipped @ ${label}`).toBe(false);
      }
      await page.screenshot({ path: path.join(SHOTS, `all-${label}.png`), fullPage: true });
    });
  }

  test('stacks on mobile: explanation first, evidence card underneath', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go(page, 'A');
    const factors = (await page.getByTestId('score-factors').boundingBox())!;
    const card = (await page.getByTestId('source-confidence').boundingBox())!;
    expect(card.y).toBeGreaterThan(factors.y);
    // Single column: they must not sit side by side.
    expect(card.y).toBeGreaterThanOrEqual(factors.y + factors.height - 2);
    // And the details start collapsed on a phone.
    await expect(page.getByTestId('source-details-body')).toBeHidden();
  });

  test('two columns on tablet and desktop, aligned at the top', async ({ page }) => {
    for (const [label, w, h] of [['ipad-portrait', 820, 1180], ['desktop', 1440, 900]] as const) {
      await page.setViewportSize({ width: w, height: h });
      await go(page, 'A');
      const factors = (await page.getByTestId('score-factors').boundingBox())!;
      const card = (await page.getByTestId('source-confidence').boundingBox())!;
      expect(card.x, `${label} side by side`).toBeGreaterThan(factors.x + factors.width - 2);
      expect(Math.abs(card.y - factors.y), `${label} top-aligned`).toBeLessThanOrEqual(2);
      // The card must not stretch into a tall empty box beside short bars.
      expect(card.height, `${label} no oversized empty area`).toBeLessThanOrEqual(factors.height + 60);
    }
  });

  test('long localized labels do not overflow or clip at any width', async ({ page }) => {
    for (const [label, w, h] of VIEWPORTS) {
      await page.setViewportSize({ width: w, height: h });
      await go(page, 'J');
      expect(await overflow(page), `${label} overflow`).toBeLessThanOrEqual(0);
      // The long French title and genre list must render in full, not clipped.
      await expect(page.getByTestId('scenario-title')).toContainText('Thriller international');
      await expect(page.getByTestId('scenario-title')).toContainText(
        'une seule ligne',
      );
    }
  });
});

test.describe('the tablet header does not collide', () => {
  for (const [label, w, h] of VIEWPORTS) {
    test(`header controls never overlap at ${label}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await go(page, 'A');

      const boxes = await page.evaluate(() => {
        const header = document.querySelector('header');
        if (!header) return [];
        // Leaf-level interactive controls only — nesting is not collision.
        return Array.from(header.querySelectorAll<HTMLElement>('a, button'))
          .filter((el) => !el.querySelector('a, button'))
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              label: (el.getAttribute('aria-label') || el.innerText || el.title || '?').trim().slice(0, 40),
              x: r.x, y: r.y, w: r.width, h: r.height,
            };
          })
          .filter((b) => b.w > 0 && b.h > 0);
      });

      expect(boxes.length, 'header must expose controls').toBeGreaterThan(0);
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!, b = boxes[j]!;
          const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          const overlapping = overlapX > 1 && overlapY > 1;
          expect(overlapping, `"${a.label}" overlaps "${b.label}" @ ${label}`).toBe(false);
        }
      }

      // Nothing may spill past the right edge of the viewport.
      for (const b of boxes) {
        expect(Math.ceil(b.x + b.w), `"${b.label}" past the edge @ ${label}`).toBeLessThanOrEqual(w + 1);
      }
      await page.screenshot({ path: path.join(SHOTS, `header-${label}.png`) });
    });
  }

  test('the desktop-only view switch is never inline in the main navigation', async ({ page }) => {
    for (const [label, w, h] of VIEWPORTS) {
      await page.setViewportSize({ width: w, height: h });
      await go(page, 'A');

      // Not inline at ANY width — it is a preview switch, not a destination.
      await expect(
        page.getByRole('button', { name: /Desktop view|Phone view/ }),
        label,
      ).toBeHidden();

      // Reachable from one clearly labelled overflow, at every width.
      const toggle = page.getByTestId('header-overflow-toggle');
      await expect(toggle, label).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-label', 'More options');
      await toggle.click();
      await expect(page.getByTestId('header-overflow-menu')).toBeVisible();
      await expect(page.getByRole('button', { name: /Desktop view|Phone view/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    }
  });

  test('a destination is never offered twice at the same time', async ({ page }) => {
    for (const [label, w, h] of VIEWPORTS) {
      await page.setViewportSize({ width: w, height: h });
      await go(page, 'A');
      // Scoped to navigation landmarks. A logo that links home alongside a Home
      // tab is a normal pattern, not the duplicated navigation being guarded
      // against — that was the top bar and the bottom bar offering the same
      // destinations at the same time.
      const dupes = await page.evaluate(() => {
        const seen = new Map<string, number>();
        for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('nav a[href^="/app"]'))) {
          if (a.offsetParent === null) continue; // not rendered
          const href = a.getAttribute('href')!;
          seen.set(href, (seen.get(href) ?? 0) + 1);
        }
        return [...seen.entries()].filter(([, n]) => n > 1).map(([h, n]) => `${h}×${n}`);
      });
      expect(dupes, `duplicate destinations @ ${label}`).toEqual([]);
    }
  });

  test('no label is partially hidden behind another control', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await go(page, 'A');
    const truncated = await page.evaluate(() => {
      const header = document.querySelector('header')!;
      return Array.from(header.querySelectorAll<HTMLElement>('a, button, span'))
        .filter((el) => el.innerText.trim().length > 0 && el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.innerText.trim().slice(0, 40));
    });
    expect(truncated).toEqual([]);
  });
});
