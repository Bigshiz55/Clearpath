'use client';

import { useEffect, useState } from 'react';
import { loadTileFacts } from '@/lib/tileFacts';
import type { MediaType } from '@/lib/types';
import {
  resolveWatchPresentation,
  optionsFromCardAvailability,
  type WatchOption,
  type WatchPresentation,
} from '@/lib/availability/watchPresentation';

/**
 * THE ONE WHERE-TO-WATCH BLOCK. Every card on every surface renders this.
 *
 * It answers a question of FACT — where can this be watched — and is placed
 * directly beneath the block that answers a question of TASTE. Keeping them
 * adjacent but visually distinct is the point: the card used to show
 * "82 · STREAM IT" with "Availability not currently confirmed" underneath,
 * which reads as an instruction contradicted by its own footnote.
 *
 * All wording and every call-to-action come from
 * `resolveWatchPresentation` — this component chooses no labels of its own, so
 * there is nowhere for per-page provider logic to grow back. The only thing
 * decided here is layout.
 *
 * `extraOptions` is how a surface that has its OWN verified facts (On TV knows
 * about tonight's airing; a Pack knows its channel) adds them without
 * inventing a second availability system. They are merged and ranked by the
 * same resolver as everything else.
 */
export function WhereToWatch({
  mediaType,
  tmdbId,
  extraOptions = [],
  originalNetwork = null,
  showCta = true,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  /** Verified options this surface already holds — e.g. a live airing. */
  extraOptions?: WatchOption[];
  /** Historical metadata. Rendered as history, never as availability. */
  originalNetwork?: string | null;
  showCta?: boolean;
  className?: string;
}) {
  const [presentation, setPresentation] = useState<WatchPresentation | null>(null);

  useEffect(() => {
    let active = true;
    loadTileFacts(mediaType, tmdbId).then((f) => {
      if (!active) return;
      const { options, checked } = optionsFromCardAvailability(f.availability);
      setPresentation(
        resolveWatchPresentation({
          options: [...options, ...extraOptions],
          // A surface-supplied airing is itself evidence that we looked.
          checked: checked || extraOptions.length > 0,
          originalNetwork,
        }),
      );
    });
    return () => {
      active = false;
    };
    // extraOptions is a fresh array each render at most call sites, so it is
    // keyed by content rather than identity — otherwise every parent re-render
    // would re-resolve and, on surfaces that pass an airing, flicker the row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaType, tmdbId, originalNetwork, JSON.stringify(extraOptions)]);

  // Until the fetch lands we know nothing, and saying nothing is the only
  // honest option — an optimistic "Watch now" that later becomes "Check
  // availability" is exactly the false claim this component exists to remove.
  if (!presentation) {
    return <div className={`h-4 ${className}`} aria-hidden data-testid="where-to-watch-loading" />;
  }

  const { status, lines, cta, note, historical, ariaLabel } = presentation;

  return (
    <section
      className={`space-y-1 ${className}`}
      aria-label={ariaLabel}
      data-testid="where-to-watch"
      data-status={status}
      data-cta={cta.kind}
    >
      <h4 className="text-[10px] font-black uppercase tracking-wide text-slate-500">Where to watch</h4>

      {lines.map((l, i) => {
        const body = (
          <>
            <span className={`text-[12px] font-semibold ${l.liveNow ? 'text-emerald-200' : 'text-slate-100'}`}>
              {l.liveNow && (
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" aria-hidden />
              )}
              {l.text}
            </span>
            {l.detail && <span className="block text-[11px] text-slate-400">{l.detail}</span>}
            {l.verified && <span className="block text-[10px] text-amber-200/70">{l.verified}</span>}
          </>
        );
        return l.href ? (
          <a
            key={`${l.text}|${i}`}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="where-to-watch-line"
            className="block rounded-md border border-white/10 bg-white/5 px-2 py-1 transition hover:border-brand-400/60 hover:bg-brand-500/15"
          >
            {body}
          </a>
        ) : (
          <div
            key={`${l.text}|${i}`}
            data-testid="where-to-watch-line"
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1"
          >
            {body}
          </div>
        );
      })}

      {note && (
        <p className="text-[11px] text-slate-500" data-testid="where-to-watch-note">
          {note}
        </p>
      )}

      {/* HISTORY, LABELLED AS HISTORY. "Originally aired on CBS" is a fact
          about the past and is useful context, but it is not a place anyone
          can watch anything tonight — so it sits outside the list of watch
          options and never carries a link or an action. */}
      {historical && (
        <p className="text-[10px] text-slate-500" data-testid="where-to-watch-historical">
          {historical} <span className="text-slate-600">· historical, not current availability</span>
        </p>
      )}

      {showCta && (
        cta.href ? (
          <a
            href={cta.href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="where-to-watch-cta"
            className="mt-0.5 inline-flex min-h-[36px] items-center rounded-lg border border-brand-400/50 bg-brand-500/15 px-3 text-[12px] font-bold text-brand-100 transition hover:bg-brand-500/25"
          >
            {cta.label}
          </a>
        ) : (
          // No verified link means no link. The label still tells the user what
          // the next real step is, but the card does not fabricate a
          // destination to make the button feel complete.
          <span
            data-testid="where-to-watch-cta"
            className="mt-0.5 inline-flex min-h-[36px] items-center rounded-lg border border-white/15 px-3 text-[12px] font-bold text-slate-300"
          >
            {cta.label}
          </span>
        )
      )}
    </section>
  );
}
