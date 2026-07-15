'use client';

import { useState } from 'react';
import { updateWatchlistItem } from '@/lib/actions/watchlist';
import { tmdbImage } from '@/lib/tmdb/image';
import type { UnratedItem } from '@/lib/tonight';

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function RateNudge({ items }: { items: UnratedItem[] }) {
  const [queue, setQueue] = useState<UnratedItem[]>(items);
  const [busy, setBusy] = useState(false);

  if (queue.length === 0) return null;
  const current = queue[0]!;
  const poster = tmdbImage(current.posterPath, 'w185');

  async function rate(score: number) {
    setBusy(true);
    await updateWatchlistItem({ itemId: current.itemId, rating: score }).catch(() => {});
    setBusy(false);
    setQueue((q) => q.slice(1));
  }
  function skip() {
    setQueue((q) => q.slice(1));
  }

  return (
    <section className="card border-gold-400/30 bg-gold-500/[0.06] p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">⭐ How was it?</h2>
        <span className="text-xs text-slate-500">{queue.length} to rate</span>
      </div>
      <p className="mt-0.5 text-xs text-slate-400">
        Rating what you finish makes every match score, recommendation, and Docket sharper.
      </p>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-20 w-14 flex-none overflow-hidden rounded-lg border border-white/10">
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center bg-white/5 text-[10px] text-slate-500">
              {current.mediaType === 'tv' ? 'TV' : '🎬'}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 text-sm font-semibold text-white">
            {current.title} {current.year ? <span className="font-normal text-slate-400">({current.year})</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {SCORES.map((s) => (
              <button
                key={s}
                onClick={() => rate(s)}
                disabled={busy}
                className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-sm font-bold text-slate-200 transition hover:border-gold-400/60 hover:bg-gold-500/20 hover:text-white disabled:opacity-50"
              >
                {s}
              </button>
            ))}
            <button onClick={skip} disabled={busy} className="ml-1 h-8 rounded-lg px-2 text-xs text-slate-400 hover:text-white">
              Skip
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
