'use client';

import { useState } from 'react';
import Link from 'next/link';
import { tmdbImage } from '@/lib/tmdb/image';
import { RateNudge } from '@/components/RateNudge';
import { CardRatings } from '@/components/CardRatings';
import { SaveButton } from '@/components/SaveButton';
import type { Tonight } from '@/lib/tonight';

const CALL_STYLE: Record<string, string> = {
  'WATCH IT': 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100',
  MAYBE: 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100',
  'SKIP IT': 'border-red-400/40 bg-red-500/15 text-red-100',
};

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
      <h2 className="text-lg font-bold text-white">👋 Welcome to WatchVerdict</h2>
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

  const pick = tonight.topPick;
  return (
    <div className="space-y-4">
      {tonight.unrated.length > 0 && <RateNudge items={tonight.unrated} />}

      <section className="card overflow-hidden p-5 sm:p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Tonight</div>

        {pick ? (
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
            <Link
              href={`/app/title/${pick.mediaType}/${pick.tmdbId}`}
              className="h-40 w-28 flex-none overflow-hidden rounded-xl border border-white/10"
            >
              {tmdbImage(pick.posterPath, 'w342') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tmdbImage(pick.posterPath, 'w342')!} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-white/5 text-center text-xs text-slate-400">{pick.title}</div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wide text-slate-500">Your top pick right now</div>
              <div className="mt-1 text-xl font-bold text-white sm:text-2xl">
                {pick.title} {pick.year ? <span className="font-normal text-slate-400">({pick.year})</span> : null}
              </div>
              <div className="mt-2 flex items-center gap-2">
                {pick.primaryCall && (
                  <span className={`rounded-lg border px-2.5 py-1 text-xs font-black ${CALL_STYLE[pick.primaryCall] ?? 'border-white/15 text-slate-200'}`}>
                    {pick.primaryCall}
                  </span>
                )}
                <span className="text-sm font-bold tabular-nums text-gold-400">{pick.personalScore} match</span>
              </div>
              {/* Same full ratings row as every other card — Stream/Skip, RT, IMDb, Metacritic. */}
              <CardRatings mediaType={pick.mediaType} tmdbId={pick.tmdbId} title={pick.title} year={pick.year} className="mt-2" />
              {pick.reason && <p className="mt-2 line-clamp-2 text-sm text-slate-300">{pick.reason}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href={`/app/title/${pick.mediaType}/${pick.tmdbId}`} className="btn-primary inline-flex text-sm">
                  See the verdict →
                </Link>
                <SaveButton
                  tmdbId={pick.tmdbId}
                  mediaType={pick.mediaType}
                  title={pick.title}
                  year={pick.year}
                  posterPath={pick.posterPath}
                  variant="inline"
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            Search a title or take the <Link href="/app/quiz" className="text-brand-300 underline">Taste Quiz</Link> and your
            nightly pick shows up here.
          </p>
        )}

        {tonight.continueWatching.length > 0 && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Continue watching</div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {tonight.continueWatching.map((c) => (
                <Link key={`${c.mediaType}-${c.tmdbId}`} href={`/app/title/${c.mediaType}/${c.tmdbId}`} className="w-16 flex-none">
                  <div className="aspect-[2/3] overflow-hidden rounded-lg border border-white/10">
                    {tmdbImage(c.posterPath, 'w185') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tmdbImage(c.posterPath, 'w185')!} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-white/5 text-[9px] text-slate-500">{c.title}</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-3 gap-2">
          <Link href="/app/docket" className="rounded-xl border border-white/10 bg-white/5 p-3 text-center transition hover:bg-white/10">
            <div className="text-lg font-bold text-white">{tonight.watchedThisMonth}</div>
            <div className="text-[11px] text-slate-400">watched this month · Docket</div>
          </Link>
          <Link href="/app/watchlist" className="rounded-xl border border-white/10 bg-white/5 p-3 text-center transition hover:bg-white/10">
            <div className="text-lg font-bold text-white">{tonight.listCount}</div>
            <div className="text-[11px] text-slate-400">on your list</div>
          </Link>
          <Link href="/app/new" className="rounded-xl border border-white/10 bg-white/5 p-3 text-center transition hover:bg-white/10">
            <div className="text-lg font-bold text-white">🆕</div>
            <div className="text-[11px] text-slate-400">new on your plans</div>
          </Link>
        </div>
      </section>
    </div>
  );
}
