'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { reportReliabilityEvent } from '@/lib/monitoringClient';

/**
 * Root error boundary — catches any render error below the root layout
 * that Next.js can't recover from on its own. Previously there was NO
 * error boundary anywhere in the app: an uncaught error hit Next's bare
 * default screen with nothing reported anywhere.
 *
 * Reports only `error.name` and `error.digest` (Next's own opaque id for
 * server-rendered errors) — never `error.message` or the stack, since a
 * thrown error's message can echo back arbitrary content (a title, a
 * query) that has no business in an operational log.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportReliabilityEvent('js_error', {
      route: typeof window !== 'undefined' ? window.location.pathname.slice(0, 80) : null,
      name: error.name.slice(0, 80),
      digest: error.digest?.slice(0, 80) ?? null,
    });
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
      <p className="max-w-sm text-sm text-slate-400">
        This page hit an unexpected error. It’s been noted — try again, or go back home.
      </p>
      <div className="mt-2 flex gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Go home
        </Link>
      </div>
    </div>
  );
}
