import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { Tagline } from '@/components/Tagline';
import { LoginForm } from '@/components/auth/LoginForm';
import { getCurrentUser } from '@/lib/supabase/server';
import { checkAuthRedirect } from '@/lib/auth/redirectCheck';

export const dynamic = 'force-dynamic';

function safeNext(raw: string | undefined): string {
  // Only allow internal absolute paths to prevent open redirects.
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/app';
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = safeNext(searchParams.next);

  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // Supabase not configured — allow the form to render its own errors.
  }
  // An anonymous session still needs to reach this form — that's the /login
  // entry point for upgrading to a real account. Only a REAL signed-in user
  // skips straight past it.
  if (user && !user.is_anonymous) redirect(next);

  // Ask Supabase, before the form is ever submitted, whether a link sent from
  // THIS origin will actually come back to it. A deployment whose hostname is
  // not on the project's redirect allow-list gets silently rewritten to the
  // Site URL, and the person only discovers it when the email lands them on a
  // site that isn't the one they were using. Fails open — see redirectCheck.ts.
  const h = headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
  const origin = host ? `${proto}://${host}` : '';
  const check = await checkAuthRedirect(origin);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 flex-wrap items-center gap-x-4 gap-y-1">
        <Logo />
        <Tagline className="hidden text-sm sm:block" />
      </header>
      <main className="container-page flex flex-1 items-center justify-center py-10">
        <LoginForm next={next} strandedOn={check.ok ? undefined : check.landsOn} />
      </main>
      <footer className="container-page py-6 text-center text-xs text-slate-500">
        <Link href="/" className="hover:text-slate-300">
          ← Back home
        </Link>
      </footer>
    </div>
  );
}
