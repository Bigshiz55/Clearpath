'use client';

import { useState } from 'react';
import { SaveButton } from './SaveButton';
import { RatingsStrip } from './RatingsStrip';
import { QuickLook, type QuickLookTarget } from './QuickLook';
import { verdictVisualForCall } from '@/lib/verdictVisual';
import type { WatchNowItem } from '@/lib/watchNow';

export function WatchNowGrid({ items }: { items: WatchNowItem[] }) {
  const [open, setOpen] = useState<QuickLookTarget | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {items.map((t) => {
          const v = verdictVisualForCall(t.primaryCall);
          return (
            <div key={`${t.mediaType}-${t.id}`} className="card group relative h-full overflow-hidden transition hover:border-white/20 hover:shadow-glow">
              <button
                onClick={() => setOpen({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath })}
                className="relative block aspect-[2/3] w-full overflow-hidden"
                aria-label={`Quick look at ${t.title}`}
              >
                {t.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-gradient-to-br from-ink-700 to-ink-850 p-2 text-center text-[11px] text-slate-400">{t.title}</div>
                )}
                {/* Availability chip — the JustWatch "you can watch this now" signal. */}
                <span className={`pointer-events-none absolute bottom-2 left-2 max-w-[85%] truncate rounded-md px-2 py-0.5 text-[10px] font-bold backdrop-blur ${t.kind === 'mine' ? 'bg-emerald-500/85 text-white' : 'bg-amber-500/85 text-black'}`}>
                  {t.kind === 'mine' ? `▶ ${t.where}` : `🆓 ${t.where}`}
                </span>
                <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-lg text-ink-950">▶</span>
                </span>
              </button>
              <div className="absolute right-2 top-2 z-10">
                <SaveButton tmdbId={t.id} mediaType={t.mediaType} title={t.title} year={t.year} posterPath={t.posterPath} />
              </div>
              <div className="p-3">
                <button onClick={() => setOpen({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath })} className="block w-full text-left">
                  <div className="line-clamp-2 text-sm font-semibold text-white">{t.title}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black ${v.badge}`}>{t.primaryCall}</span>
                    <span className="text-sm font-bold tabular-nums text-gold-300">{t.matchScore}</span>
                    <span className="text-[11px] text-slate-400">match</span>
                  </div>
                </button>
                <RatingsStrip ratings={t.ratings} title={t.title} year={t.year} standard className="mt-1.5" />
              </div>
            </div>
          );
        })}
      </div>
      {open && <QuickLook target={open} onClose={() => setOpen(null)} />}
    </>
  );
}
