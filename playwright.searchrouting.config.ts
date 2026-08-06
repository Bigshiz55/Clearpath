import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

/** Routing verification for the search entry points — see tests/searchRouting. */
// The pinned path exists only in the remote dev container; CI installs its own
// Chromium via `npx playwright install`, so only pin when the binary is there.
const PINNED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export default defineConfig({
  testDir: './tests/searchRouting',
  outputDir: './test-results/search-routing',
  workers: 2,
  timeout: 45_000,
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:3211',
    ...(existsSync(PINNED_CHROMIUM) ? { launchOptions: { executablePath: PINNED_CHROMIUM } } : {}),
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
