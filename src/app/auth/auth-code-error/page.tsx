import Link from 'next/link';
import { Logo } from '@/components/Logo';

export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="container-page flex h-16 items-center">
        <Logo />
      </header>
      <main className="container-page flex flex-1 items-center justify-center py-10">
        <div className="card w-full max-w-md p-8 text-center">
          <h1 className="text-2xl font-bold text-white">Couldn&rsquo;t confirm that link</h1>
          <p className="mt-2 text-sm text-slate-400">
            That confirmation link was invalid or has already been used. You can sign in with your
            email and password instead.
          </p>
          <Link href="/login" className="btn-primary mt-6 inline-flex">
            Go to sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
