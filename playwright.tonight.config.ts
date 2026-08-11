import { defineConfig, devices } from '@playwright/test';

/**
 * THE TONIGHT MACHINE — browser suite.
 *
 * Drives `/dev/tonight`, which mounts the real component with no auth in front
 * of it. Scoped to its own config and port so it runs in under a minute: the
 * mobile suite is ~900 tests and an hour long, and a check nobody runs is not a
 * check.
 *
 * The projects below are the shapes that actually break things, not a
 * decorative device list — a 320px phone is where the answer buttons collide, a
 * desktop is where a mobile-first layout strands content in a column, and the
 * zoom project is a real accessibility requirement rather than a nicety.
 */
export default defineConfig({
  testDir: './tests/tonight',
  outputDir: './test-results/tonight-artifacts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalTimeout: 15 * 60_000,
  forbidOnly: true,
  reporter: [['list']],
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:3220',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  },
  projects: [
    // The narrowest phone still in real use. Everything must fit here.
    { name: 'phone-320', use: { ...devices['Pixel 7'], viewport: { width: 320, height: 640 } } },
    { name: 'phone-390', use: { ...devices['Pixel 7'] } },
    // iPad shape on Chromium. The stock `iPad (gen 7)` descriptor defaults to
    // WebKit, which is not installed here, so it fails at launch rather than
    // testing anything — the tablet LAYOUT is what this project is for.
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 810, height: 1080 },
        isMobile: false,
        hasTouch: true,
      },
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // 200% zoom on a 1280px desktop presents as a 640px CSS viewport with a
    // desktop UA — the combination a `sm:` breakpoint gets wrong most often.
    { name: 'zoom-200', use: { ...devices['Desktop Chrome'], viewport: { width: 640, height: 400 } } },
  ],
  webServer: {
    // The build runs as its own step (`pretest:tonight`), so a broken build
    // fails with its own output instead of as an opaque webServer timeout.
    command: 'PORT=3220 npm start',
    url: 'http://127.0.0.1:3220/dev/tonight',
    timeout: 120_000,
    // Adopting a process already on the port hides a stale build behind what
    // looks like a clean run.
    reuseExistingServer: !process.env.CI && !process.env.AGENT_RUN,
    stdout: 'pipe',
    stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
