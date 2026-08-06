import { defineConfig } from '@playwright/test';

/**
 * LAYER C of the forensic search audit.
 *
 * Drives a LOCAL PRODUCTION BUILD of the deployed commit. Live production is
 * unreachable from this Chromium (net::ERR_CONNECTION_RESET), so every
 * /api/search response is replayed from the frozen live recording captured by
 * Layer A. Local browser verification of production data — not live browser
 * testing.
 */
export default defineConfig({
  testDir: './tests/searchAudit',
  outputDir: './test-results/search-audit',
  fullyParallel: false,
  workers: 2,
  timeout: 45_000,
  globalTimeout: 60 * 60_000,
  reporter: [['line']],
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:3211',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  },
  webServer: {
    command:
      'MOBILE_HARNESS=1 PORT=3211 ' +
      'NEXT_PUBLIC_SUPABASE_URL=https://harness.invalid ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=harness-anon-key ' +
      'npm start',
    url: 'http://127.0.0.1:3211/dev/mobile-home',
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
