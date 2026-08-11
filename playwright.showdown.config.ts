import { defineConfig, devices } from '@playwright/test';

/**
 * DNA SHOWDOWN — browser suite.
 *
 * Drives `/dev/showdown`, which mounts the real component on a fixture pool so
 * a failure means the game is broken rather than that TMDB returned different
 * films today. Scoped to its own config and port so it runs in about a minute:
 * a check nobody runs is not a check.
 *
 * The viewports are the shapes that actually break things — a 320px phone where
 * the answer row collides, a desktop where a mobile-first layout strands
 * content, and a 640x400 standing in for 200% zoom, which is where the previous
 * build pushed its controls below the fold.
 */
export default defineConfig({
  testDir: './tests/showdown',
  outputDir: './test-results/showdown-artifacts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalTimeout: 15 * 60_000,
  forbidOnly: true,
  reporter: [['list']],
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:3222',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  },
  projects: [
    { name: 'phone-320', use: { ...devices['Pixel 7'], viewport: { width: 320, height: 640 } } },
    { name: 'phone-390', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'zoom-200', use: { ...devices['Desktop Chrome'], viewport: { width: 640, height: 400 } } },
  ],
  webServer: {
    // The build runs as its own step (`pretest:showdown`), so a broken build
    // fails with its own output instead of as an opaque webServer timeout.
    command: 'PORT=3222 npm start',
    url: 'http://127.0.0.1:3222/dev/showdown',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI && !process.env.AGENT_RUN,
    stdout: 'pipe',
    stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
