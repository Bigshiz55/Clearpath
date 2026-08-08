import 'server-only';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEMPORARY — PREVIEW-ONLY LIVE-VERIFICATION AUTH. DELETE AFTER THE VOICE DNA
 * LIVE MATRIX IS COMPLETE. Tracked for cleanup in BACKLOG.md.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The Voice DNA surfaces gate on a REAL Supabase session whose email passes
 * `isFounderOrAdminEmail`. Product sign-in is magic-link only, so an automated
 * live run against a Vercel PREVIEW deployment has no way to authenticate.
 * This module (plus `/api/preview-test/founder-login`) closes that gap for the
 * duration of the live verification:
 *
 *   - Active ONLY when `VERCEL_ENV === 'preview'` (or local `next dev`).
 *     On production `VERCEL_ENV` is `'production'`, so every entry point is a
 *     hard 404 and the founder-gate override below is a no-op.
 *   - The login route additionally demands a shared secret (below) via header.
 *     Wrong or missing secret → the same hidden 404.
 *   - The synthetic user it signs in is a normal, RLS-isolated `auth.users`
 *     row with a reserved-domain email. It is treated as a FOUNDER (never an
 *     admin) and only while this module says the mechanism is active.
 *
 * The secret is committed on the verification branch only. That is a
 * deliberate, bounded trade-off: this session's environment cannot write
 * Vercel env vars (api.vercel.com is egress-blocked), the repo is private,
 * the mechanism never activates in production, and the whole module is
 * deleted — and the synthetic user disposed via DELETE — when verification
 * finishes.
 */

/** The synthetic live-test identity. `example.com` is RFC 2606 reserved. */
export const PREVIEW_TEST_EMAIL = 'voice-dna-live-test@example.com';

/**
 * Shared secret the login route requires (header `x-preview-test-secret`).
 * Random, minted for this verification effort; worthless off preview.
 */
export const PREVIEW_TEST_SECRET = '3df473affcb85ada9aff25464836b0dd949b367527e902e1';

/** True only where the temporary mechanism may operate. Never in production. */
export function isPreviewTestAuthActive(): boolean {
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
 * `isFounderEmail` and nothing else. Both conditions must hold, so on
 * production (or for any other email) this can never widen access.
 */
export function isActivePreviewTestFounder(email: string | null | undefined): boolean {
  return isPreviewTestAuthActive() && isPreviewTestEmail(email);
}
