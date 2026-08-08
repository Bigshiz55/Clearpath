import { request } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEMPORARY — redeem a Vercel authenticated SHARE link once, so the whole
 * matrix can run against a protected preview without disabling Deployment
 * Protection and without a Protection-Bypass secret.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A share link carries a `_vercel_share` token. Requesting the deployment once
 * with that token makes Vercel set a `_vercel_jwt` cookie for the deployment
 * host; every later request — page navigation and API call alike — is then
 * admitted on the cookie alone. Redeeming it here, once, and persisting the
 * resulting cookie as Playwright `storageState` means no test has to know the
 * token, and the token never has to be appended to individual requests.
 *
 * THE TOKEN IS NEVER COMMITTED AND NEVER PRINTED. It arrives only as
 * `VOICE_DNA_SHARE_TOKEN`, or embedded in the `VOICE_DNA_PREVIEW_URL` query
 * string (a pasted share link works as-is), and is stripped from the base URL
 * before anything is logged. The cookie it produces lands in a gitignored
 * test-results path.
 *
 * With no token this writes an EMPTY storage state rather than failing: the
 * matrix's own A0 row is what reports a protection wall, with one clear
 * verdict, and it must be allowed to reach that conclusion.
 */

export const SHARE_STATE_PATH = 'test-results/voicedna-live-artifacts/share-state.json';

const EMPTY_STATE = { cookies: [], origins: [] };

/** Split a possibly-share-bearing URL into its origin and its token. */
export function splitShareUrl(raw: string): { baseURL: string; token: string | null } {
  try {
    const url = new URL(raw);
    const token = url.searchParams.get('_vercel_share');
    url.searchParams.delete('_vercel_share');
    // Keep only the origin: the matrix addresses paths relative to the root.
    return { baseURL: url.origin, token: token && token.length > 0 ? token : null };
  } catch {
    return { baseURL: raw, token: null };
  }
}

/** The preview origin, with any share token removed. Safe to log. */
export function previewBaseUrl(): string {
  return splitShareUrl(process.env.VOICE_DNA_PREVIEW_URL ?? '').baseURL;
}

function writeState(state: unknown): void {
  mkdirSync(dirname(SHARE_STATE_PATH), { recursive: true });
  writeFileSync(SHARE_STATE_PATH, JSON.stringify(state), 'utf8');
}

export default async function globalSetup(): Promise<void> {
  const raw = process.env.VOICE_DNA_PREVIEW_URL ?? '';
  const { baseURL, token: tokenInUrl } = splitShareUrl(raw);
  const token = process.env.VOICE_DNA_SHARE_TOKEN?.trim() || tokenInUrl;

  if (!baseURL || !token) {
    // Nothing to redeem. A0 will report the wall if there is one.
    writeState(EMPTY_STATE);
    return;
  }

  const ctx = await request.newContext({ baseURL });
  try {
    // Redeeming sets `_vercel_jwt` for this host. Follow redirects so the
    // cookie survives Vercel's own bounce back to the deployment.
    const res = await ctx.get(`/?_vercel_share=${encodeURIComponent(token)}`);
    const state = await ctx.storageState();
    const admitted = state.cookies.some((c) => c.name.startsWith('_vercel_jwt'));
    // Status and outcome only — never the token, never the Set-Cookie value.
    console.log(
      `[voice-dna] share redemption: HTTP ${res.status()}, ` +
        `${admitted ? 'bypass cookie acquired' : 'NO bypass cookie — token may be expired or wrong deployment'}`,
    );
    writeState(state);
  } catch (err) {
    console.log(
      `[voice-dna] share redemption failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    writeState(EMPTY_STATE);
  } finally {
    await ctx.dispose();
  }
}
