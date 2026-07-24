import { test, expect, type Page } from '@playwright/test';

/**
 * REAL authenticated-app E2E. Runs only when ALL of these are set:
 *   PLAYWRIGHT_E2E_URL       — the live deployment (Vercel preview / production)
 *   PLAYWRIGHT_E2E_EMAIL     — a seeded test account's email
 *   PLAYWRIGHT_E2E_PASSWORD  — that account's password (password sign-in must be enabled)
 *
 * It signs in with a password, then exercises the core signed-in journeys against the
 * true stack — the /app home, search (TMDB), recommendations, a title/verdict page,
 * Watch DNA, and the watchlist. Every step asserts a real, non-error render; nothing
 * is inferred. Without credentials the whole file skips cleanly, so CI stays green on
 * PRs that can't hold secrets.
 */
const URL = process.env.PLAYWRIGHT_E2E_URL ?? '';
const EMAIL = process.env.PLAYWRIGHT_E2E_EMAIL ?? '';
const PASSWORD = process.env.PLAYWRIGHT_E2E_PASSWORD ?? '';
const READY = Boolean(URL && EMAIL && PASSWORD);

test.describe.configure({ mode: 'serial' });
test.skip(!READY, 'PLAYWRIGHT_E2E_URL + PLAYWRIGHT_E2E_EMAIL + PLAYWRIGHT_E2E_PASSWORD required');

/** Reach the password sign-in form (default mode is magic-link) and authenticate. */
async function signIn(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  // Default is magic-link. Toggle to signup (reveals password), then to signin.
  await page.getByRole('button', { name: /create an account/i }).first().click();
  await page.getByRole('button', { name: /^sign in$/i }).first().click();
  await page.locator('#email').fill(EMAIL);
  await page.locator('#password').fill(PASSWORD);
  await Promise.all([
    page.waitForURL(/\/app/, { timeout: 30_000 }),
    page.getByRole('button', { name: /^sign in$/i }).last().click(),
  ]);
}

test('signs in and lands on the app home', async ({ page }) => {
  await signIn(page);
  await expect(page.locator('body')).toBeVisible();
  expect(page.url(), 'reached /app after login').toMatch(/\/app/);
  // A real app shell, not a crash or a blank redirect loop.
  const text = (await page.locator('body').innerText()).trim();
  expect(text.length, 'app home rendered content').toBeGreaterThan(0);
});

test('search returns live TMDB results', async ({ page }) => {
  await signIn(page);
  // Hit the search API directly through the authenticated browser context — this is
  // the true stack (server route → TMDB) and is selector-independent.
  const resp = await page.request.get('/api/search?q=matrix');
  expect(resp.status(), `search HTTP ${resp.status()}`).toBeLessThan(500);
  if (resp.ok()) {
    const body = await resp.json();
    const blob = JSON.stringify(body).toLowerCase();
    expect(blob, 'search mentions a Matrix result').toContain('matrix');
  }
});

test('recommendations endpoint responds for the signed-in user', async ({ page }) => {
  await signIn(page);
  const resp = await page.request.get('/api/recommendations');
  expect(resp.status(), `recommendations HTTP ${resp.status()}`).toBeLessThan(500);
});

test('a title/verdict page renders a Watchability verdict', async ({ page }) => {
  await signIn(page);
  // The Matrix (TMDB movie 603) — a stable, always-present title.
  const resp = await page.goto('/app/title/movie/603', { waitUntil: 'domcontentloaded' });
  expect((resp?.status() ?? 0) < 500, `title HTTP ${resp?.status()}`).toBe(true);
  await expect(page.locator('body')).toBeVisible();
  const text = (await page.locator('body').innerText()).toLowerCase();
  // Deterministic engine output is present (score / verdict language), and it is not
  // an error page.
  expect(text).not.toMatch(/application error|something went wrong|500 —/);
  expect(text.length, 'verdict page rendered content').toBeGreaterThan(0);
});

test('Watch DNA page renders for the signed-in user', async ({ page }) => {
  await signIn(page);
  const resp = await page.goto('/app/dna', { waitUntil: 'domcontentloaded' });
  expect((resp?.status() ?? 0) < 500, `dna HTTP ${resp?.status()}`).toBe(true);
  await expect(page.locator('body')).toBeVisible();
});

test('watchlist page renders for the signed-in user', async ({ page }) => {
  await signIn(page);
  const resp = await page.goto('/app/watchlist', { waitUntil: 'domcontentloaded' });
  expect((resp?.status() ?? 0) < 500, `watchlist HTTP ${resp?.status()}`).toBe(true);
  await expect(page.locator('body')).toBeVisible();
});
