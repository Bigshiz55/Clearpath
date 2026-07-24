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
  // Bounded, non-interactive: never hang. A stuck test fails at 60s; the whole run
  // is additionally wall-clock-capped by the `timeout` wrapper in scripts/verify.sh.
  timeout: 60_000,
  globalTimeout: 8 * 60_000,
  forbidOnly: true,
  reporter: [['list']],
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:3210',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  },
  webServer: {
    command: 'RESPONSIVE_HARNESS=1 PORT=3210 npm start',
    url: 'http://127.0.0.1:3210/dev/responsive',
    // Bounded readiness check; if the server isn't up in 90s the run aborts instead
    // of hanging. reuseExistingServer lets scripts/verify.sh own the server lifecycle
    // (start in background, bounded wait, always kill) so nothing is ever orphaned.
    timeout: 90_000,
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
