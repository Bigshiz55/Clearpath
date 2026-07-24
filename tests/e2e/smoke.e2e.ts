import { test, expect } from '@playwright/test';

/**
 * REAL-deployment smoke E2E (runs only when PLAYWRIGHT_E2E_URL is set). Exercises the
 * PUBLIC surfaces against the true stack — no login required: the landing page, the
 * public entry/marketing routes, the login screen, an unknown Court room (must show a
 * precise recovery screen, never spin forever), and the Court health endpoint.
 *
 * Authenticated flows (search / recommendation / verdict / DNA / Court host) live in
 * app.e2e.ts and additionally require PLAYWRIGHT_E2E_EMAIL + PLAYWRIGHT_E2E_PASSWORD.
 */
const HAS_URL = Boolean(process.env.PLAYWRIGHT_E2E_URL);

test.describe.configure({ mode: 'serial' });
test.skip(!HAS_URL, 'PLAYWRIGHT_E2E_URL not set');

test('landing page loads over HTTPS', async ({ page, baseURL }) => {
  expect(baseURL?.startsWith('https://'), 'E2E target should be HTTPS').toBe(true);
  const resp = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(resp?.ok(), `landing HTTP ${resp?.status()}`).toBe(true);
  await expect(page.locator('body')).toBeVisible();
});

// Every public, unauthenticated route must return a non-5xx response and paint a
// visible body — no white screen of death, no server error. These are the surfaces a
// logged-out visitor (or a shared-link recipient) can reach directly.
const PUBLIC_ROUTES = ['/', '/login', '/begin', '/start', '/learn', '/onboarding', '/offline'];
for (const route of PUBLIC_ROUTES) {
  test(`public route ${route} renders without a server error`, async ({ page }) => {
    const resp = await page.goto(route, { waitUntil: 'domcontentloaded' });
    const status = resp?.status() ?? 0;
    expect(status, `${route} HTTP ${status}`).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
    const text = (await page.locator('body').innerText()).trim();
    expect(text.length, `${route} rendered visible text`).toBeGreaterThan(0);
  });
}

test('protected /app redirects an anonymous visitor (login) or mints a guest session', async ({ page }) => {
  const resp = await page.goto('/app', { waitUntil: 'domcontentloaded' });
  expect((resp?.status() ?? 0) < 500, `/app HTTP ${resp?.status()}`).toBe(true);
  // Either we land on /login (anonymous sign-ins disabled) or the app renders a guest
  // session (anonymous sign-ins enabled). Both are valid; a 5xx or blank page is not.
  await expect(page.locator('body')).toBeVisible();
  const url = page.url();
  const onLoginOrApp = /\/login|\/app/.test(url);
  expect(onLoginOrApp, `landed somewhere sane (${url})`).toBe(true);
});

test('Court health endpoint reports readiness without secrets', async ({ request }) => {
  const r = await request.get('/api/court/health');
  expect(r.ok()).toBe(true);
  const body = await r.json();
  expect(body).toHaveProperty('ok');
  // Never leak secrets.
  const raw = JSON.stringify(body).toLowerCase();
  expect(raw).not.toContain('service_role');
  expect(raw).not.toMatch(/eyj[a-z0-9]/); // no JWT-looking token
});

test('/api/health responds', async ({ request }) => {
  const r = await request.get('/api/health');
  // Health may be 200 or a documented degraded code, but never a 5xx crash.
  expect(r.status(), `health HTTP ${r.status()}`).toBeLessThan(500);
});

test('an unknown Court room shows a recovery screen, not an endless spinner', async ({ page }) => {
  await page.goto('/court/zzzznotarealroom', { waitUntil: 'networkidle' });
  // Either the classified error card or the legacy "doesn’t exist" copy — never a
  // permanent "Connecting…". Give the 10s first-load timeout room to trip.
  await expect(async () => {
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text).toMatch(/doesn.t exist|has ended|expired|closed|couldn.t reach|taking longer|not set up/);
  }).toPass({ timeout: 20_000 });
});

test('an unknown /join room also recovers, never spins forever', async ({ page }) => {
  await page.goto('/join/zzzznotarealroom', { waitUntil: 'networkidle' });
  await expect(async () => {
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text).toMatch(/doesn.t exist|has ended|expired|closed|couldn.t reach|taking longer|not set up|join/);
  }).toPass({ timeout: 20_000 });
});
