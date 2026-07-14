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
          <h1 className="text-2xl font-bold text-white">Sign-in link expired</h1>
          <p className="mt-2 text-sm text-slate-400">
            That sign-in link was invalid or has already been used. Sign-in links can only be used
            once and expire after a short time.
          </p>
          <Link href="/login" className="btn-primary mt-6 inline-flex">
            Request a new link
          </Link>
        </div>
      </main>
    </div>
  );
}
