'use client';

import { useState } from 'react';
import { SaveButton } from './SaveButton';
import { AlgorithmScore } from './AlgorithmScore';
import { TasteFeedback } from './TasteFeedback';
import { QuickLook, type QuickLookTarget } from './QuickLook';
import type { WatchNowItem } from '@/lib/watchNow';
import { useT } from '@/i18n/I18nProvider';

export function WatchNowGrid({ items }: { items: WatchNowItem[] }) {
  const t = useT();
  const [open, setOpen] = useState<QuickLookTarget | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const shown = items.filter((item) => !hidden.has(`${item.mediaType}-${item.id}`));

  return (
    <>
      <div className="poster-grid">
        {shown.map((item) => {
          return (
            <div key={`${item.mediaType}-${item.id}`} className="card group h-full overflow-hidden transition hover:border-white/20 hover:shadow-glow">
              {/* Top bar — Movie/TV · ＋ · O. Score lives in the pink box below. */}
              <div className="flex items-center gap-1.5 border-b border-white/10 bg-ink-900/85 px-2 py-1.5">
                <span className="flex-none rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
                  {item.mediaType === 'movie' ? t('card.movie') : t('card.tv')}
                </span>
                <div className="flex flex-1 items-center gap-1.5">
                  <SaveButton wide tmdbId={item.id} mediaType={item.mediaType} title={item.title} year={item.year} posterPath={item.posterPath} />
                  <TasteFeedback
                    compact
                    wide
                    tmdbId={item.id}
                    mediaType={item.mediaType}
                    title={item.title}
                    year={item.year}
                    posterPath={item.posterPath}
                    onFlagged={() => setHidden((h) => new Set(h).add(`${item.mediaType}-${item.id}`))}
                  />
                </div>
              </div>
              <button
                onClick={() => setOpen({ id: item.id, mediaType: item.mediaType, title: item.title, year: item.year, posterPath: item.posterPath })}
                className="relative block aspect-[2/3] w-full overflow-hidden"
                aria-label={t('card.quickLook', { title: item.title })}
              >
                {item.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-gradient-to-br from-ink-700 to-ink-850 p-2 text-center text-[11px] text-slate-400">{item.title}</div>
                )}
                {/* Availability chip — the JustWatch "you can watch this now" signal. */}
                <span className="pointer-events-none absolute bottom-2 left-2 max-w-[90%] truncate rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                  ▶ {item.where}
                </span>
                <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-lg text-ink-950">▶</span>
                </span>
              </button>
              <div className="p-3">
                <button onClick={() => setOpen({ id: item.id, mediaType: item.mediaType, title: item.title, year: item.year, posterPath: item.posterPath })} className="block w-full text-left">
                  <div className="line-clamp-2 text-sm font-semibold text-white">{item.title}</div>
                </button>
                {/* One pink box: algorithm score + will-you-like-it + the ratings. */}
                <AlgorithmScore mediaType={item.mediaType} tmdbId={item.id} title={item.title} year={item.year} objectiveScore={item.ratings.standardScore ?? null} className="mt-2" />
              </div>
            </div>
          );
        })}
      </div>
      {open && <QuickLook target={open} onClose={() => setOpen(null)} />}
    </>
  );
}
