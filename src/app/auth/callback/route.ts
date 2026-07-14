import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/app';
}

/**
 * Auth callback for magic-link / PKCE flows. Exchanges the code for a session
 * cookie and redirects to the (validated, internal-only) next path.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(new URL('/auth/auth-code-error', url.origin));
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL('/auth/auth-code-error', url.origin));
    }
  } catch {
    return NextResponse.redirect(new URL('/auth/auth-code-error', url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
