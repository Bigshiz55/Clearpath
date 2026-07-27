'use client';

import { useState } from 'react';
import { SaveButton } from './SaveButton';
import { AlgorithmScore } from './AlgorithmScore';
import { CardVerdict } from './CardVerdict';
import { WCheck } from './WCheck';
import { QuickLook, type QuickLookTarget } from './QuickLook';
import type { WatchNowItem } from '@/lib/watchNow';

export function WatchNowGrid({ items }: { items: WatchNowItem[] }) {
  const [open, setOpen] = useState<QuickLookTarget | null>(null);

  // Every item stays. Flagging one used to pull it out of the grid, which
  // resequenced everything after it and left nothing to undo with — the card
  // now shows its ruling in place and can be un-ruled.
  const shown = items;

  return (
    <>
      <div className="poster-grid">
        {shown.map((t) => {
          return (
            <div key={`${t.mediaType}-${t.id}`} className="card group h-full overflow-hidden transition hover:border-white/20 hover:shadow-glow">
              {/* Top bar — Movie/TV · ＋ · O. Score lives in the pink box below. */}
              <div className="flex items-center gap-1.5 border-b border-white/10 bg-ink-900/85 px-2 py-1.5">
                <span className="flex-none rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                  {t.mediaType === 'movie' ? 'Movie' : 'TV'}
                </span>
                <div className="flex flex-1 items-center gap-1.5">
                  <SaveButton wide tmdbId={t.id} mediaType={t.mediaType} title={t.title} year={t.year} posterPath={t.posterPath} />
                  <CardVerdict
                    tmdbId={t.id}
                    mediaType={t.mediaType}
                    title={t.title}
                    year={t.year}
                    posterPath={t.posterPath}
                  />
                </div>
              </div>
              {/* The W on the artwork, same as every other card. */}
              <div className="relative aspect-[2/3] w-full overflow-hidden">
              <WCheck tmdbId={t.id} mediaType={t.mediaType} title={t.title} year={t.year} posterUrl={t.posterUrl} />
              <button
                onClick={() => setOpen({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath })}
                className="block h-full w-full"
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
              </div>
              <div className="p-3">
                <button onClick={() => setOpen({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath })} className="block w-full text-left">
                  <div className="line-clamp-2 text-sm font-semibold text-white">{t.title}</div>
                </button>
                {/* One pink box: algorithm score + will-you-like-it + the ratings. */}
                <AlgorithmScore mediaType={t.mediaType} tmdbId={t.id} title={t.title} year={t.year} objectiveScore={t.ratings.standardScore ?? null} className="mt-2" />
              </div>
            </div>
          );
        })}
      </div>
      {open && <QuickLook target={open} onClose={() => setOpen(null)} />}
    </>
  );
}
