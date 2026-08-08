import 'server-only';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEMPORARY — PREVIEW-ONLY LIVE-VERIFICATION AUTH. DELETE AFTER THE VOICE DNA
 * LIVE MATRIX IS COMPLETE. Tracked for cleanup in BACKLOG.md and
 * docs/VOICE_DNA_LIVE_VERIFICATION.md §7.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The Voice DNA surfaces gate on a REAL Supabase session whose email passes
 * `isFounderOrAdminEmail`. Product sign-in is magic-link only, so an automated
 * live run against a Vercel PREVIEW deployment has no way to authenticate.
 * This module (plus `/api/preview-test/founder-login`) closes that gap for the
 * duration of the live verification.
 *
 * THREE CONDITIONS, ALL REQUIRED, OR THE MECHANISM DOES NOT EXIST:
 *
 *   1. `VERCEL_ENV === 'preview'` (or a local `next dev` with no VERCEL_ENV).
 *      Production sets `VERCEL_ENV=production`, so every entry point is a hard
 *      404 there and the founder-gate override is a no-op.
 *   2. `PREVIEW_TEST_SECRET` is configured server-side and is long enough to
 *      be a real secret. Absent or too short → the mechanism is OFF, not
 *      weakly protected.
 *   3. The caller presents that exact secret in `x-preview-test-secret`.
 *
 * THE SECRET IS NOT IN THIS FILE, AND MUST NEVER BE.
 *
 * An earlier revision of this module hard-coded it, justified by "the repo is
 * private". THAT WAS WRONG — `Bigshiz55/Clearpath` is a PUBLIC repository, so
 * that constant was a published credential: anyone could have read it and, on
 * any preview where the route existed, minted a founder-equivalent Supabase
 * session. It was mitigated only accidentally, by Vercel Deployment Protection
 * happening to be enabled. Treat that value as burned; it is gone from the
 * code and is not reused. The secret now lives solely in the deployment
 * environment, which is where a credential belongs.
 */

/** The synthetic live-test identity. `example.com` is RFC 2606 reserved. */
export const PREVIEW_TEST_EMAIL = 'voice-dna-live-test@example.com';

/** Anything shorter than this is not a secret; treat it as unconfigured. */
const MIN_SECRET_LENGTH = 24;

/**
 * The shared secret the login route requires, read from the server
 * environment. `null` means the mechanism is disabled — the fail-closed
 * default, including on every deployment where nobody has set it.
 */
export function previewTestSecret(): string | null {
  const value = (process.env.PREVIEW_TEST_SECRET ?? '').trim();
  return value.length >= MIN_SECRET_LENGTH ? value : null;
}

/** True only where the temporary mechanism may operate. Never in production. */
export function isPreviewTestAuthActive(): boolean {
  // No secret configured → the mechanism does not exist, anywhere.
  if (previewTestSecret() === null) return false;
  if (process.env.VERCEL_ENV === 'preview') return true;
  // Local `next dev` convenience; `next build`/`next start` and vitest do not qualify.
  return process.env.NODE_ENV === 'development' && !process.env.VERCEL_ENV;
}

/** Does this email belong to the synthetic live-test identity? */
export function isPreviewTestEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === PREVIEW_TEST_EMAIL;
}

/**
 * Founder-equivalence for the synthetic identity — consulted by
 * `isFounderEmail` and nothing else. Every condition above must hold, so on
 * production, or with no secret configured, this can never widen access.
 */
export function isActivePreviewTestFounder(email: string | null | undefined): boolean {
  return isPreviewTestAuthActive() && isPreviewTestEmail(email);
}
