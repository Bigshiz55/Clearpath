import { defineConfig, devices } from '@playwright/test';

/**
 * REAL-PREVIEW JOURNEY SUITE. No webServer: the target is the exact-SHA
 * Vercel Preview named by BASE_URL, driven by CI once the deployment is
 * READY. Local runs skip cleanly when BASE_URL is unset.
 */
export default defineConfig({
  testDir: './tests/preview',
  timeout: 120_000,
  retries: 1,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
  },
});
