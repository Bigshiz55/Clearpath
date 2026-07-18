'use client';

import { useState } from 'react';
import { SaveButton } from './SaveButton';
import { RatingsStrip } from './RatingsStrip';
import { CardDna } from './CardDna';
import { TasteFeedback } from './TasteFeedback';
import { QuickLook, type QuickLookTarget } from './QuickLook';
import type { WatchNowItem } from '@/lib/watchNow';

export function WatchNowGrid({ items }: { items: WatchNowItem[] }) {
  const [open, setOpen] = useState<QuickLookTarget | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const shown = items.filter((t) => !hidden.has(`${t.mediaType}-${t.id}`));

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {shown.map((t) => {
          return (
            <div key={`${t.mediaType}-${t.id}`} className="card group h-full overflow-hidden transition hover:border-white/20 hover:shadow-glow">
              {/* Top action bar — Movie/TV · DNA · ＋ · O — above the art. */}
              <div className="flex items-center justify-between gap-1 border-b border-white/10 bg-ink-900/85 px-2 py-1.5">
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                  {t.mediaType === 'movie' ? 'Movie' : 'TV'}
                </span>
                <div className="flex items-center gap-1.5">
                  <CardDna mediaType={t.mediaType} tmdbId={t.id} />
                  <SaveButton tmdbId={t.id} mediaType={t.mediaType} title={t.title} year={t.year} posterPath={t.posterPath} />
                  <TasteFeedback
                    compact
                    tmdbId={t.id}
                    mediaType={t.mediaType}
                    title={t.title}
                    year={t.year}
                    posterPath={t.posterPath}
                    onFlagged={() => setHidden((h) => new Set(h).add(`${t.mediaType}-${t.id}`))}
                  />
                </div>
              </div>
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
                <span className="pointer-events-none absolute bottom-2 left-2 max-w-[90%] truncate rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                  ▶ {t.where}
                </span>
                <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-lg text-ink-950">▶</span>
                </span>
              </button>
              <div className="p-3">
                <button onClick={() => setOpen({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath })} className="block w-full text-left">
                  <div className="line-clamp-2 text-sm font-semibold text-white">{t.title}</div>
                </button>
                <RatingsStrip ratings={t.ratings} title={t.title} year={t.year} mediaType={t.mediaType} tmdbId={t.id} standard className="mt-1.5" />
              </div>
            </div>
          );
        })}
      </div>
      {open && <QuickLook target={open} onClose={() => setOpen(null)} />}
    </>
  );
}
