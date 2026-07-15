import 'server-only';
import { serverEnv } from '@/lib/env';

/**
 * Admin gating via an env allowlist (ADMIN_EMAILS), NOT a database flag — so
 * there's no row a user could flip to promote themselves. Verified server-side
 * on every admin action and page.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return serverEnv.adminEmails().includes(email.toLowerCase());
}
