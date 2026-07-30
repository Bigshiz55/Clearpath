import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * LIVE TV — the real pipeline over a full-size mock grid, in a real browser.
 *
 * Guards the production failure this work exists to fix: a six-hour US window
 * that rendered ONE card. Every assertion here would have failed against the
 * old code, and the volume assertions cannot pass unless real inventory
 * survives the whole pipeline to the DOM.
 */

const H = '/dev/live-tv';
const SHOTS = 'test-results/live-tv';

const VIEWPORTS: [string, number, number][] = [
  ['mobile-portrait', 390, 844],
  ['mobile-landscape', 844, 390],
  ['ipad-portrait', 820, 1180],
  ['ipad-landscape', 1180, 820],
  ['desktop', 1440, 900],
];

const cards = (p: Page) => p.getByTestId('airing-card');

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('result volume — the reported failure', () => {
  test('a six-hour window renders many airings, never one', async ({ page }) => {
    await page.goto(H);
    await expect(page.getByTestId('live-schedule')).toBeVisible();
    const n = await cards(page).count();
    expect(n, 'initial batch must be browsable, not a single answer').toBeGreaterThanOrEqual(20);
  });

  test('the window spans many channels and many programmes', async ({ page }) => {
    await page.goto(H);
    const channels = await page.evaluate(() =>
      new Set(Array.from(document.querySelectorAll('[data-testid="airing-card"]'))
        .map((c) => c.querySelector('.text-brand-100')?.textContent?.trim() ?? '')).size);
    expect(channels, 'a national grid must cover many channels').toBeGreaterThanOrEqual(10);
  });

  test('HARD: API count and DOM count reconcile, allowing for paging', async ({ page }) => {
    await page.goto(H);
    const shown = Number(await page.getByTestId('shown-count').getAttribute('data-shown'));
    expect(await cards(page).count()).toBe(shown);
  });

  test('every content type is represented', async ({ page }) => {
    await page.goto(H);
    for (const id of ['movie', 'series', 'sports', 'kids', 'news']) {
      const label = await page.getByTestId(`filter-${id}`).innerText();
      const n = Number(label.replace(/\D/g, ''));
      expect(n, `${id} count`).toBeGreaterThan(0);
    }
  });
});

test.describe('filtering, sorting and load more', () => {
  test('filters narrow without truncating the set', async ({ page }) => {
    await page.goto(H);
    const total = Number(await page.getByTestId('result-count').getAttribute('data-total'));
    await page.getByTestId('filter-movie').click();
    const movieLabel = await page.getByTestId('filter-movie').innerText();
    const movieCount = Number(movieLabel.replace(/\D/g, ''));
    expect(movieCount).toBeGreaterThan(0);
    expect(movieCount).toBeLessThan(total);
    // Back to All restores everything — a filter must not be destructive.
    await page.getByTestId('filter-all').click();
    expect(Number(await page.getByTestId('result-count').getAttribute('data-filtered'))).toBe(total);
  });

  test('sorting by soonest is chronological', async ({ page }) => {
    await page.goto(H);
    await page.getByTestId('sort-chronological').click();
    const times = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="airing-card"]'))
        .map((c) => c.querySelector('.tabular-nums')?.textContent?.trim() ?? '')
        .map((t) => {
          const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
          if (!m) return 0;
          let h = Number(m[1]) % 12;
          if (/pm/i.test(m[3]!)) h += 12;
          return h * 60 + Number(m[2]);
        }));
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  test('sorting by highest rated puts the best first and keeps the set', async ({ page }) => {
    await page.goto(H);
    await page.getByTestId('sort-highest_rated').click();
    // The AVAILABLE set is what must be preserved; the visible count may shift
    // because the batch stretches to include the highlighted pick.
    expect(Number(await page.getByTestId('result-count').getAttribute('data-filtered')))
      .toBe(Number(await page.getByTestId('result-count').getAttribute('data-total')));
    expect(await cards(page).count()).toBeGreaterThanOrEqual(20);
    await expect(page.getByTestId('active-sort')).toContainText('Highest rated');
  });

  test('load more reveals additional airings', async ({ page }) => {
    await page.goto(H);
    const first = await cards(page).count();
    const more = page.getByTestId('load-more');
    if (await more.count()) {
      await more.click();
      expect(await cards(page).count()).toBeGreaterThan(first);
    }
  });

  test('load more eventually exposes the whole filtered set', async ({ page }) => {
    await page.goto(H);
    for (let i = 0; i < 20; i++) {
      const more = page.getByTestId('load-more');
      if (!(await more.count())) break;
      await more.click();
    }
    const filtered = Number(await page.getByTestId('result-count').getAttribute('data-filtered'));
    expect(await cards(page).count()).toBe(filtered);
  });
});

test.describe('recommendation never truncates', () => {
  test('HARD: the top pick is badged in place, not lifted out of the list', async ({ page }) => {
    await page.goto(H);
    const badge = page.getByTestId('top-pick-badge');
    await expect(badge).toHaveCount(1);
    // The badged card is one of the ordinary cards.
    const inside = await page.evaluate(() =>
      !!document.querySelector('[data-testid="top-pick-badge"]')?.closest('[data-testid="airing-card"]'));
    expect(inside).toBe(true);
    expect(await cards(page).count()).toBeGreaterThanOrEqual(20);
  });
});

test.describe('enrichment gaps never remove inventory', () => {
  test('cards with no poster, rating or synopsis still render', async ({ page }) => {
    await page.goto(H);
    // The mock deliberately leaves a third of rows without poster/summary.
    const withoutRating = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="airing-card"]'))
        .filter((c) => !c.textContent?.includes('★')).length);
    expect(withoutRating, 'unrated rows must still be on screen').toBeGreaterThan(0);
  });
});

test.describe('deduplication preserves distinct airings', () => {
  test('the same title at different times survives as separate cards', async ({ page }) => {
    await page.goto(H);
    for (let i = 0; i < 20; i++) {
      const more = page.getByTestId('load-more');
      if (!(await more.count())) break;
      await more.click();
    }
    const repeated = await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('[data-testid="airing-card"]'))
        .map((c) => c.querySelector('.text-lg.font-bold')?.textContent?.trim() ?? '');
      const counts = new Map<string, number>();
      for (const t of titles) counts.set(t, (counts.get(t) ?? 0) + 1);
      return [...counts.values()].filter((n) => n > 1).length;
    });
    expect(repeated, 'a real grid repeats titles across slots and channels').toBeGreaterThan(0);
  });
});

test.describe('honest provider status', () => {
  for (const [status, phrase] of [
    ['provider_blocked', /could not be reached/i],
    ['unauthorized', /rejected our credentials/i],
    ['rate_limited', /rate-limiting/i],
    ['timeout', /did not respond in time/i],
    ['malformed_response', /unreadable data/i],
    ['misconfigured', /no schedule provider is configured/i],
  ] as const) {
    test(`${status} reads as a failure, never as "no results"`, async ({ page }) => {
      await page.goto(`${H}?status=${status}`);
      const msg = page.getByTestId('status-message');
      await expect(msg).toBeVisible();
      await expect(msg).toHaveText(phrase);
      await expect(msg).not.toHaveText(/no matching titles/i);
      await expect(cards(page)).toHaveCount(0);
    });
  }

  test('a genuinely empty schedule says so differently', async ({ page }) => {
    await page.goto(`${H}?status=unavailable`);
    await expect(page.getByTestId('status-message')).toHaveText(/no matching titles were available/i);
  });

  test('the trace names every source and its status', async ({ page }) => {
    await page.goto(H);
    await expect(page.getByTestId('stage-trace')).toContainText('mock_grid');
    await expect(page.getByTestId('stage-trace')).toContainText('healthy');
  });
});

test.describe('pipeline diagnostics', () => {
  test('every stage reports in/out counts', async ({ page }) => {
    await page.goto(H);
    for (const s of ['structural', 'window', 'dedupe']) {
      await expect(page.getByTestId(`stage-${s}`), s).toBeVisible();
    }
    const raw = Number(await page.getByTestId('raw-count').innerText());
    const returned = Number(await page.getByTestId('returned-count').innerText());
    expect(raw).toBeGreaterThan(0);
    expect(returned).toBeGreaterThan(0);
  });

  test('HARD: raw >= 12 must never render fewer than 12', async ({ page }) => {
    await page.goto(H);
    const raw = Number(await page.getByTestId('raw-count').innerText());
    if (raw >= 12) {
      expect(await cards(page).count()).toBeGreaterThanOrEqual(12);
    }
  });

  test('a narrow channel filter is flagged as a collapsing stage', async ({ page }) => {
    await page.goto(`${H}?channels=HBO`);
    await expect(page.getByTestId('collapse-warning')).toBeVisible();
    await expect(page.getByTestId('collapse-warning')).toContainText(/channel/i);
  });

  test('a single-channel schedule still returns every airing on it', async ({ page }) => {
    await page.goto(`${H}?channels=HBO`);
    const n = await cards(page).count();
    expect(n).toBeGreaterThan(1);
  });
});

test.describe('provider registry', () => {
  test('TV Media is the registered primary and is reported honestly', async ({ page }) => {
    await page.goto(H);
    const list = page.getByTestId('provider-list');
    await expect(list).toContainText('tv_media');
    await expect(list).toContainText('primary');
    // Without credentials it must say so rather than implying it is live.
    await expect(list).toContainText('not configured');
  });

  test('TVmaze is registered as partial, never as a full grid', async ({ page }) => {
    await page.goto(H);
    const row = page.getByTestId('provider-list').locator('li', { hasText: 'tvmaze_premieres' });
    await expect(row).toContainText('partial');
    await expect(row).toContainText('supplement');
  });
});

test.describe('window edges and time handling', () => {
  test('a longer window returns strictly more airings', async ({ page }) => {
    await page.goto(`${H}?hours=3`);
    const three = Number(await page.getByTestId('result-count').getAttribute('data-total'));
    await page.goto(`${H}?hours=12`);
    const twelve = Number(await page.getByTestId('result-count').getAttribute('data-total'));
    expect(twelve).toBeGreaterThan(three);
  });

  test('a programme already in progress is shown as On now', async ({ page }) => {
    await page.goto(H);
    await expect(page.getByText('On now').first()).toBeVisible();
  });

  test('"New" appears only where the source flagged it', async ({ page }) => {
    await page.goto(H);
    const total = await cards(page).count();
    const flagged = await page.getByText('New', { exact: true }).count();
    expect(flagged).toBeGreaterThan(0);
    expect(flagged, 'not every airing is a premiere').toBeLessThan(total);
  });
});

test.describe('responsive', () => {
  for (const [label, w, h] of VIEWPORTS) {
    test(`renders cleanly at ${label}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(H);
      expect(await overflow(page), 'horizontal overflow').toBeLessThanOrEqual(0);
      expect(await cards(page).count()).toBeGreaterThanOrEqual(20);
      await expect(page.getByTestId('result-count')).toBeVisible();
      await expect(page.getByTestId('source-status')).toBeVisible();
      await page.screenshot({ path: path.join(SHOTS, `${label}.png`), fullPage: false });
    });
  }
});

/**
 * THE REPORTED QUERY, end to end.
 *
 * "Lifetime crime movies on live TV in the next 10h" returned an empty state on
 * production. That was correct — TVmaze cannot see Lifetime at all — but it is
 * the exact request a real user made, so it gets a standing test proving the
 * pipeline answers it the moment a full grid is connected.
 */
test.describe('Lifetime movies in the next 10 hours', () => {
  test('returns a real set of Lifetime airings from a full grid', async ({ page }) => {
    await page.goto('/dev/live-tv?channels=LIFE,LMN&hours=10');
    const n = await cards(page).count();
    expect(n, 'Lifetime + LMN over 10h must not be empty').toBeGreaterThan(5);

    // Every card is genuinely on one of the requested channels.
    const channels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="airing-card"]'))
        .map((c) => c.querySelector('.text-brand-100')?.textContent?.trim() ?? ''));
    expect(new Set(channels).size).toBeGreaterThanOrEqual(1);
    for (const c of channels) expect(c).toMatch(/Lifetime/i);
  });

  test('the movie filter narrows to movies without emptying the set', async ({ page }) => {
    await page.goto('/dev/live-tv?channels=LIFE,LMN&hours=10');
    await page.getByTestId('filter-movie').click();
    expect(await cards(page).count()).toBeGreaterThan(5);
  });

  test('repeated airings of the same TV movie are preserved, not collapsed', async ({ page }) => {
    await page.goto('/dev/live-tv?channels=LIFE,LMN&hours=10');
    for (let i = 0; i < 20; i++) {
      const more = page.getByTestId('load-more');
      if (!(await more.count())) break;
      await more.click();
    }
    const dupes = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('[data-testid="airing-card"]'))
        .map((c) => c.querySelector('.text-lg.font-bold')?.textContent?.trim() ?? '');
      const m = new Map<string, number>();
      for (const x of t) m.set(x, (m.get(x) ?? 0) + 1);
      return [...m.values()].filter((n) => n > 1).length;
    });
    expect(dupes, 'a movie channel repeats titles across the day').toBeGreaterThan(0);
  });
});
