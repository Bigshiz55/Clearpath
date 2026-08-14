'use client';

/**
 * THE TOP 10 RAIL.
 *
 * A horizontal run of posters with the one thing nobody else puts there: the
 * SCORE'S WORKING. Tapping the score opens the arithmetic that produced it, in
 * place — "IMDb 78 × 50% + Rotten Tomatoes 90 × 50% = 84, +5 for your taste =
 * 89", and the sources we had nothing for named underneath. If the numbers do
 * not reconcile the panel says so instead of drawing a decorative breakdown; a
 * chart that does not add up is worse than no chart.
 *
 * ── WHAT THIS PASS CHANGED, AND WHY ───────────────────────────────────────
 * The rail read as three detached objects per item: a 5.5rem grey numeral
 * sitting BEHIND the artwork, the poster shoved 28px right to clear it, and a
 * loud coloured KPI box underneath saying "98 HOW?". The number competed with
 * the poster, the score competed with the number, and none of the three looked
 * like they belonged to the same product.
 *
 *   • THE POSTER IS THE CARD. The rank is a small chip ON the artwork, in the
 *     corner, at the size a rank actually needs to be read. Nothing is offset
 *     to make room for it any more.
 *   • ONE COLOUR LANGUAGE. This file had its own `toneFor()` with its own
 *     thresholds (80/65/50, and a pink at 65) — a second verdict vocabulary
 *     that disagreed with the rest of the app. The score now routes through
 *     `scoreVerdict()` in verdictVisual.ts, the same call and the same colours
 *     as every other surface.
 *   • THE SCORE SITS ON THE ARTWORK, where the eye already is, drawn as the
 *     app's own verdict pill rather than a detached box below the title.
 *   • THE WORKING IS STILL ONE TAP AWAY, and the affordance says what it
 *     opens ("Why #1?") instead of shouting "HOW?". It appears ONLY when
 *     there is working to show — an affordance promising evidence that does
 *     not exist is worse than no affordance.
 *   • THE TRAILER PLAYS IN THE POSTER'S OWN FRAME, under the same contract as
 *     every other card: fixed 2:3 box, video replaces poster inside it,
 *     nothing below moves.
 */
import Link from 'next/link';
import { useState } from 'react';
import { showWork, workSentence, type ShowWorkInput } from '@/lib/scoring/showWork';
import { WCheck } from '@/components/WCheck';
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
          const v = scoreVerdict(item.score);
          const rank = i + 1;
          return (
            <li key={key} className="wv-rail-item" data-testid={`rail-item-${item.id}`}>
              {/* THE FIXED MEDIA FRAME. 2:3, and the only box the trailer is
                  ever allowed to occupy — see TrailerMedia. Nothing below this
                  moves when a trailer starts. */}
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-ink-800 shadow-lg shadow-black/50">
                <TrailerMedia tmdbId={item.id} mediaType={item.mediaType} title={item.title}>
                  <Link href={`/app/title/${item.mediaType}/${item.id}`} className="block h-full w-full">
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
                {/* THE RANK, ON THE ARTWORK. A chip in the corner rather than a
                    5.5rem numeral behind the poster: a rank is an index, not
                    the headline, and it needs to be legible — not enormous. */}
                <span
                  data-testid={`rail-rank-${item.id}`}
                  className="pointer-events-none absolute left-1.5 top-1.5 z-[2] rounded-md bg-black/70 px-1.5 py-0.5 text-[13px] font-black leading-none tabular-nums text-white backdrop-blur-sm ring-1 ring-white/15"
                >
                  #{rank}
                </span>
                {/* THE SCORE, IN THE APP'S OWN VERDICT LANGUAGE, on the artwork
                    where the eye already is. Gradient foot so it stays legible
                    over a bright poster. */}
                <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/85 to-transparent" />
                {/* THE NUMBER ALONE, IN THE CALL'S OWN COLOUR. A rail item is
                    176px wide and shares its bottom edge with the ▶ Trailer
                    control; "89 STREAM IT" spanned most of that width and left
                    the two controls touching. The colour IS the call here —
                    the same `visual.badge` every other surface uses — and the
                    words are on the card you land on. `title`/`sr-only` keep
                    the call itself available rather than dropping it. */}
                <span
                  data-testid={`rail-verdict-${item.id}`}
                  title={`${Math.round(item.score)} — ${v.call}`}
                  className={`pointer-events-none absolute bottom-1.5 left-1.5 z-[2] inline-flex items-center rounded-md border px-1.5 py-0.5 text-[12px] font-black leading-none tabular-nums ${v.visual.badge}`}
                >
                  {Math.round(item.score)}
                  <span className="sr-only"> — {v.call}</span>
                </span>
                <WCheck
                  tmdbId={item.id}
                  mediaType={item.mediaType}
                  title={item.title}
                  year={item.year}
                  posterUrl={item.posterUrl}
                />
              </div>

              <div className="mt-1.5">
                <div className="line-clamp-1 text-sm font-semibold text-white">{item.title}</div>
                {/* THE WORKING, ONE TAP AWAY. Restrained text, not a coloured
                    KPI box — the score already reads on the artwork above, and
                    this is the way into its arithmetic.

                    THE PROMISE IS GATED ON THE EVIDENCE; THE PANEL IS NOT.
                    "Why #1?" is only offered where working actually reconciles,
                    because an affordance that promises reasons and opens onto
                    "no data" is worse than none. But the panel stays REACHABLE
                    either way: when a title has no breakdown, saying so — "the
                    number stands on the general verdict alone" — is the honest
                    answer, and hiding it would leave the reader unable to find
                    out why this one number has no working when its neighbours
                    do. So the button always opens; only its wording claims. */}
                <button
                  type="button"
                  onClick={() => {
                    if (!isOpen) onExpand?.(item);
                    setOpen(isOpen ? null : key);
                  }}
                  aria-expanded={isOpen}
                  data-testid={`rail-score-${item.id}`}
                  className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-[13px] font-semibold text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
                >
                  <span className="tabular-nums">{Math.round(item.score)}</span>
                  <span>
                    · {isOpen ? 'Hide' : w?.reconciles ? (rank === 1 ? 'Why #1?' : 'Why?') : 'Details'}
                  </span>
                </button>
              </div>

              {isOpen && (
                <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.05] p-3" data-testid={`rail-work-${item.id}`}>
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
