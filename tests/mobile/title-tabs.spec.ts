import { test, expect, type Page } from '@playwright/test';

/**
 * "All 10 screenshots of this information is available, and you can just scroll
 * and scroll and scroll. This needs to be cleaner, consolidated."
 *
 * The title page was eighteen stacked cards. It is now a decision block —
 * placard, call, ratings, FOR/AGAINST/SAVE, can-I-watch-it-tonight — and four
 * tabs for everything else.
 *
 * The rule this suite exists to enforce: CONSOLIDATION MUST NOT BE DELETION.
 * Every section that used to be on the page is still on the page, one tap away,
 * and the tab that holds it is the one that answers the question it belongs to.
 */
const TABS = ['verdict', 'details', 'watch', 'similar'] as const;

async function open(page: Page, w = 390, h = 844) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/dev/report-tabs', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('report-tabs')).toBeVisible();
}

async function show(page: Page, tab: (typeof TABS)[number]) {
  await page.getByTestId(`report-tab-${tab}`).click();
  await expect(page.getByTestId(`report-panel-${tab}`)).toBeVisible();
}

test('the decision comes first, before any tab', async ({ page }) => {
  await open(page);
  const bar = (await page.getByTestId('report-tabs').boundingBox())!;
  // Above the bar: the call, the real ratings, and the three verdict controls.
  for (const id of ['card-verdict-for', 'card-verdict-against']) {
    const b = (await page.getByTestId(id).first().boundingBox())!;
    expect(b.y, `${id} is below the tab bar`).toBeLessThan(bar.y);
  }
  await expect(page.getByText('WATCH IT').first()).toBeVisible();
});

test('the tab bar is reachable without a long hunt', async ({ page }) => {
  await open(page);
  const bar = (await page.getByTestId('report-tabs').boundingBox())!;
  // Under two screens. It used to be eighteen sections with no bar at all.
  expect(bar.y, `tab bar sits ${Math.round(bar.y)}px down`).toBeLessThan(844 * 2);
});

test('all four tabs are there, and they fit one phone row', async ({ page }) => {
  await open(page, 320, 800);
  const bar = (await page.getByTestId('report-tabs').boundingBox())!;
  const tops: number[] = [];
  for (const t of TABS) {
    const b = (await page.getByTestId(`report-tab-${t}`).boundingBox())!;
    tops.push(Math.round(b.y));
    expect(b.height, `${t} tab is below the touch floor`).toBeGreaterThanOrEqual(44);
    expect(b.x + b.width, `${t} tab escapes the bar`).toBeLessThanOrEqual(bar.x + bar.width + 1);
  }
  expect(new Set(tops).size, `tabs wrapped onto ${new Set(tops).size} lines`).toBe(1);
});

test('it opens on the verdict — the question people arrive with', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('report-tab-verdict')).toHaveAttribute('data-active', 'true');
  await expect(page.getByTestId('report-panel-verdict')).toBeVisible();
});

/**
 * CONSOLIDATION IS NOT DELETION. One section per tab, named, so a future tidy
 * cannot quietly drop one.
 */
const MUST_REACH: [(typeof TABS)[number], string | RegExp][] = [
  ['verdict', 'Why it may work'],
  ['verdict', 'Why it may not'],
  ['verdict', 'How this score was built'],
  ['verdict', 'Recommendation consensus'],
  ['verdict', /Final verdict/i],
  ['details', 'Ratings'],
  ['details', 'Content & tone'],
  ['watch', 'Where to watch'],
  ['watch', /Theater Mode/i],
  ['similar', 'More like this'],
];

for (const [tab, text] of MUST_REACH) {
  test(`"${text}" survived the consolidation — under ${tab}`, async ({ page }) => {
    await open(page);
    await show(page, tab);
    await expect(page.getByText(text).first()).toBeVisible();
  });
}

test('the evidence panels are still on the default tab, not buried', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('score-factors')).toBeVisible();
  await expect(page.getByTestId('match-adjustments')).toBeVisible();
});

test('content & tone stops printing six identical grey tiles', async ({ page }) => {
  await open(page);
  await show(page, 'details');
  const tone = page.getByTestId('content-tone');
  await expect(tone).toBeVisible();

  // The five determined signals keep their tiles; the five we could not
  // determine collapse to one named line. Nothing is hidden, nothing invented.
  const tiles = tone.locator('div.rounded-lg');
  expect(await tiles.count(), 'unknown signals are still drawn as tiles').toBe(5);
  const note = page.getByTestId('content-unknown');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Gore');
  await expect(note).toContainText(/rather than guess/);
});

test('switching tabs never scrolls the page sideways', async ({ page }) => {
  for (const w of [320, 390, 430, 1024] as const) {
    await open(page, w, 900);
    for (const t of TABS) {
      await show(page, t);
      const over = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(over, `overflow on ${t} at ${w}px`).toBeLessThanOrEqual(1);
    }
  }
});

test('the bar sticks, so you can change tabs without scrolling back up', async ({ page }) => {
  await open(page);
  await page.evaluate(() => window.scrollTo(0, 2500));
  const bar = (await page.getByTestId('report-tabs').boundingBox())!;
  expect(bar.y, 'the bar scrolled away').toBeLessThan(120);
  await expect(page.getByTestId('report-tab-watch')).toBeVisible();
});
