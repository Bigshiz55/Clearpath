import { defineConfig } from '@playwright/test';
/** Routing verification for the search entry points — see tests/searchRouting. */
export default defineConfig({
  testDir: './tests/searchRouting',
  outputDir: './test-results/search-routing',
  workers: 2,
  timeout: 45_000,
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:3211',
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  },
  webServer: {
    command:
      'MOBILE_HARNESS=1 PORT=3211 ' +
      'NEXT_PUBLIC_SUPABASE_URL=https://harness.invalid ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=harness-anon-key npm start',
    url: 'http://127.0.0.1:3211/dev/mobile-home',
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
