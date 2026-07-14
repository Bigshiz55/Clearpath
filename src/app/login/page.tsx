import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { LoginForm } from '@/components/auth/LoginForm';
import { getCurrentUser } from '@/lib/supabase/server';

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
  if (user) redirect(next);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center">
        <Logo />
      </header>
      <main className="container-page flex flex-1 items-center justify-center py-10">
        <LoginForm next={next} />
      </main>
      <footer className="container-page py-6 text-center text-xs text-slate-500">
        <Link href="/" className="hover:text-slate-300">
          ← Back home
        </Link>
      </footer>
    </div>
  );
}
