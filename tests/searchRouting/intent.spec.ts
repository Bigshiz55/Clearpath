/**
 * Bare vocabulary words in the real SearchBar: "crime" and "Hulu" must offer a
 * distinct BROWSE card (never silently open a title that shares the word), and
 * the protect-list titles must keep their exact-title first-tap behavior.
 */
import { test, expect, type Page } from '@playwright/test';

async function arm(page: Page) {
  await page.route('**/api/search*', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    // Realistic hostile shape: the catalog really does contain titles that
    // share bare vocabulary words.
    const CATALOG: Record<string, unknown> = {
      crime: { results: [{ id: 900, mediaType: 'movie', title: 'Crime', year: 2021 }], people: [], intent: { kind: 'genre', label: 'Crime', genreId: 80 } },
      Hulu: { results: [{ id: 901, mediaType: 'movie', title: 'Hulu Story', year: 1999 }], people: [], intent: { kind: 'provider', label: 'Hulu', providerId: 15 } },
      You: { results: [{ id: 902, mediaType: 'tv', title: 'You', year: 2018 }], people: [], intent: null },
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CATALOG[q] ?? { results: [], people: [], intent: null }),
    });
  });
  await page.route('**://*.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
}

test.describe('bare vocabulary search intents', () => {
  test('"crime" offers Browse Crime and Enter goes to the Judge, not a title', async ({ page }) => {
    await arm(page);
    await page.goto('/dev/mobile-home');
    const input = page.getByPlaceholder(/Search by title/);
    await input.fill('crime');
    await expect(page.getByTestId('search-intent-card')).toBeVisible();
    await expect(page.getByTestId('search-intent-card')).toContainText('Browse Crime');
    await input.press('Enter');
    // Destination is the Judge (the harness redirects unauthenticated /app
    // routes to login, keeping the target in `next`).
    await page.waitForURL(/\/app\/ask\?q=crime|q=crime.*next=%2Fapp%2Fask|next=%2Fapp%2Fask.*q=crime/);
  });

  test('"Hulu" offers Best on Hulu', async ({ page }) => {
    await arm(page);
    await page.goto('/dev/mobile-home');
    const input = page.getByPlaceholder(/Search by title/);
    await input.fill('Hulu');
    await expect(page.getByTestId('search-intent-card')).toContainText('Best on Hulu');
  });

  test('"You" still routes to the exact title, no browse card', async ({ page }) => {
    await arm(page);
    await page.goto('/dev/mobile-home');
    const input = page.getByPlaceholder(/Search by title/);
    await input.fill('You');
    await expect(page.getByTestId('search-intent-card')).toHaveCount(0);
    await input.press('Enter');
    // The harness has no session, so the title route lands on the login
    // redirect — the DESTINATION is what is being verified.
    await page.waitForURL(/\/app\/title\/tv\/902|next=%2Fapp%2Ftitle%2Ftv%2F902/);
  });
});
