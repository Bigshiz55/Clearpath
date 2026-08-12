import { defineConfig } from '@playwright/test';

/**
 * SHOWDOWN VISUAL QA — render the flagship game and look at it.
 *
 * Source inspection cannot tell you a poster is too small or that a results
 * screen overflows at 390px. This drives the real components at both widths,
 * walks a complete session, and writes screenshots plus hard assertions that
 * nothing scrolls sideways at any stage.
 *
 * Supabase values are dummies pointing at an unroutable host; the game itself
 * runs client-side from the diagnostic catalogue, so no real project is
 * contacted. They are not secrets and grant no access.
 */
export default defineConfig({
  testDir: './tests/qa',
  outputDir: './test-results/showdown-qa',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  forbidOnly: true,
  reporter: [['list']],
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://127.0.0.1:3212',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  },
  webServer: {
    command:
      'PORT=3212 ' +
      'NEXT_PUBLIC_SUPABASE_URL=https://harness.invalid ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=harness-anon-key ' +
      'npm start',
    url: 'http://127.0.0.1:3212/dev/dna-showdown',
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
