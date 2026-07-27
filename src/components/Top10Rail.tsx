'use client';

/**
 * THE TOP 10 RAIL.
 *
 * The shape everyone knows — a horizontal run of posters with a huge rank
 * numeral — with the one thing nobody else puts there: the SCORE'S WORKING.
 *
 * Tapping the score opens the arithmetic that produced it, in place. Not a
 * chart, not a confidence blob: "IMDb 78 × 50% + Rotten Tomatoes 90 × 50% = 84,
 * +5 for your taste = 89", and the sources we had nothing for named underneath.
 * If the numbers do not reconcile the panel says so instead of drawing a
 * decorative breakdown — a chart that does not add up is worse than no chart.
 *
 * Visually it follows the reference rather than the current card: no border, no
 * action row, no verdict panel. The poster IS the card. Everything else is one
 * tap away, which is what makes a rail scannable instead of a wall.
 */
import Link from 'next/link';
import { useState } from 'react';
import { showWork, workSentence, type ShowWorkInput } from '@/lib/scoring/showWork';
import { WCheck } from '@/components/WCheck';

export interface RailItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  /** The number on the badge. */
  score: number;
  /** The arithmetic behind it. Absent when the engine could not supply one. */
  work?: ShowWorkInput | undefined;
}

function toneFor(score: number): string {
  if (score >= 80) return 'border-emerald-300/60 bg-emerald-500/25 text-emerald-50';
  if (score >= 65) return 'border-[#ff1493]/60 bg-[#ff1493]/25 text-pink-50';
  if (score >= 50) return 'border-amber-300/50 bg-amber-500/20 text-amber-50';
  return 'border-white/20 bg-white/10 text-slate-200';
}

export function Top10Rail({
  title,
  items,
  eyebrow,
  onExpand,
}: {
  title: string;
  items: RailItem[];
  eyebrow?: string;
  /** Fires the first time a score is opened — lets a caller fetch the working
   *  on demand rather than pulling ten breakdowns nobody asked to see. */
  onExpand?: (item: RailItem) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  if (items.length === 0) return null;

  return (
    <section data-testid="top10-rail">
      <header className="mb-2 flex items-baseline gap-2">
        <h2 className="text-xl font-black tracking-tight text-white sm:text-2xl">{title}</h2>
        {eyebrow && <span className="text-xs font-semibold text-slate-500">{eyebrow}</span>}
      </header>

      {/* Horizontal, snapping, and it keeps its own scrollbar rather than
          stretching the page — a rail that widens the document is how a phone
          ends up scrolling sideways. */}
      <ol className="wv-rail" data-testid="top10-items">
        {items.slice(0, 10).map((item, i) => {
          const key = `${item.mediaType}:${item.id}`;
          const w = item.work ? showWork(item.work) : null;
          const sentence = w ? workSentence(w) : null;
          const isOpen = open === key;
          return (
            <li key={key} className="wv-rail-item" data-testid={`rail-item-${item.id}`}>
              <div className="relative">
                {/* The rank numeral, set behind the artwork the way the shape
                    is normally drawn — big enough to scan at arm's length. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -bottom-2 -left-3 z-0 text-[5.5rem] font-black leading-none text-white/25 [text-shadow:0_2px_16px_rgba(0,0,0,0.8)]"
                >
                  {i + 1}
                </span>
                <div className="relative z-[1] ml-7 overflow-hidden rounded-xl bg-ink-800 shadow-lg shadow-black/50">
                  <Link href={`/app/title/${item.mediaType}/${item.id}`} className="block aspect-[2/3]">
                    {item.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.posterUrl} alt={`Poster for ${item.title}`} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center p-2 text-center text-xs text-slate-400">
                        {item.title}
                      </span>
                    )}
                  </Link>
                  <WCheck
                    tmdbId={item.id}
                    mediaType={item.mediaType}
                    title={item.title}
                    year={item.year}
                    posterUrl={item.posterUrl}
                  />
                </div>
              </div>

              <div className="ml-7 mt-1.5">
                <div className="line-clamp-1 text-sm font-semibold text-white">{item.title}</div>
                <button
                  type="button"
                  onClick={() => {
                    if (!isOpen) onExpand?.(item);
                    setOpen(isOpen ? null : key);
                  }}
                  aria-expanded={isOpen}
                  data-testid={`rail-score-${item.id}`}
                  className={[
                    'mt-1 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 text-sm font-black tabular-nums transition',
                    toneFor(item.score),
                  ].join(' ')}
                >
                  {Math.round(item.score)}
                  <span aria-hidden className="text-[10px] font-bold opacity-70">
                    {isOpen ? 'HIDE' : 'HOW?'}
                  </span>
                </button>
              </div>

              {isOpen && (
                <div className="ml-7 mt-2 rounded-xl border border-white/10 bg-white/[0.05] p-3" data-testid={`rail-work-${item.id}`}>
                  {w?.reconciles ? (
                    <>
                      <ul className="space-y-1">
                        {w.rows.map((r) => (
                          <li key={r.key} className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="truncate text-slate-300">
                              {r.label} <span className="tabular-nums text-white">{Math.round(r.value)}</span>
                              <span className="text-slate-500"> × {Math.round(r.weight * 100)}%</span>
                            </span>
                            <span className="flex-none tabular-nums font-bold text-white">
                              {r.points.toFixed(1)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-white/10 pt-2 text-xs">
                        <span className="font-semibold text-slate-300">Blend</span>
                        <span className="tabular-nums font-black text-white">{w.subtotal.toFixed(1)}</span>
                      </div>
                      {w.personalDelta !== 0 && (
                        <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
                          <span className="font-semibold text-[#ff1493]">Your taste</span>
                          <span className="tabular-nums font-black text-[#ff1493]">
                            {w.personalDelta > 0 ? '+' : '−'}
                            {Math.abs(w.personalDelta).toFixed(1)}
                          </span>
                        </div>
                      )}
                      <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-white/10 pt-2 text-sm">
                        <span className="font-bold text-white">Verd1ct</span>
                        <span className="tabular-nums font-black text-white">{Math.round(w.total)}</span>
                      </div>
                      {w.missing.length > 0 && (
                        <p className="mt-2 text-[11px] text-slate-500" data-testid={`rail-missing-${item.id}`}>
                          No {w.missing.join(' or ')} for this one — the blend is over what we do have.
                        </p>
                      )}
                      <p className="sr-only">{sentence}</p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-400" data-testid={`rail-nowork-${item.id}`}>
                      Not enough source data to show the working on this one. The number stands on the
                      general verdict alone.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
