'use client';

/**
 * "NEW HERE?" — a quiet, dismissible pointer to the tour, not the tour
 * itself. Mirrors InstallHint's contract exactly (self-hides once dismissed
 * or once the tour has actually been opened), so this never becomes the
 * inline welcome strip that was deliberately removed —
 * that one occupied the home hub for everyone, permanently; this one is gone
 * for good the moment a visitor either tries the tour or says no thanks.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SEEN_KEY } from './HowItWorksTour';

const DISMISSED_KEY = 'wv.tourhint.dismissed.v1';

export function TourHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) === '1') return;
      if (localStorage.getItem(DISMISSED_KEY) === '1') return;
    } catch {
      return;
    }
    setShow(true);
  }, []);

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  if (!show) return null;

  return (
    <div
      data-testid="tour-hint"
      className="flex items-center gap-3 rounded-2xl border border-[#ff1493]/30 bg-[#ff1493]/[0.06] p-3 sm:p-4"
    >
      <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-[#ff1493]/15 text-2xl" aria-hidden>
        🎬
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-white">New here?</div>
        <div className="mt-0.5 text-xs text-slate-300">
          A 60-second walkthrough of the gavel, your Watch DNA, and everything else.
        </div>
      </div>
      <Link href="/app/tour" onClick={dismiss} className="btn-primary flex-none px-3.5 py-2 text-sm">
        Take the tour
      </Link>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex-none rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
