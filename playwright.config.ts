import { defineConfig } from '@playwright/test';

/**
 * Responsive layout tests. Drives the /dev/responsive harness (RESPONSIVE_HARNESS=1)
 * across every required phone/tablet/desktop width and asserts no horizontal
 * scroll, no clipped ratings, IMDb visible, tappable actions, centered form, and
 * content clear of the fixed bottom nav. Screenshots are written to
 * test-results/responsive/ for visual review.
 */
export default defineConfig({
  testDir: './tests/responsive',
  outputDir: './test-results/responsive-artifacts',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3210',
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  },
  webServer: {
    command: 'RESPONSIVE_HARNESS=1 PORT=3210 npm start',
    url: 'http://127.0.0.1:3210/dev/responsive',
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
