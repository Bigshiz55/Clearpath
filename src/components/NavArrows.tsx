'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * On-screen Back / Home / Forward controls, shown on every /app screen so people
 * (especially seniors) can move between pages without hunting for the browser's
 * buttons or opening the menu. Back/Forward drive the real browser history; the
 * buttons scale up automatically in Vintage / big-text mode via `btn-secondary`.
 */
export function NavArrows() {
  const router = useRouter();
  const pathname = usePathname();
  const [canBack, setCanBack] = useState(false);
  const onHome = pathname === '/app';

  useEffect(() => {
    // There's a previous screen to return to whenever this tab has history.
    setCanBack(typeof window !== 'undefined' && window.history.length > 1);
  }, [pathname]);

  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => router.back()}
        disabled={!canBack}
        className="btn-secondary inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Go back to the previous page"
      >
        <span aria-hidden className="text-lg leading-none">←</span> Back
      </button>

      {!onHome && (
        <Link
          href="/app"
          className="btn-secondary inline-flex items-center gap-1.5"
          aria-label="Go to the home page"
        >
          <span aria-hidden className="text-lg leading-none">🏠</span>
          <span className="hidden sm:inline">Home</span>
        </Link>
      )}

      <button
        type="button"
        onClick={() => router.forward()}
        className="btn-secondary inline-flex items-center gap-1.5"
        aria-label="Go forward to the next page"
      >
        Forward <span aria-hidden className="text-lg leading-none">→</span>
      </button>
    </div>
  );
}
