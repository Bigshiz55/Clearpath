import { defineConfig, devices } from '@playwright/test';

/**
 * OPT-IN trailer real-browser config — NOT part of the required CI gates, so it
 * can never block a deploy. Run it deliberately once trailers can resolve (a
 * TMDB key is present and the target URL renders a trailer-eligible grid with
 * ?trailers=1):
 *
 *   TRAILER_TEST_URL="https://<deploy>/app?trailers=1" npx playwright test -c playwright.trailer.config.ts
 *
 * With no reachable target the single spec skips itself rather than failing.
 */
export default defineConfig({
  testDir: './tests/trailer',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone', use: { ...devices['iPhone 12'] } }, // ~390×844
  ],
});
