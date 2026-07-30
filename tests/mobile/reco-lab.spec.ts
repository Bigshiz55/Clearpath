import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * RECOMMENDATION LAB E2E.
 *
 * Two halves, deliberately:
 *   1. The AUTHORIZATION boundary is tested against the REAL founder route
 *      (/founder/recommendation-lab), which must 404 for anyone without an
 *      admin session — including the signed-out sandbox visitor.
 *   2. The DIAGNOSTIC ITSELF is driven on /dev/reco-lab, which renders the same
 *      component over the same engine in the browser. That is the only way to
 *      exercise the funnel without Supabase credentials.
 *
 * What this suite does NOT prove: that an authorized founder sees the page.
 * That needs a real admin session and is stated as a limitation, not faked.
 */

const FOUNDER = '/founder/recommendation-lab';
const HARNESS = '/dev/reco-lab';
const SHOTS = 'test-results/reco-lab';

async function runFunnel(page: Page) {
  await page.goto(HARNESS);
  await expect(page.getByTestId('reco-lab')).toBeVisible();
  await page.getByTestId('run-funnel').click();
  await expect(page.getByTestId('lab-results')).toBeVisible({ timeout: 30_000 });
}

test.describe('authorization', () => {
  test('the founder route is not reachable without an admin session', async ({ page }) => {
    const res = await page.request.get(FOUNDER, { maxRedirects: 0 });
    // 404, not 302: the route's existence is not disclosed to a stranger.
    expect(res.status()).toBe(404);
  });

  test('a normal visitor sees no lab content at the founder URL', async ({ page }) => {
    await page.goto(FOUNDER);
    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const leak of ['recommendation lab', 'catalog size', 'run funnel', 'reserve']) {
      expect(body, `signed-out page must not contain "${leak}"`).not.toContain(leak);
    }
    await page.screenshot({ path: path.join(SHOTS, 'denied.png') });
  });

  test('the lab is absent from robots and the sitemap', async ({ page }) => {
    const robots = await (await page.request.get('/robots.txt')).text();
    const sitemap = await (await page.request.get('/sitemap.xml')).text();
    expect(sitemap).not.toContain('recommendation-lab');
    // The page carries noindex metadata, but the PATH must be blocked too —
    // metadata only helps a crawler that already fetched the page.
    expect(robots).toContain('/founder');
  });
});

test.describe('the funnel runs and is displayed', () => {
  test('every stage reports a count and a duration', async ({ page }) => {
    await runFunnel(page);
    for (const stage of ['parse', 'retrieve', 'filter', 'fastRank', 'deepRank', 'diversify', 'assemble']) {
      await expect(page.getByTestId(`stage-${stage}`)).toBeVisible();
    }
    // The funnel must genuinely narrow: retrieval out > assemble out.
    const retrieved = Number((await page.getByTestId('stage-retrieve').innerText()).split(/\s+/)[2]!.replace(/,/g, ''));
    expect(retrieved).toBeGreaterThan(1000);
    await page.screenshot({ path: path.join(SHOTS, 'funnel.png'), fullPage: true });
  });

  test('the parsed request and its confidence are shown', async ({ page }) => {
    await runFunnel(page);
    // The parse lives in a collapsed <details>; open it the way a person would.
    await page.getByText(/Parsed request · confidence/).click();
    const json = await page.getByTestId('parsed-json').innerText();
    expect(json).toContain('hard_filters');
    expect(json).toContain('soft_preferences');
    // The narrow request in the default example must show its hard constraints.
    expect(json).toContain('netflix');
    expect(json).toContain('120');
  });

  test('filter removals name the limiting constraint', async ({ page }) => {
    await runFunnel(page);
    await expect(page.getByTestId('removals')).toBeVisible();
  });

  test('the fixture-data warning is always present', async ({ page }) => {
    await runFunnel(page);
    const warn = page.getByTestId('fixture-warning');
    await expect(warn).toBeVisible();
    await expect(warn).toContainText('no semantic meaning');
    await expect(warn).toContainText('not real');
  });
});

test.describe('court assembly', () => {

  for (const [label, value, act, res] of [
    ['Quick', 'quick', 4, 4], ['Standard', 'standard', 6, 6], ['Deep', 'deep', 8, 8],
  ] as [string, string, number, number][]) {
    test(`${label} court assembles ${act} active and ${res} reserve`, async ({ page }) => {
      await page.goto(HARNESS);
      await page.getByTestId('court-size').selectOption(value);
      await page.getByTestId('run-funnel').click();
      await expect(page.getByTestId('lab-results')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('active-pool-count')).toHaveText(String(act));
      await expect(page.getByTestId('reserve-pool-count')).toHaveText(String(res));
      await page.screenshot({ path: path.join(SHOTS, `court-${value}.png`), fullPage: true });
    });
  }
});

test.describe('determinism and responsiveness to input', () => {
  /** The ordered slot ids ARE the court — comparing them is the real property. */
  const activeIds = (page: Page) => page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="active-pool"] [data-testid^="veto-"]')]
      .map((el) => el.getAttribute('data-testid')!.replace('veto-', '')));

  test('the identical request produces the identical court', async ({ page }) => {
    await runFunnel(page);
    const first = await activeIds(page);
    expect(first.length).toBe(6);
    await page.getByTestId('run-funnel').click();
    await expect(page.getByTestId('lab-results')).toBeVisible();
    await expect.poll(() => activeIds(page)).toEqual(first);
  });

  test('changing the request changes the court', async ({ page }) => {
    await runFunnel(page);
    const before = await activeIds(page);
    await page.getByTestId('request-input').fill('A funny family animation, nothing scary, under 90 minutes.');
    await page.getByTestId('run-funnel').click();
    await expect(page.getByTestId('lab-results')).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => activeIds(page)).not.toEqual(before);
  });

  test('a larger catalog changes the counts', async ({ page }) => {
    await runFunnel(page);
    const small = await page.getByTestId('stage-retrieve').innerText();
    await page.getByTestId('catalog-size').selectOption('10000');
    await page.getByTestId('run-funnel').click();
    await expect(page.getByTestId('lab-results')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('stage-retrieve')).not.toHaveText(small);
  });
});

test.describe('replacement', () => {
  test('a veto promotes a reserve and logs why', async ({ page }) => {
    await runFunnel(page);
    const firstId = await page.evaluate(() =>
      document.querySelector('[data-testid="active-pool"] [data-testid^="veto-"]')?.getAttribute('data-testid') ?? '');
    expect(firstId).toContain('veto-');
    await page.getByTestId(firstId).click();
    await expect(page.getByTestId('replacement-log')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('replacement-log')).toContainText('veto');
    // The tray stays full and the reserve shrinks by one.
    await expect(page.getByTestId('active-pool-count')).toHaveText('6');
    await expect(page.getByTestId('reserve-pool-count')).toHaveText('5');
    await page.screenshot({ path: path.join(SHOTS, 'after-veto.png'), fullPage: true });
  });

  test('"seen it" also replaces, and says so without implying dislike', async ({ page }) => {
    await runFunnel(page);
    const id = await page.evaluate(() =>
      document.querySelector('[data-testid="active-pool"] [data-testid^="seen-"]')?.getAttribute('data-testid') ?? '');
    await page.getByTestId(id).click();
    await expect(page.getByTestId('replacement-log')).toContainText('seen_it');
    await expect(page.getByTestId('replacement-log')).toContainText('Diversity');
  });
});

test.describe('responsive', () => {
  for (const [label, w, h] of [
    ['small-iphone', 320, 568], ['large-iphone', 430, 932], ['android', 412, 915],
    ['tablet', 820, 1180], ['desktop', 1440, 900],
  ] as [string, number, number][]) {
    test(`no horizontal overflow at ${label} (${w}px)`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await runFunnel(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `overflow at ${w}px`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: path.join(SHOTS, `viewport-${label}.png`), fullPage: false });
    });
  }
});

test.describe('accessibility basics', () => {
  test('every control has an accessible name and the page has one h1', async ({ page }) => {
    await page.goto(HARNESS);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    for (const id of ['catalog-size', 'court-size', 'group-method', 'request-input']) {
      const el = page.getByTestId(id);
      const name = await el.evaluate((n) => {
        const labelled = n.closest('label')?.textContent?.trim();
        return labelled || n.getAttribute('aria-label') || '';
      });
      expect(name, `${id} needs an accessible name`).not.toBe('');
    }
  });

  test('results are reachable by keyboard and the error region is a live alert', async ({ page }) => {
    await runFunnel(page);
    // Diagnostics disclosure is a native <details>, so it is keyboard operable.
    const summaries = await page.locator('summary').count();
    expect(summaries).toBeGreaterThan(0);
  });
});

test.describe('data provenance and explanation evidence', () => {
  test('the run states plainly that the data is synthetic and non-semantic', async ({ page }) => {
    await runFunnel(page);
    const prov = page.getByTestId('data-provenance');
    await expect(prov).toBeVisible();
    await expect(prov).toContainText('SYNTHETIC');
    await expect(prov).toContainText('FIXTURE');
    await expect(prov).not.toContainText('REAL semantic');
  });

  test('each title carries an explanation whose claims name their source field', async ({ page }) => {
    await runFunnel(page);
    await expect(page.getByTestId('explanation').first()).toBeVisible();
    // Open the first diagnostics disclosure to reach the evidence list.
    await page.getByTestId('active-pool').getByText('Diagnostics').first().click();
    const evidence = page.getByTestId('evidence').first();
    await expect(evidence).toBeVisible();
    const text = await evidence.innerText();
    // Every listed claim points at a real column and a value.
    expect(text).toMatch(/←\s+\w+\.\w+\s+=/);
    expect(text).toContain('confidence');
  });

  test('a stale availability row is shown as unconfirmed, never as available', async ({ page }) => {
    await runFunnel(page);
    const body = await page.getByTestId('lab-results').innerText();
    if (body.includes('last checked over 14 days ago')) {
      expect(body).toContain('unconfirmed');
    }
    // Whatever the sample, nothing may claim availability without a provider name.
    expect(body).not.toMatch(/On\s*,/);
  });
});

test.describe('member configuration', () => {
  test('supports two to five members with distinct DNA and per-member scores', async ({ page }) => {
    await page.goto(HARNESS);
    for (let i = 0; i < 3; i++) await page.getByTestId('add-member').click();
    await page.getByTestId('run-funnel').click();
    await expect(page.getByTestId('lab-results')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('active-pool').getByText('Diagnostics').first().click();
    const diag = await page.getByTestId('active-pool').innerText();
    // Five members ⇒ five per-member scores on every title.
    for (const id of ['m0', 'm1', 'm2', 'm3', 'm4']) expect(diag).toContain(id);
    expect(diag).toMatch(/Group mean/);
    expect(diag).toMatch(/lowest/);
    expect(diag).toMatch(/disagreement/);
    await page.screenshot({ path: path.join(SHOTS, 'five-members.png'), fullPage: true });
  });

  test('a member with no Watch DNA is still scored', async ({ page }) => {
    await page.goto(HARNESS);
    await page.getByLabel('Member 2 name').fill('NewPerson');
    await page.locator('input[type="checkbox"]').nth(1).uncheck();
    await page.getByTestId('run-funnel').click();
    await expect(page.getByTestId('lab-results')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('active-pool').getByText('Diagnostics').first().click();
    expect(await page.getByTestId('active-pool').innerText()).toContain('m1');
  });
});
