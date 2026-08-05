import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';

/**
 * ADMIN AUTHORISATION FOR THE TV PLATFORM ROUTES.
 *
 * Same two doors the existing /api/admin/migrate route uses, so there is one
 * answer to "who is an admin here" rather than a second, subtly different one:
 *
 *   1. a signed-in account whose email is in ADMIN_EMAILS, or
 *   2. a bearer token matching CRON_SECRET, for scheduled callers.
 *
 * FAILS CLOSED. If neither is configured, nobody is authorised — an empty
 * allowlist must never mean "everyone", which is the direction this kind of
 * check tends to rot in.
 *
 * The refusal says WHICH door failed without revealing either secret, because
 * "403" with no explanation is how an operator ends up pasting credentials
 * into a form to find out why.
 */

export type AdminAuthResult =
  | { authorized: true; via: 'admin_email' | 'bearer_token' }
  | { authorized: false; reason: string };

export async function authorizeTvAdmin(request: Request): Promise<AdminAuthResult> {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get('authorization') ?? '';

  if (secret && header === `Bearer ${secret}`) {
    return { authorized: true, via: 'bearer_token' };
  }

  let email: string | null = null;
  try {
    const supabase = createClient();
    // getUser(), not getSession(): the session can be forged client-side.
    const { data: { user } } = await supabase.auth.getUser();
    email = user?.email ?? null;
  } catch {
    /* treated as signed out */
  }

  const admins = serverEnv.adminEmails();
  if (email && admins.includes(email.toLowerCase())) {
    return { authorized: true, via: 'admin_email' };
  }

  if (admins.length === 0 && !secret) {
    return {
      authorized: false,
      reason: 'No admin is configured on this deployment: set ADMIN_EMAILS, or send a bearer token matching CRON_SECRET. An unconfigured allowlist authorises nobody.',
    };
  }
  if (!email && header) {
    return { authorized: false, reason: 'The bearer token did not match.' };
  }
  if (!email) {
    return { authorized: false, reason: 'Not signed in, and no bearer token was sent.' };
  }
  return { authorized: false, reason: 'This account is not on the admin allowlist.' };
}
