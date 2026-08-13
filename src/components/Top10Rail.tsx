'use client';

/**
 * THE TOP PICKS RAIL.
 *
 * ── WHAT THIS REPLACED ────────────────────────────────────────────────────
 * A 5.5rem grey numeral set BEHIND each poster (which is why every item carried
 * a 1.75rem left margin to clear it), and under each title a detached green
 * "89 HOW?" rectangle. On the app's most opinionated surface the two loudest
 * things were a grey digit and a green box — neither of which is the film. It
 * read as an internal ranking dashboard, and the green collided with FOR, with
 * "why it fits", and with a live airing, so green had stopped meaning anything.
 *
 * ── WHAT IT IS NOW ────────────────────────────────────────────────────────
 * The artwork is the item. Rank is a small badge integrated into the frame's
 * corner. The score speaks the app's own language — the Verd1ct TV badge and
 * its verdict word — rather than a generic coloured rectangle. The explanation
 * is a quiet "Why #1?" control, not a shout of HOW? on every tile.
 *
 * ── WHAT DID NOT CHANGE ───────────────────────────────────────────────────
 * The claim that makes this rail different from every other Top 10: tapping the
 * explanation opens the ARITHMETIC that produced the number, and REFUSES to
 * draw a breakdown that does not reconcile. A chart that does not add up is
 * worse than no chart, because it looks like proof.
 *
 * ── THE GEOMETRY CONTRACT ─────────────────────────────────────────────────
 * The rail never grows. The evidence panel opens BELOW the rail, in one shared
 * slot, so the ten posters stay exactly where they were and the next five
 * titles do not move. Preview obeys the same contract as the browse card: the
 * trailer plays inside the poster frame (`.wv-rail-frame`, fixed 2:3 with
 * `contain: layout`), rank and title stay visible, and nothing shifts.
 */
import Link from 'next/link';
import { useState } from 'react';
import { showWork, workSentence, type ShowWorkInput } from '@/lib/scoring/showWork';
import { WCheck } from '@/components/WCheck';
import { Verd1ctBadge } from '@/components/Verd1ctBadge';
import { TrailerMedia } from '@/components/trailer/TrailerMedia';
import { scoreVerdict } from '@/lib/verdictVisual';

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

  const shown = items.slice(0, 10);
  const openItem = shown.find((it) => `${it.mediaType}:${it.id}` === open) ?? null;
  const openRank = openItem ? shown.indexOf(openItem) + 1 : 0;
  const w = openItem?.work ? showWork(openItem.work) : null;

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
        {shown.map((item, i) => {
          const key = `${item.mediaType}:${item.id}`;
          const isOpen = open === key;
          const v = scoreVerdict(item.score);
          return (
            <li key={key} className="wv-rail-item" data-testid={`rail-item-${item.id}`}>
              {/* THE FRAME. Fixed 2:3, `contain: layout`, `overflow: hidden` —
                  the same three properties that make the browse card's media
                  box unable to change its parent's size. A trailer starting in
                  here cannot move the rail or the nine titles beside it. */}
              <div className="wv-rail-frame">
                <span className="wv-rank-chip" data-testid={`rail-rank-${item.id}`} data-top={i < 3 ? '1' : '0'}>
                  #{i + 1}
                </span>
                <WCheck
                  tmdbId={item.id}
                  mediaType={item.mediaType}
                  title={item.title}
                  year={item.year}
                  posterUrl={item.posterUrl}
                />
                <TrailerMedia tmdbId={item.id} mediaType={item.mediaType} title={item.title}>
                  <Link href={`/app/title/${item.mediaType}/${item.id}`} className="relative block h-full w-full">
                    {item.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.posterUrl} alt={`Poster for ${item.title}`} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center p-2 text-center text-xs text-slate-400">
                        {item.title}
                      </span>
                    )}
                  </Link>
                </TrailerMedia>
              </div>

              {/* Reserved, so ten items share one baseline whatever their
                  titles do. */}
              <div className="wv-rail-meta mt-2">
                <div className="line-clamp-1 text-[13px] font-semibold text-white">{item.title}</div>
                {/* THE SCORE IN THE APP'S OWN LANGUAGE — the Verd1ct TV badge
                    and the call it produces, not a green rectangle. The badge
                    already carries the number; printing it again beside itself
                    is what made the old chip feel like a readout. */}
                <div className="mt-1 flex items-center gap-1.5">
                  <Verd1ctBadge score={Math.round(item.score)} px={22} />
                  <span className={`truncate rounded-md px-1.5 py-0.5 text-[10px] font-black tracking-tight ${v.visual.badge}`}>
                    {v.call}
                  </span>
                </div>
                {/* "Why #1?" — a quiet control, not a label on every score. */}
                <button
                  type="button"
                  onClick={() => {
                    if (!isOpen) onExpand?.(item);
                    setOpen(isOpen ? null : key);
                  }}
                  aria-expanded={isOpen}
                  aria-controls="rail-evidence"
                  data-testid={`rail-score-${item.id}`}
                  className="mt-1 inline-flex min-h-[36px] items-center text-[11px] font-bold uppercase tracking-wide text-slate-400 underline decoration-slate-600 underline-offset-4 transition hover:text-white"
                >
                  {isOpen ? 'Hide' : `Why #${i + 1}?`}
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {/* ── THE EVIDENCE, BELOW THE RAIL ────────────────────────────────────
          One shared slot, full width. Opening it cannot move a poster, cannot
          change the rail's height, and cannot push the next five titles — which
          is exactly what the old in-item panel did (measured: the rail grew
          230px). It is not a dialog: it is disclosure in place, so nothing is
          trapped and nothing has to be dismissed before browsing continues. */}
      {openItem && (
        <div
          id="rail-evidence"
          data-testid={`rail-work-${openItem.id}`}
          className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 sm:p-4"
        >
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-black text-white">
              Why #{openRank} — {openItem.title}
            </h3>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="min-h-[36px] text-[11px] font-bold uppercase tracking-wide text-slate-400 transition hover:text-white"
            >
              Close
            </button>
          </div>
          {w?.reconciles ? (
            <>
              <ul className="space-y-1">
                {w.rows.map((r) => (
                  <li key={r.key} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate text-slate-300">
                      {r.label} <span className="tabular-nums text-white">{Math.round(r.value)}</span>
                      <span className="text-slate-500"> × {Math.round(r.weight * 100)}%</span>
                    </span>
                    <span className="flex-none tabular-nums font-bold text-white">{r.points.toFixed(1)}</span>
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
                <p className="mt-2 text-[11px] text-slate-500" data-testid={`rail-missing-${openItem.id}`}>
                  No {w.missing.join(' or ')} for this one — the blend is over what we do have.
                </p>
              )}
              <p className="sr-only">{workSentence(w)}</p>
            </>
          ) : (
            <p className="text-xs text-slate-400" data-testid={`rail-nowork-${openItem.id}`}>
              Not enough source data to show the working on this one. The number stands on the general verdict alone.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
