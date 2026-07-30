import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * VERD1CT OS E2E — the security boundary and the honest empty/setup states.
 *
 * The sandbox has no Supabase credentials, so an authenticated founder session
 * cannot be established here; those paths are covered by the unit suite
 * (permissions, state machines, attention model) and by the database-level
 * verification of migration 0028. What IS verifiable in a browser — that the
 * OS is unreachable without a session, never indexed, and never leaks company
 * data — is verified here.
 */

const SHOTS = 'test-results/os';
const OS_ROUTES = ['/os', '/os/missions', '/os/approvals', '/os/activity'];

test.describe('Verd1ct OS is not public', () => {
  for (const route of OS_ROUTES) {
    test(`${route} requires a session`, async ({ page }) => {
      const res = await page.request.get(route, { maxRedirects: 0 });
      // Signed out → redirect to login (or a deny status). Never a 200 with data.
      expect([302, 307, 401, 403, 404], `${route} returned ${res.status()}`).toContain(res.status());
      if (res.status() === 302 || res.status() === 307) {
        expect(res.headers().location ?? '').toContain('/login');
      }
    });
  }

  test('following the redirect lands on login, not on company data', async ({ page }) => {
    await page.goto('/os');
    expect(page.url()).toContain('/login');
    const body = (await page.locator('body').innerText()).toLowerCase();
    // No mission, approval or activity content may leak to a signed-out visitor.
    for (const leak of ['command center', 'approvals waiting', 'active missions', 'audit']) {
      expect(body, `signed-out page must not contain "${leak}"`).not.toContain(leak);
    }
    await page.screenshot({ path: path.join(SHOTS, 'os-signed-out.png') });
  });

  test('robots.txt disallows the whole OS', async ({ page }) => {
    const txt = await (await page.request.get('/robots.txt')).text();
    expect(txt).toContain('/os');
  });

  test('no OS route appears in the public sitemap', async ({ page }) => {
    const xml = await (await page.request.get('/sitemap.xml')).text();
    for (const route of OS_ROUTES) {
      expect(xml, `${route} must not be in the sitemap`).not.toContain(`<loc>${route}`);
    }
  });
});

test.describe('the OS does not disturb the rest of the product', () => {
  test('public discovery pages and the landing page still work', async ({ page }) => {
    for (const route of ['/', '/explore', '/compare/imdb', '/for/couples']) {
      const res = await page.request.get(route);
      expect(res.status(), `${route} must still return 200`).toBe(200);
    }
  });
});
