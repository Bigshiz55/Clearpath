import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Real-browser verification of the 60-second calibration — see
 * tests/voicedna-rapid. Boots the built app locally and drives the actual
 * component; nothing here talks to a preview deployment.
 *
 * Two projects, because "works on desktop" says nothing about the device this
 * is really for: the same suite runs on a phone viewport with touch enabled.
 */
const PINNED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = existsSync(PINNED_CHROMIUM) ? { executablePath: PINNED_CHROMIUM } : {};

export default defineConfig({
  testDir: './tests/voicedna-rapid',
  outputDir: './test-results/voicedna-rapid',
  workers: 1,
  timeout: 60_000,
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:3214',
    launchOptions,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions } },
  ],
  webServer: {
    command:
      'MOBILE_HARNESS=1 PORT=3214 ' +
      'NEXT_PUBLIC_SUPABASE_URL=https://harness.invalid ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=harness-anon-key npm start',
    url: 'http://127.0.0.1:3214/dev/voice-dna-rapid',
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
