import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import { serverEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * FOUNDER SELF-CHECK — "why can't I open the lab?"
 *
 * The founder route answers a stranger with a 404, which is correct security
 * but useless diagnostics: a signed-in owner who mistyped their address sees
 * exactly what an attacker sees. This endpoint closes that gap without opening
 * the door.
 *
 * It reports ONLY about the caller, and only to the caller:
 *   * whether they have a session at all
 *   * the email that session actually carries — the single most useful fact,
 *     because the usual failure is signing in with a different address than the
 *     one that went into the allowlist
 *   * whether THAT address is authorized
 *
 * It never returns the allowlist, never says whether some *other* address is on
 * it, and never reveals its contents by count alone beyond what
 * `?probe=founder` already reports. Answering only about the authenticated
 * caller is what stops this being an enumeration oracle.
 */
export async function GET() {
  const headers = { 'cache-control': 'no-store' };

  let email: string | null = null;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    email = user?.email ?? null;
  } catch {
    // Misconfigured Supabase looks the same as signed-out from here.
  }

  const adminCount = serverEnv.adminEmails().length;

  if (!email) {
    return NextResponse.json({
      signedIn: false,
      authorized: false,
      reason: 'not_signed_in',
      adminEmailsConfigured: adminCount > 0,
      nextStep: 'Sign in at /login, then reload this page.',
    }, { headers });
  }

  if (isAdminEmail(email)) {
    return NextResponse.json({
      signedIn: true,
      authorized: true,
      yourAccountEmail: email,
      reason: 'email_is_authorized',
      nextStep: 'Open /founder/recommendation-lab — it will load.',
    }, { headers });
  }

  return NextResponse.json({
    signedIn: true,
    authorized: false,
    // Returned to the signed-in owner of this address, about themselves.
    yourAccountEmail: email,
    reason: adminCount === 0 ? 'admin_list_is_empty' : 'your_email_is_not_on_the_admin_list',
    adminEmailsConfigured: adminCount > 0,
    adminEmailCount: adminCount,
    nextStep: adminCount === 0
      ? 'ADMIN_EMAILS is not set on this deployment. Set it in Vercel (Production + Preview) and redeploy.'
      : `ADMIN_EMAILS is set (${adminCount} entr${adminCount === 1 ? 'y' : 'ies'}) but does not include "${email}". ` +
        'Add exactly that address — the comparison is case-insensitive and ignores surrounding spaces — then redeploy.',
  }, { headers });
}
