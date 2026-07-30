import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';

/**
 * FOUNDER ACCESS E2E — the temporary code flow, end to end, against a real
 * server with FOUNDER_ACCESS_CODE set.
 *
 * SERIAL and ordered on purpose. Failed attempts are tracked per client, and
 * the lockout lasts 15 minutes, so the lockout case runs LAST — otherwise it
 * would lock out every test after it and the failures would look like bugs.
 */

const CODE = 'harness-only-founder-code-not-a-secret-0123456789';
const ACCESS = '/founder/access';
const LAB = '/founder/recommendation-lab';
const SHOTS = 'test-results/founder-access';

/**
 * Navigate to a route and report the HTTP status.
 *
 * Deliberately a NAVIGATION rather than `page.request.get`. Playwright's
 * APIRequestContext does not carry a SameSite=Strict cookie, so asserting 404
 * through it would pass whether or not the gate actually works — a test that
 * cannot fail. A navigation sends the session exactly as a browser does.
 */
async function statusOf(page: Page, route: string): Promise<number> {
  const res = await page.goto(route, { waitUntil: 'commit' });
  return res!.status();
}

test.describe.configure({ mode: 'serial' });

test.describe('before access', () => {
  test('the lab 404s for an anonymous visitor', async ({ page }) => {
    expect(await statusOf(page, LAB)).toBe(404);
  });

  test('the founder API reveals nothing to an anonymous caller', async ({ page }) => {
    const res = await page.request.get('/api/founder/self-check');
    const body = await res.json();
    expect(body.authorized).toBe(false);
    // No secret, no allowlist, no code, no hint of the value.
    const text = JSON.stringify(body);
    expect(text).not.toContain(CODE);
    expect(text).not.toMatch(/@/); // no email addresses
  });

  test('the access page renders a password field, not a link to the code', async ({ page }) => {
    await page.goto(ACCESS);
    await expect(page.getByTestId('founder-access')).toBeVisible();
    const input = page.getByTestId('access-code');
    await expect(input).toHaveAttribute('type', 'password');
    await expect(input).toHaveAttribute('autocomplete', 'off');
    // The code must not be present anywhere in what the browser received.
    expect(await page.content()).not.toContain(CODE);
    await page.screenshot({ path: path.join(SHOTS, 'access-desktop.png') });
  });

  test('robots blocks /founder and the sitemap omits it', async ({ page }) => {
    const robots = await (await page.request.get('/robots.txt')).text();
    const sitemap = await (await page.request.get('/sitemap.xml')).text();
    expect(robots).toContain('/founder');
    expect(sitemap).not.toContain('/founder');
  });
});

test.describe('wrong code', () => {
  test('is rejected without creating a session', async ({ page }) => {
    await page.goto(ACCESS);
    await page.getByTestId('access-code').fill('definitely-not-the-right-code-at-all');
    await page.getByTestId('access-submit').click();
    await expect(page.getByTestId('access-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('access-error')).toContainText(/not recognised/i);

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'wv_founder')).toBeUndefined();
    await page.screenshot({ path: path.join(SHOTS, 'wrong-code.png') });
    // And the lab is still closed.
    expect(await statusOf(page, LAB)).toBe(404);
  });
});

/**
 * ONE shared context for this block. Playwright gives each test a fresh
 * context by default, which would discard the cookie between tests — and
 * "the session survives a refresh" is precisely the property under test, so it
 * has to be exercised across navigations in a single browser session.
 */
test.describe('correct code', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });
  test.afterAll(async () => { await context.close(); });

  test('creates a hardened session and lands on the lab', async () => {
    await page.goto(ACCESS);
    await page.getByTestId('access-code').fill(CODE);
    await page.getByTestId('access-submit').click();

    await page.waitForURL(`**${LAB}`, { timeout: 30_000 });
    await expect(page.getByTestId('reco-lab')).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name === 'wv_founder');
    expect(cookie, 'session cookie must exist').toBeDefined();
    expect(cookie!.httpOnly, 'HttpOnly').toBe(true);
    expect(cookie!.sameSite, 'SameSite=Strict').toBe('Strict');
    expect(cookie!.path).toBe('/');
    const ttl = cookie!.expires - Date.now() / 1000;
    expect(ttl).toBeGreaterThan(3.9 * 3600);
    expect(ttl).toBeLessThanOrEqual(4 * 3600 + 60);
    // The cookie carries a signed assertion, never the code itself.
    expect(cookie!.value).not.toContain(CODE);
    await page.screenshot({ path: path.join(SHOTS, 'lab-desktop.png'), fullPage: false });
  });

  test('the session survives a refresh and the funnel runs', async () => {
    await page.goto(LAB);
    await expect(page.getByTestId('reco-lab')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('reco-lab')).toBeVisible();

    await page.getByTestId('run-funnel').click();
    await expect(page.getByTestId('lab-results')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('active-pool-count')).toHaveText('6');
    await expect(page.getByTestId('data-provenance')).toContainText('SYNTHETIC');
    await page.screenshot({ path: path.join(SHOTS, 'lab-funnel.png'), fullPage: true });
  });

  /**
   * Fetched FROM THE PAGE, not via `page.request`. Playwright's
   * APIRequestContext does not attach a SameSite=Strict cookie to its requests,
   * so `page.request` reports `authorized: false` even while the browser itself
   * is authorised. The in-page fetch is both the realistic path and the correct
   * one to assert — and the discrepancy is incidental proof that SameSite=Strict
   * is actually in force.
   */
  test('self-check confirms the code session without echoing the code', async () => {
    await page.goto(LAB);
    const body = await page.evaluate(async () => {
      const r = await fetch('/api/founder/self-check');
      return r.json();
    });
    expect(body.authorized).toBe(true);
    expect(body.via).toBe('founder_access_code');
    expect(JSON.stringify(body)).not.toContain(CODE);
  });

  test('a tampered cookie is rejected and the lab closes again', async () => {
    const cookie = (await context.cookies()).find((c) => c.name === 'wv_founder')!;
    // Sanity: with the cookie untouched the lab is open, so a 404 below is
    // caused by the tampering and not by some unrelated failure to send it.
    expect(await statusOf(page, LAB)).toBe(200);

    // Flip the tail of the signature.
    await context.clearCookies();
    await context.addCookies([{ ...cookie, value: `${cookie.value.slice(0, -3)}AAA` }]);
    expect(await statusOf(page, LAB)).toBe(404);

    // A wholesale forgery — valid shape, invalid signature — is refused too.
    await context.clearCookies();
    await context.addCookies([{ ...cookie, value: 'v1.eyJpYXQiOjEsImV4cCI6OTk5OTk5OTk5OSwianRpIjoieCJ9.AAAA' }]);
    expect(await statusOf(page, LAB)).toBe(404);
    await context.clearCookies();
  });

  test('logout ends access immediately', async () => {
    await page.goto(ACCESS);
    await page.getByTestId('access-code').fill(CODE);
    await page.getByTestId('access-submit').click();
    await page.waitForURL(`**${LAB}`, { timeout: 30_000 });
    await expect(page.getByTestId('reco-lab')).toBeVisible();

    await page.getByTestId('founder-logout').click();
    await page.waitForURL(`**${ACCESS}`, { timeout: 30_000 });

    const cookie = (await context.cookies()).find((c) => c.name === 'wv_founder');
    expect(cookie === undefined || cookie.value === '').toBe(true);
    expect(await statusOf(page, LAB)).toBe(404);
  });
});

test.describe('the public app is unaffected', () => {
  test('ordinary routes still work and no sign-in was enabled', async ({ page }) => {
    for (const route of ['/', '/explore', '/app/together']) {
      expect((await page.request.get(route)).status(), route).toBe(200);
    }
  });
});

test.describe('responsive access page', () => {
  for (const [label, w, h] of [
    ['small-iphone', 320, 568], ['large-iphone', 430, 932], ['tablet', 820, 1180], ['desktop', 1440, 900],
  ] as [string, number, number][]) {
    test(`usable at ${label} (${w}px)`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(ACCESS);
      await expect(page.getByTestId('access-code')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const box = await page.getByTestId('access-submit').boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: path.join(SHOTS, `access-${label}.png`) });
    });
  }
});

/**
 * LAST. This deliberately burns the attempt budget for this client, and the
 * lockout lasts 15 minutes — anything after it would fail for the wrong reason.
 */
test.describe('lockout', () => {
  test('repeated wrong codes trigger a temporary lockout', async ({ page }) => {
    await page.goto(ACCESS);
    let sawLockout = false;
    for (let i = 0; i < 6; i++) {
      await page.getByTestId('access-code').fill(`wrong-attempt-number-${i}-padding-padding`);
      await page.getByTestId('access-submit').click();
      await expect(page.getByTestId('access-error')).toBeVisible({ timeout: 15_000 });
      const text = await page.getByTestId('access-error').innerText();
      if (/too many attempts/i.test(text)) { sawLockout = true; break; }
    }
    expect(sawLockout, 'a lockout must engage within 6 wrong attempts').toBe(true);

    // Even the CORRECT code is refused while locked out.
    await page.getByTestId('access-code').fill(CODE);
    await page.getByTestId('access-submit').click();
    await expect(page.getByTestId('access-error')).toContainText(/too many attempts/i);
    await page.screenshot({ path: path.join(SHOTS, 'lockout.png') });
    expect(await statusOf(page, LAB)).toBe(404);
  });
});
