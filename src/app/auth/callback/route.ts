import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { autoMergeIfSafe } from '@/lib/actions/mergeAccount';

export const dynamic = 'force-dynamic';

function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/app';
}

/**
 * Auth callback for magic-link / PKCE flows. Exchanges the code for a session
 * cookie and redirects to the (validated, internal-only) next path.
 *
 * If the browser had an anonymous session active before the exchange, its
 * watchlist would otherwise just be orphaned the moment the cookie swaps to
 * the real account. This captures that anonymous user id BEFORE exchanging
 * (the anonymous session is still live at that point), then — after the
 * swap — either merges it automatically (nothing on the target account to
 * conflict with) or sends the user to a decision screen when both sides
 * have real data, so nothing is ever silently lost or silently combined.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(new URL('/auth/auth-code-error', url.origin));
  }

  const supabase = createClient();

  let anonUserId: string | null = null;
  try {
    const {
      data: { user: preUser },
    } = await supabase.auth.getUser();
    if (preUser?.is_anonymous) anonUserId = preUser.id;
  } catch {
    /* no pre-existing session — nothing to carry over */
  }

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL('/auth/auth-code-error', url.origin));
    }
  } catch {
    return NextResponse.redirect(new URL('/auth/auth-code-error', url.origin));
  }

  if (anonUserId) {
    try {
      const result = await autoMergeIfSafe(anonUserId);
      if (result.status === 'needs_decision') {
        const mergeUrl = new URL('/auth/merge', url.origin);
        mergeUrl.searchParams.set('anon', anonUserId);
        mergeUrl.searchParams.set('next', next);
        return NextResponse.redirect(mergeUrl);
      }
    } catch {
      // A merge failure should never block sign-in — but silently leaving
      // the pre-signin data unmerged with no trace was itself a silent
      // discard. Send the user to the same decision screen instead: it
      // re-derives the preview fresh and offers an explicit "Merge both"
      // retry (or "Discard"), rather than the data just vanishing.
      const mergeUrl = new URL('/auth/merge', url.origin);
      mergeUrl.searchParams.set('anon', anonUserId);
      mergeUrl.searchParams.set('next', next);
      return NextResponse.redirect(mergeUrl);
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
