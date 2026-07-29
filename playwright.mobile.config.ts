import { defineConfig } from '@playwright/test';

/**
 * Mobile-home Playwright suite. Drives the /dev/mobile-home harness
 * (MOBILE_HARNESS=1) — the exact Logo / BuildCaseBox / SearchBar / MobileNav
 * components that render the /app home — across the phone widths that matter, and
 * asserts the rebuilt screen: solid "WatchVERDICT" wordmark (regression for the
 * clipped "WatchVERD_CT"), compact hero, working chips + More ideas, a textarea,
 * a full-width "Hit the Gavel" CTA that never looks disabled, and no horizontal
 * overflow. Screenshots land in test-results/mobile/ for review.
 */
export default defineConfig({
  testDir: './tests/mobile',
  outputDir: './test-results/mobile-artifacts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  // The suite is ~900 tests across 44 files and now builds before it runs. The
  // old 8-minute ceiling silently truncated a full run — 294 tests "did not
  // run" and the report still looked like a result.
  globalTimeout: 60 * 60_000,
  forbidOnly: true,
  reporter: [['list']],
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:3211',
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    launchOptions: { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' },
  },
  webServer: {
    // THE BUILD IS NOT PART OF THIS COMMAND ANYMORE.
    //
    // `NEXT_PUBLIC_*` values are INLINED INTO THE CLIENT BUNDLE AT BUILD TIME,
    // which is why the harness build (`npm run build:harness`) sets them, not
    // `npm start`. It used to run inline here as `build:harness && npm start`
    // so a bundle built without them couldn't slip through — but that made a
    // slow or stuck build indistinguishable from a stuck server: both just
    // looked like "webServer didn't come up in time" with the build's own
    // output discarded (`stdout: 'ignore'`) and nothing to inspect.
    //
    // The build now runs as its own step (`pretest:mobile`, via npm's
    // pre-script convention) ahead of `test:mobile`, so a broken build fails
    // there with its own readable output, not as an opaque webServer timeout.
    // Anyone driving Playwright directly (not through `npm run test:mobile`)
    // is responsible for building first, same as this config now assumes.
    //
    // The Supabase values are dummies; no real project is contacted, because
    // every suite intercepts the `/rest/v1/rpc` calls. They are not secrets and
    // grant no access.
    command:
      'MOBILE_HARNESS=1 PORT=3211 ' +
      'NEXT_PUBLIC_SUPABASE_URL=https://harness.invalid ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=harness-anon-key ' +
      // TEST-ONLY founder code. Not the production secret and never will be —
      // the real one lives solely in Vercel's environment. It is long enough
      // to satisfy the minimum-length guard so the flow is exercised as
      // deployed rather than through a special short-code path.
      'FOUNDER_ACCESS_CODE=harness-only-founder-code-not-a-secret-0123456789 ' +
      // Always write real output to a file, in addition to whatever Playwright
      // captures itself — a startup hang used to leave nothing to inspect.
      'npm start 2>&1 | tee test-results/webserver-start.log',
    url: 'http://127.0.0.1:3211/dev/mobile-home',
    // The build is no longer inline, so a real server start takes seconds.
    timeout: 120_000,
    // Adopting a process already on the port hides a stale/broken server
    // behind what looks like a normal run (see srv2.log-style failures: a
    // dead build error swallowed because the port looked "up"). Interactive
    // local runs may still want reuse; CI and agent runs never should.
    reuseExistingServer: !process.env.CI && !process.env.AGENT_RUN,
    stdout: 'pipe',
    stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
