import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { isAdminEmail } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * ADMIN STATUS, SO A FAILURE EXPLAINS ITSELF.
 *
 * Without this, "Not signed in" and "not authorized" are indistinguishable
 * dead ends: the owner signs in, is still refused, and has no way to tell
 * whether the account is wrong, the allowlist is empty, or the server is
 * misconfigured. This reports which of those it is.
 *
 * Leaks nothing: it returns whether an allowlist EXISTS and whether the
 * CURRENT signed-in address is on it — never the list, never any secret.
 */
export async function GET() {
  let signedIn = false;
  let email: string | null = null;
  let anonymous = false;

  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      signedIn = true;
      email = user.email ?? null;
      // Supabase anonymous sessions have no email — the app mints these for
      // ordinary visitors, so "signed in" alone is not "has an account".
      anonymous = !user.email;
    }
  } catch {
    /* treated as signed out */
  }

  let allowlistConfigured = false;
  try {
    allowlistConfigured = serverEnv.adminEmails().length > 0;
  } catch {
    allowlistConfigured = false;
  }

  const isAdmin = isAdminEmail(email);

  return NextResponse.json(
    {
      signedIn,
      anonymous,
      email,
      isAdmin,
      allowlistConfigured,
      // The single next action, decided server-side so the UI cannot guess wrong.
      nextStep: !signedIn || anonymous
        ? 'sign_in'
        : !allowlistConfigured
          ? 'configure_allowlist'
          : !isAdmin
            ? 'wrong_account'
            : 'ready',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
