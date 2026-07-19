'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RateNudge } from '@/components/RateNudge';
import type { Tonight } from '@/lib/tonight';

function WelcomeStrip({ isGuest }: { isGuest: boolean }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <section className="card relative overflow-hidden border-brand-400/30 bg-brand-500/[0.07] p-5">
      <button
        onClick={() => setOpen(false)}
        className="absolute right-3 top-3 text-slate-400 hover:text-white"
        aria-label="Dismiss"
      >
        ✕
      </button>
      <h2 className="text-lg font-bold text-white">👋 Welcome to WatchVrdIQt</h2>
      <p className="mt-1 max-w-xl text-sm text-slate-300">
        Stop scrolling, get rolling. Here’s the 30-second tour:
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-sm font-semibold text-white">1 · Get a verdict</div>
          <div className="text-xs text-slate-400">Search any title for a WATCH IT / SKIP IT call, scored for you.</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-sm font-semibold text-white">2 · Teach it your taste</div>
          <div className="text-xs text-slate-400">
            Take the <Link href="/app/quiz" className="text-brand-300 underline">Taste Quiz</Link> — a few taps and every score gets personal.
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-sm font-semibold text-white">3 · Decide together</div>
          <div className="text-xs text-slate-400">
            <Link href="/app/together" className="text-brand-300 underline">Tonight, Together</Link> settles the whole room in seconds.
          </div>
        </div>
      </div>
      {isGuest && (
        <p className="mt-3 text-xs text-slate-400">
          You’re browsing as a guest — everything works. Save an account any time to keep your list and taste.
        </p>
      )}
    </section>
  );
}

export function TonightHome({ tonight, isGuest }: { tonight: Tonight; isGuest: boolean }) {
  if (tonight.fresh) {
    return <WelcomeStrip isGuest={isGuest} />;
  }

  return (
    <div className="space-y-4">
      {tonight.unrated.length > 0 && <RateNudge items={tonight.unrated} />}
    </div>
  );
}
