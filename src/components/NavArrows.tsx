'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Compact on-screen Back / Home / Forward controls, shown on every /app screen
 * so people can move between pages without hunting for the browser's buttons.
 * Icon-first and short so they never dominate the viewport — labels appear from
 * `sm` up; on mobile the icons carry accessible names. On the quiz route the row
 * is tightened further so the one-tile rating card gets the height it needs.
 */
export function NavArrows() {
  const router = useRouter();
  const pathname = usePathname();
  const [canBack, setCanBack] = useState(false);
  const onHome = pathname === '/app';
  const onQuiz = pathname === '/app/quiz';

  useEffect(() => {
    setCanBack(typeof window !== 'undefined' && window.history.length > 1);
  }, [pathname]);

  const btn =
    'inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 ' +
    'text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className={`flex items-center justify-between gap-2 ${onQuiz ? 'mb-2' : 'mb-3 sm:mb-4'}`}>
      <button
        type="button"
        onClick={() => router.back()}
        disabled={!canBack}
        className={btn}
        aria-label="Go back to the previous page"
      >
        <span aria-hidden className="text-base leading-none">←</span>
        <span className="hidden sm:inline">Back</span>
      </button>

      {!onHome && (
        <Link href="/app" className={btn} aria-label="Go to the home page">
          <span aria-hidden className="text-base leading-none">🏠</span>
          <span className="hidden sm:inline">Home</span>
        </Link>
      )}

      <button
        type="button"
        onClick={() => router.forward()}
        className={btn}
        aria-label="Go forward to the next page"
      >
        <span className="hidden sm:inline">Forward</span>
        <span aria-hidden className="text-base leading-none">→</span>
      </button>
    </div>
  );
}
