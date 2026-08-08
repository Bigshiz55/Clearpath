import { readdirSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEMPORARY — VOICE DNA LIVE-VERIFICATION MATRIX (preview deployments only).
 * Deleted together with src/lib/previewTestAuth.ts once verification is done.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Drives the REAL deployed preview (not a local server): founder gate, the
 * temporary preview-only test login, the /voice-dna interview end-to-end on
 * the typed-fallback ladder, resume, completion → DNA reveal, and the
 * audition page.
 *
 *   VOICE_DNA_PREVIEW_URL=https://clearpath-git-<branch>-bigshiz56.vercel.app \
 *     npx playwright test -c playwright.voicedna.config.ts
 *
 * Serial by design: every row shares the one synthetic test identity, and the
 * interview is stateful on the server.
 */

const PREVIEW_URL = process.env.VOICE_DNA_PREVIEW_URL ?? '';

/**
 * Vercel Deployment Protection bypass, when the project has one configured.
 * Without it every request to a protected preview is redirected to
 * `vercel.com/login?next=/sso-api…` and no product assertion means anything.
 * `x-vercel-set-bypass-cookie` makes the bypass stick for the subsequent
 * page navigations Playwright performs, not just the first request.
 */
const BYPASS = process.env.VOICE_DNA_BYPASS ?? '';
const bypassHeaders = BYPASS
  ? {
      'x-vercel-protection-bypass': BYPASS,
      'x-vercel-set-bypass-cookie': 'samesitenone',
    }
  : undefined;

/** Resolve the pre-installed Chromium without pinning a versioned dir name. */
function chromiumExecutable(): string | undefined {
  try {
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
    const dir = readdirSync(root).find((d) => d.startsWith('chromium'));
    return dir ? `${root}/${dir}/chrome-linux/chrome` : undefined;
  } catch {
    return undefined;
  }
}

const executablePath = chromiumExecutable();

export default defineConfig({
  testDir: './tests/voicedna-live',
  outputDir: './test-results/voicedna-live-artifacts',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  globalTimeout: 30 * 60_000,
  forbidOnly: true,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'evaluation-results/voice-dna-live/results.json' }],
  ],
  expect: { timeout: 15_000 },
  use: {
    baseURL: PREVIEW_URL,
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    ...(bypassHeaders ? { extraHTTPHeaders: bypassHeaders } : {}),
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
});
