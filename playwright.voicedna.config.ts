import { readdirSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
import { SHARE_STATE_PATH, splitShareUrl } from './tests/voicedna-live/globalSetup';

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

/**
 * TWO INDEPENDENT WAYS PAST DEPLOYMENT PROTECTION, either of which is enough:
 *
 *  1. A SHARE LINK. `VOICE_DNA_PREVIEW_URL` may be pasted verbatim with its
 *     `?_vercel_share=…` token; globalSetup redeems it once into a
 *     `_vercel_jwt` cookie and every context inherits that via storageState.
 *     The token is stripped from `baseURL` here so it cannot leak into a
 *     reporter, a trace, or a failure message.
 *  2. A PROTECTION BYPASS SECRET (`VOICE_DNA_BYPASS`), sent as a header.
 *
 * With neither, row A0 reports the wall as a single PLATFORM CONFIG verdict
 * and the remaining rows skip.
 */
const { baseURL: PREVIEW_URL } = splitShareUrl(process.env.VOICE_DNA_PREVIEW_URL ?? '');

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
  globalSetup: './tests/voicedna-live/globalSetup.ts',
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
    // Written by globalSetup on every run (empty when there is no share token),
    // so this path always exists by the time a context is created.
    storageState: SHARE_STATE_PATH,
    ...(bypassHeaders ? { extraHTTPHeaders: bypassHeaders } : {}),
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
});
