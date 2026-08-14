'use client';

/**
 * FIRST-RUN EXPLAINER — "60 seconds — let's build your DNA."
 *
 * The landing page now has exactly ONE entrance and no secondary doors, so
 * the first thing a brand-new person sees inside the app carries the pitch
 * the front step no longer makes: verdicts are personal only once there is a
 * DNA to score against, and sixty seconds of rating real titles is what
 * builds it.
 *
 * WHO SEES IT. The server renders this ONLY for a user with no DNA signal
 * yet (see app/page.tsx) — a veteran with a built profile is past first-run
 * by definition and must never be nagged back to the quiz. On top of that
 * gate, the person keeps two kinds of "no":
 *
 *   SKIP FOR NOW      — sessionStorage: gone for this visit, back on the
 *                       next one. Skipping is deferral, not a decision.
 *   DON'T SHOW AGAIN  — localStorage: a decision. Mirrors the
 *                       InstallHint/TourHint contract — gone for good.
 *
 * Taking the primary action counts as done (the quiz IS first-run), so it
 * writes the permanent key too.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';

const DONE_KEY = 'wv.firstrun.done.v1';
const SKIP_KEY = 'wv.firstrun.skipped.session';

export function FirstRunExplainer() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DONE_KEY) === '1') return;
      if (sessionStorage.getItem(SKIP_KEY) === '1') return;
    } catch {
      return;
    }
    setShow(true);
  }, []);

  function skip() {
    setShow(false);
    try {
      sessionStorage.setItem(SKIP_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  function done() {
    setShow(false);
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  if (!show) return null;

  return (
    <section
      data-testid="first-run-explainer"
      className="rounded-2xl border border-brand-400/30 bg-brand-400/[0.06] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-400/15 text-2xl" aria-hidden>
          🧬
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-white sm:text-lg">60 seconds — let&rsquo;s build your DNA.</h2>
          <p className="mt-1 text-sm text-slate-300">
            Every Verd1ct here is scored against <em>your</em> Watch DNA. Rate a handful of titles you already know
            and the scores stop being generic and start being yours.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link href="/app/taste-quiz" onClick={done} className="btn-primary px-3.5 py-2 text-sm" data-testid="first-run-start">
              Build my DNA
            </Link>
            <button onClick={skip} className="btn-ghost px-3 py-2 text-sm" data-testid="first-run-skip">
              Skip for now
            </button>
            <button
              onClick={done}
              className="px-2 py-2 text-xs text-slate-500 underline hover:text-slate-300"
              data-testid="first-run-never"
            >
              Don&rsquo;t show this again
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
