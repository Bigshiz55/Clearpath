import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

/**
 * Real-browser verification of VERD1CT RUSH — see
 * tests/verdictrush. Boots the built app locally and drives the actual
 * component; nothing here talks to a preview deployment.
 *
 * Two projects, because "works on desktop" says nothing about the device this
 * is really for: the same suite runs on a phone viewport with touch enabled.
 */
const PINNED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
/**
 * Grant the microphone and provide a fake capture device. Without these,
 * `getUserMedia` rejects in headless Chromium and every run reports a denied
 * microphone — which would make the honest "Mic off" state the only state the
 * suite could ever see, and hide whether the listening path works at all.
 * This grants permission; it does not fake anything the app does.
 */
const MEDIA_ARGS = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-capture'];
const launchOptions = {
  ...(existsSync(PINNED_CHROMIUM) ? { executablePath: PINNED_CHROMIUM } : {}),
  args: MEDIA_ARGS,
};

export default defineConfig({
  testDir: './tests/verdictrush',
  outputDir: './test-results/verdictrush',
  workers: 1,
  // Longer than the product's own 80-second budget, or the harness stops the
  // run before the run stops itself — which reads as a failure of the feature
  // when it is a failure of the stopwatch.
  timeout: 240_000,
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:3216',
    launchOptions,
    // Grant the microphone through Playwright's supported API. Browser flags
    // alone did not reach the context, so every run reported a denied mic and
    // the honest "Mic off" state was the only one the suite could observe.
    permissions: ['microphone'],
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions, permissions: ['microphone'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions, permissions: ['microphone'] } },
  ],
  webServer: {
    command:
      'MOBILE_HARNESS=1 PORT=3216 ' +
      'NEXT_PUBLIC_SUPABASE_URL=https://harness.invalid ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=harness-anon-key npm start',
    url: 'http://127.0.0.1:3216/dev/verdict-rush',
    timeout: 180_000,
    reuseExistingServer: false,
  },
});
