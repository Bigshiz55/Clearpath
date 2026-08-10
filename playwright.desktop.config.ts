import { defineConfig, devices } from '@playwright/test';

/**
 * DESKTOP Playwright suite — a REAL desktop project, not a resized phone.
 *
 * The mobile config's default context happens to be desktop-shaped, and it
 * would have been cheap to widen a viewport there and call it desktop
 * coverage. That would have proved nothing about the behaviour this suite
 * exists for: hover-intent previews depend on `pointerType === 'mouse'`,
 * on `(hover: hover) and (pointer: fine)`, and on boundary events a touch
 * context never emits. A project descriptor is the only way to be sure the
 * browser is telling the page it is a pointing device — `hasTouch: false`,
 * `isMobile: false`, a desktop UA — rather than the suite assuming it.
 *
 * It runs on its own port (3212) so it can run beside, or independently of,
 * `playwright.mobile.config.ts` without either adopting the other's server.
 * The build is a separate step (`pretest:desktop`) for the same reason it is
 * in the mobile config: a broken build must fail as a build, not as an opaque
 * webServer timeout.
 */
export default defineConfig({
  testDir: './tests/desktop',
  outputDir: './test-results/desktop-artifacts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  globalTimeout: 30 * 60_000,
  forbidOnly: true,
  reporter: [['list']],
  expect: { timeout: 10_000 },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:3212',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  },
  webServer: {
    // Same contract as the mobile config: NEXT_PUBLIC_* are inlined at BUILD
    // time by `npm run build:harness`, which runs as its own step before this.
    // The Supabase values are dummies against a domain that does not resolve;
    // every suite intercepts the calls that would use them.
    command:
      'MOBILE_HARNESS=1 PORT=3212 ' +
      'NEXT_PUBLIC_SUPABASE_URL=https://harness.invalid ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=harness-anon-key ' +
      'npm start 2>&1 | tee test-results/webserver-desktop.log',
    url: 'http://127.0.0.1:3212/dev/visual-qa',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI && !process.env.AGENT_RUN,
    stdout: 'pipe',
    stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
