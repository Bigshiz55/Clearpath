import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Real-browser verification of Quick DNA — see
 * tests/quickdna. Boots the built app locally and drives the actual
 * component; nothing here talks to a preview deployment.
 *
 * Two projects, because "works on desktop" says nothing about the device this
 * is really for: the same suite runs on a phone viewport with touch enabled.
 */
const PINNED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = existsSync(PINNED_CHROMIUM) ? { executablePath: PINNED_CHROMIUM } : {};

export default defineConfig({
  testDir: './tests/quickdna',
  outputDir: './test-results/quickdna',
  workers: 1,
  // Longer than the product's own 80-second budget, or the harness stops the
  // run before the run stops itself — which reads as a failure of the feature
  // when it is a failure of the stopwatch.
  timeout: 150_000,
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:3215',
    launchOptions,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions } },
  ],
  webServer: {
    command:
      'MOBILE_HARNESS=1 PORT=3215 ' +
      'NEXT_PUBLIC_SUPABASE_URL=https://harness.invalid ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=harness-anon-key npm start',
    url: 'http://127.0.0.1:3215/dev/quick-dna',
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
