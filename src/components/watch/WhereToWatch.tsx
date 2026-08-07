'use client';

import { useEffect, useState } from 'react';
import { AvailabilityPanel } from './AvailabilityPanel';
import { loadTileFacts } from '@/lib/tileFacts';
import type { MediaType } from '@/lib/types';
import {
  resolveWatchPresentation,
  optionsFromCardAvailability,
  type WatchOption,
  type WatchPresentation,
} from '@/lib/availability/watchPresentation';
import { optionsFromTileProviders, mergeProviderOptions } from '@/lib/availability/providerOptions';
import { ProviderLogos } from './ProviderLogos';

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
/**
 * CAN A LIVE CHECK ACTUALLY RUN? Asked ONCE per page, not once per card — a
 * grid of twenty cards must not fire twenty identical probes. The answer
 * decides which honest label the button carries: "Check availability" only
 * when a check is genuinely possible, "Notify me when confirmed" when it is
 * not. A button must never offer something the server cannot do.
 */
let capabilityProbe: Promise<boolean> | null = null;
function canRefresh(): Promise<boolean> {
  capabilityProbe ??= fetch('/api/availability/refresh')
    .then((r) => (r.ok ? r.json() : { available: false }))
    .then((j: { available?: boolean }) => Boolean(j.available))
    .catch(() => false);
  return capabilityProbe;
}

/**
 * THE SPACE THIS BLOCK OCCUPIES BEFORE IT KNOWS ANYTHING.
 *
 * One constant, used by BOTH the loading placeholder and the resolved
 * section, so the card is the same height before and after the availability
 * answer lands. It covers the measured height of the ordinary answer —
 * heading (15px) + one line box (~28px) + the action + gaps. The action is
 * 44px, not the 36 it used to be: "Notify me when confirmed" was the last
 * sub-44px tap target in the grid, flagged at every one of the twelve
 * viewports the visual-QA suite walks.
 */
const RESERVE = 'min-h-[5.5rem]';

export function WhereToWatch({
  mediaType,
  tmdbId,
  title = '',
  year = null,
  posterPath = null,
  extraOptions = [],
  originalNetwork = null,
  showCta = true,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  /** Shown in the availability panel's heading. */
  title?: string;
  year?: number | null;
  posterPath?: string | null;
  /** Verified options this surface already holds — e.g. a live airing. */
  extraOptions?: WatchOption[];
  /** Historical metadata. Rendered as history, never as availability. */
  originalNetwork?: string | null;
  showCta?: boolean;
  className?: string;
}) {
  const [presentation, setPresentation] = useState<WatchPresentation | null>(null);
  const [refreshable, setRefreshable] = useState<boolean | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void canRefresh().then((v) => active && setRefreshable(v));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadTileFacts(mediaType, tmdbId).then((f) => {
      if (!active) return;
      // TWO SOURCES, ONE ANSWER. Watchmode's cache wins where it exists (deep
      // links, exact source type); TMDB's providers — already on this same
      // response — answer when it does not. Without the fallback a card said
      // "Not yet confirmed" for a title whose own full page listed four
      // platforms, because the Watchmode enrichment queue had never reached
      // it. See src/lib/availability/providerOptions.ts.
      const { options, checked } = mergeProviderOptions(
        optionsFromCardAvailability(f.availability),
        optionsFromTileProviders(f.providers),
      );
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
  //
  // BUT SAYING NOTHING STILL HAS TO TAKE UP THE ROOM. The placeholder was
  // `h-4` — 16px — against a resolved block of ~79px, so every card in the
  // grid grew 62px a few hundred milliseconds after paint and the row below
  // dropped out from under a thumb already reaching for a button. Both
  // branches now start from the same floor (see RESERVE), which is the
  // heading + one availability line + the 36px action: the shape of the
  // ordinary answer. A genuinely richer answer may still add a line — that is
  // content arriving, not a hole being filled — but the common path no longer
  // moves at all. Measured on /dev/visual-qa at 320/390/1024/1366.
  if (!presentation) {
    return <div className={`${RESERVE} ${className}`} aria-hidden data-testid="where-to-watch-loading" />;
  }

  const { status, lines, cta, note, historical, ariaLabel } = presentation;

  return (
    <section
      className={`${RESERVE} space-y-1 ${className}`}
      aria-label={ariaLabel}
      data-testid="where-to-watch"
      data-status={status}
      data-cta={cta.kind}
    >
      <h4 className="text-[11px] font-black uppercase tracking-wide text-slate-300">Where to watch</h4>

      {/* LIVE AIRINGS stay full-width rows: the channel, station and time are
          the whole point and must not be reduced to an icon. */}
      {lines
        .filter((l) => l.kind === 'live')
        .map((l, i) => (
          <div
            key={`live|${l.text}|${i}`}
            data-testid="where-to-watch-line"
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1"
          >
            <span className={`text-[12px] font-semibold ${l.liveNow ? 'text-emerald-200' : 'text-slate-100'}`}>
              {l.liveNow && (
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" aria-hidden />
              )}
              {l.text}
            </span>
            {l.detail && <span className="block text-[11px] text-slate-400">{l.detail}</span>}
          </div>
        ))}

      {/* STREAMING OPTIONS: the compact, wrapped row of network LOGOS (the one
          reusable ProviderLogos strip every card uses) — brand-deduped, at most
          two rows, with a "+N" overflow the View-options CTA expands. Replaces
          the old tall stack of full-width "Included with …" sentences. */}
      <ProviderLogos lines={lines} />


      {/* SHORT, NOT A SENTENCE. "We haven't confirmed where this is currently
          available." is accurate but it is a paragraph on a card, repeated
          twenty times down a grid. The label says the same thing in two words
          and the full sentence stays as the accessible description. */}
      {note && (
        <p className="text-[12px] font-semibold text-slate-400" data-testid="where-to-watch-note" title={note}>
          {status === 'unknown' ? 'Not yet confirmed' : 'None found'}
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

      {/* THE PRIMARY ACTION. Three shapes, and none of them is a button with
          nowhere to go:
            - a real verified link  -> an anchor that opens it,
            - an unknown state      -> a button that opens the panel and runs
                                       a live check, or offers the notify path
                                       when no check is possible,
            - anything else         -> plain text, not styled as pressable. */}
      {showCta && (
        cta.href ? (
          <a
            href={cta.href}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="where-to-watch-cta"
            className="mt-0.5 inline-flex min-h-[44px] items-center rounded-lg border border-brand-400/50 bg-brand-500/15 px-3 text-[12px] font-bold text-brand-100 transition hover:bg-brand-500/25"
          >
            {cta.label}
          </a>
        ) : status !== 'available' ? (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            data-testid="where-to-watch-cta"
            data-refreshable={refreshable === null ? 'unknown' : String(refreshable)}
            className="mt-0.5 inline-flex min-h-[44px] items-center rounded-lg border border-brand-400/50 bg-brand-500/15 px-3 text-[12px] font-bold text-brand-100 transition hover:bg-brand-500/25"
          >
            {refreshable === false ? 'Notify me when confirmed' : cta.label}
          </button>
        ) : (
          // Verified options exist but none carries a link (several services,
          // no deep link). Rendered as a label, because there is nothing to
          // press — the rows above are the answer.
          <span data-testid="where-to-watch-cta" className="mt-0.5 inline-flex min-h-[44px] items-center text-[12px] font-bold text-slate-300">
            {cta.label}
          </span>
        )
      )}

      {panelOpen && (
        <AvailabilityPanel
          mediaType={mediaType}
          tmdbId={tmdbId}
          title={title}
          year={year}
          posterPath={posterPath}
          originalNetwork={originalNetwork}
          onClose={() => setPanelOpen(false)}
          onResolved={(p) => setPresentation(p)}
        />
      )}
    </section>
  );
}

