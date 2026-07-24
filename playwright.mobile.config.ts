import { defineConfig } from '@playwright/test';

/**
 * Mobile-home Playwright suite. Drives the /dev/mobile-home harness
 * (MOBILE_HARNESS=1) — the exact Logo / BuildCaseBox / SearchBar / MobileNav
 * components that render the /app home — across the phone widths that matter, and
 * asserts the rebuilt screen: solid "WatchVERDICT" wordmark (regression for the
 * clipped "WatchVERD_CT"), compact hero, working chips + More ideas, a textarea,
 * a full-width "Hit the Gavel" CTA that never looks disabled, and no horizontal
 * overflow. Screenshots land in test-results/mobile/ for review.
 */
export default defineConfig({
  testDir: './tests/mobile',
  outputDir: './test-results/mobile-artifacts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalTimeout: 8 * 60_000,
  forbidOnly: true,
  reporter: [['list']],
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:3211',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  },
  webServer: {
    command: 'MOBILE_HARNESS=1 PORT=3211 npm start',
    url: 'http://127.0.0.1:3211/dev/mobile-home',
    timeout: 90_000,
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
