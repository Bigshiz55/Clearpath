import 'server-only';
import { serverEnv } from '@/lib/env';
import { isActivePreviewTestFounder } from '@/lib/previewTestAuth';

/**
 * Admin gating via an env allowlist (ADMIN_EMAILS), NOT a database flag — so
 * there's no row a user could flip to promote themselves. Verified server-side
 * on every admin action and page.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return serverEnv.adminEmails().includes(email.trim().toLowerCase());
}

/** True when the email matches one of the three configured founder accounts. */
export function isFounderEmail(email: string | null | undefined): boolean {
  // TEMPORARY (preview-only live verification): the synthetic Voice DNA test
  // identity counts as a founder on preview deployments ONLY. No-op in
  // production. Delete with src/lib/previewTestAuth.ts after the live matrix.
  if (isActivePreviewTestFounder(email)) return true;
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (!e) return false;
  const founders = serverEnv.founderEmails();
  // Only NON-empty configured founder emails count. A blank/missing env var
  // authorises nobody — an unconfigured slot must never match the empty string.
  return Object.values(founders).some((f) => !!f && f === e);
}

/**
 * SHARED founder-or-admin gate for SHARED founder DIAGNOSTIC pages (e.g.
 * /founder/search-proof). Any configured founder OR any admin passes; everyone
 * else — including an unauthenticated request — is rejected. This deliberately
 * does NOT relax per-founder personal test environments (still mapped to their
 * own founder via `founderByKey`) or admin-only destructive tooling (still
 * `isAdminEmail`). No email is ever hard-coded and no list reaches the client.
 */
export function isFounderOrAdminEmail(email: string | null | undefined): boolean {
  return isAdminEmail(email) || isFounderEmail(email);
}
