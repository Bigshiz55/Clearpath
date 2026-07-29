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
    // THE BUILD IS PART OF THE HARNESS, NOT A PRECONDITION OF IT.
    //
    // `NEXT_PUBLIC_*` values are INLINED INTO THE CLIENT BUNDLE AT BUILD TIME.
    // This command used to set them only on `npm start`, which is far too late:
    // a bundle built without them threw `ConfigError: Missing required
    // configuration: NEXT_PUBLIC_SUPABASE_URL` the moment any client component
    // constructed a browser Supabase client, and the whole screen became "an
    // application error has occurred". A plain `npm run build && npm run
    // test:mobile` — a fresh checkout, or CI — silently produced 27 red Court
    // tests and a white page with no explanation. So the suite now builds what
    // it is about to test.
    //
    // The Supabase values are dummies; no real project is contacted, because
    // every suite intercepts the `/rest/v1/rpc` calls. They are not secrets and
    // grant no access.
    command:
      'npm run build:harness && ' +
      'MOBILE_HARNESS=1 PORT=3211 ' +
      'NEXT_PUBLIC_SUPABASE_URL=https://harness.invalid ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=harness-anon-key ' +
      // TEST-ONLY founder code. Not the production secret and never will be —
      // the real one lives solely in Vercel's environment. It is long enough
      // to satisfy the minimum-length guard so the flow is exercised as
      // deployed rather than through a special short-code path.
      'FOUNDER_ACCESS_CODE=harness-only-founder-code-not-a-secret-0123456789 ' +
      'npm start',
    url: 'http://127.0.0.1:3211/dev/mobile-home',
    // Generous, because it now covers a full production build.
    timeout: 480_000,
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
});
