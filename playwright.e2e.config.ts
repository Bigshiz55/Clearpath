import { defineConfig } from '@playwright/test';

/**
 * REAL-deployment E2E. Runs against a live URL (a Vercel preview or production) when
 * PLAYWRIGHT_E2E_URL is set; otherwise the specs skip. This is how "every critical
 * user flow" gets exercised against the true stack in CI, without shipping a broken
 * webServer here. No local server is started.
 *   PLAYWRIGHT_E2E_URL=https://<preview>.vercel.app npm run test:e2e
 */
const BASE = process.env.PLAYWRIGHT_E2E_URL ?? '';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.e2e\.ts$/,
  outputDir: './test-results/e2e-artifacts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalTimeout: 10 * 60_000,
  reporter: [['list']],
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE || 'http://127.0.0.1:9',
    actionTimeout: 15_000,
    navigationTimeout: 25_000,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  },
  // No webServer: we hit a real deployment.
});
