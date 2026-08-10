'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { RatingsStrip } from './RatingsStrip';
import { SaveButton } from './SaveButton';
import { CardVerdict } from './CardVerdict';
import { PersonalizedFit } from './PersonalizedFit';
import { EMPTY_TILE_RATINGS, type TileRatings } from '@/lib/ratings';
import type { MediaType } from '@/lib/types';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';

export interface QuickLookTarget {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
}

interface QuickLookData {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  overview: string | null;
  backdropUrl: string | null;
  posterUrl: string | null;
  trailerUrl: string | null;
  genres: string[];
  contentRating: string | null;
  status: string | null;
  runtime: string | null;
  score: number;
  standardScore: number;
  ratings: TileRatings;
  where: string[];
}

/** Pull the YouTube video id out of a watch/short url so we can embed it. */
function youTubeId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{6,})/);
  return m ? m[1]! : null;
}

export function QuickLook({ target, onClose }: { target: QuickLookTarget; onClose: () => void }) {
  const [data, setData] = useState<QuickLookData | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);

  const [attempt, setAttempt] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setData(null);
    setFailed(false);
    setPlaying(false);
    fetchWithTimeout(`/api/quicklook/${target.mediaType}/${target.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => active && setData(d as QuickLookData))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [target.id, target.mediaType, attempt]);

  /**
   * ESCAPE, SCROLL RESTORATION, AND A REAL FOCUS TRAP.
   *
   * More Info is an EXPANSION of a card, not a departure from the results, so
   * the results have to be exactly as they were when it closes — same scroll
   * offset, same list, same votes. `overflow: hidden` on the body is what
   * freezes the page behind the dialog, but on its own it is also what LOSES
   * the position: the document stops being scrollable, the browser clamps
   * scrollTop toward 0, and closing drops the user at the top of a long grid
   * with no way back to the card they were looking at. So the offset is
   * captured before the lock and written back after it.
   *
   * The trap is the other half of "the background is not accidentally
   * interactive": without it, Tab walks straight out of the dialog into the
   * result cards underneath, which are inert to the mouse and reachable by
   * keyboard — the worst combination. Focus enters the panel on open, cycles
   * inside it, and returns to the element that invoked it on close.
   */
  /**
   * MOUNT-ONLY: capture the page, lock it, and put it back on close.
   *
   * This is deliberately split from the key handler below and takes NO
   * dependencies. `onClose` is a fresh closure on every render of the caller
   * (`() => setOpen(false)`), so a single effect keyed on it re-ran after the
   * body was already locked — and re-captured `scrollY` as 0, because locking
   * the body is what clamps it. Closing then "restored" the page to the top.
   * Measured as a 690px jump before this split.
   */
  useEffect(() => {
    const invoker = document.activeElement as HTMLElement | null;
    const scrollY = window.scrollY;

    /* THE LOCK THAT DOES NOT LOSE THE PAGE.
       `overflow: hidden` on the body collapses the document's scroll height,
       the browser clamps scrollTop toward 0, and the offset is simply gone —
       closing dropped the user at the top of a long grid (measured: 690px,
       then 464px once the effect churn was fixed; the technique itself was
       the remainder). Pinning the body with `position: fixed` and a negative
       `top` freezes the page WITHOUT discarding where it was, so the restore
       is arithmetic rather than a race. This is also the only variant that
       behaves on iOS Safari. */
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    panelRef.current?.focus();

    return () => {
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      /* FORCE THE REFLOW BEFORE SCROLLING. Clearing `position: fixed` does not
         give the document its height back until layout runs again, and a
         scrollTo against a still-collapsed page is clamped straight back to 0
         — which is the 464px jump this line exists to stop. Reading
         `offsetHeight` is the standard way to make that layout happen now
         rather than at the next paint. The rAF is a belt-and-braces second
         attempt for engines that defer it anyway. */
      void document.body.offsetHeight;
      window.scrollTo(0, scrollY);
      requestAnimationFrame(() => window.scrollTo(0, scrollY));
      invoker?.focus?.({ preventScroll: true });
    };
  }, []);

  /**
   * Escape closes; Tab cycles inside the panel. Keyed on `onClose` because it
   * calls it — and harmless to re-bind, unlike the capture above.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, iframe, [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const vid = youTubeId(data?.trailerUrl ?? null);
  const heroUrl = data?.backdropUrl ?? data?.posterUrl ?? null;
  const titleHref = `/app/title/${target.mediaType}/${target.id}`;

  /* PORTALLED TO `document.body`.
     More Info is rendered from inside a result card, and `.card` carries
     `backdrop-blur` — which creates a stacking context. A `z-[60]` overlay
     nested inside it cannot rise above the site header's `z-40`, so at 390px
     the close button sat UNDER the header and could not be clicked at all
     (Playwright: "header subtree intercepts pointer events"). Portalling is
     the same fix the W coach mark already uses for the same reason. */
  const dialog = (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`More information for ${target.title}`}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-testid="more-info"
        className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-white/10 bg-ink-900 shadow-card outline-none sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-lg text-white backdrop-blur transition hover:bg-black/80"
          aria-label="Close more information"
          data-testid="more-info-close"
        >
          ✕
        </button>

        {/* Hero: trailer, else backdrop with a play button */}
        <div className="relative aspect-video w-full overflow-hidden bg-ink-850">
          {playing && vid ? (
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`}
              title={`${target.title} trailer`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <>
              {heroUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={heroUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-slate-600">No image</div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/20 to-transparent" />
              {vid && (
                <button
                  onClick={() => setPlaying(true)}
                  className="absolute inset-0 grid place-items-center"
                  aria-label="Play trailer"
                >
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-white/90 text-2xl text-ink-950 shadow-glow transition hover:scale-105">
                    ▶
                  </span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Body */}
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-white">{target.title}</h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-300">
                <span className="uppercase tracking-wide">{target.mediaType === 'movie' ? 'Movie' : 'TV'}</span>
                {data?.year && <span>· {data.year}</span>}
                {data?.runtime && <span>· {data.runtime}</span>}
                {data?.contentRating && (
                  <span className="rounded border border-white/20 px-1 text-[10px]">{data.contentRating}</span>
                )}
                {data?.status && target.mediaType === 'tv' && <span>· {data.status}</span>}
              </div>
            </div>
            <div className="flex-none">
              <SaveButton tmdbId={target.id} mediaType={target.mediaType} title={target.title} year={target.year} posterPath={target.posterPath} variant="inline" />
            </div>
          </div>

          {/* Ratings */}
          <RatingsStrip ratings={data?.ratings ?? EMPTY_TILE_RATINGS} title={target.title} year={target.year} standard loading={!data && !failed} />

          {/* Genres */}
          {data && data.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.genres.map((g) => (
                <span key={g} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">{g}</span>
              ))}
            </div>
          )}

          {/* WHAT IT'S ABOUT — the objective half, labelled as such.
              It is deliberately separate from "Why you'll like it" below: one
              is a spoiler-free description of the title, the other is an
              argument about THIS viewer. Running them together is how a
              synopsis ends up rewritten in second person and claiming to be
              personalization. */}
          {data?.overview && (
            <section data-testid="mi-about">
              <h3 className="text-[11px] font-black uppercase tracking-wide text-slate-400">What it’s about</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-200">{data.overview}</p>
            </section>
          )}

          {/* WHY YOU'LL LIKE IT · WATCH OUT · FOR YOU / AGAINST YOU.
              Every claim here comes from evidence the engine already holds —
              see PersonalizedFit. When there is nothing substantiated it
              renders nothing at all rather than filling the box. */}
          <PersonalizedFit mediaType={target.mediaType} tmdbId={target.id} />
          {failed && (
            <p className="text-sm text-slate-400">
              Couldn’t load the full details.{' '}
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-semibold underline">Try again</button>
              {' '}or open the title for everything.
            </p>
          )}

          {/* Where to watch */}
          {data && data.where.length > 0 && (
            <div className="text-xs text-slate-300">
              <span className="text-slate-400">Streaming on:</span> {data.where.join(' · ')}
            </div>
          )}

          {/* THE SAME DECISION ROW AS THE CARD.
              More Info is the fast comprehension layer: everything needed to
              act is here, so nobody has to open Full Verdict just to vote.
              `.wv-act-row` is the card's own row class, so FOR/AGAINST/SAVE
              look and behave identically in both places. */}
          <div className="wv-act-row border-t border-white/10 pt-3" data-testid="more-info-actions">
            <CardVerdict
              tmdbId={target.id}
              mediaType={target.mediaType}
              title={target.title}
              year={target.year}
              posterPath={target.posterPath}
              source="more_info"
            />
            <SaveButton wide tmdbId={target.id} mediaType={target.mediaType} title={target.title} year={target.year} posterPath={target.posterPath} />
          </div>

          {/* Trailer is an EXPLICIT action, never something a click into More
              Info starts on its own. */}
          <div className="flex flex-wrap gap-2 pt-1">
            {vid && !playing && (
              <button
                onClick={() => setPlaying(true)}
                className="btn-secondary flex-1 sm:flex-none"
                data-testid="more-info-trailer"
                aria-label={`Play trailer for ${target.title}`}
              >
                ▶ Play trailer
              </button>
            )}
            <Link
              href={titleHref}
              className="btn-primary flex-1 sm:flex-none"
              data-testid="more-info-full-verdict"
            >
              ⚖️ See full verdict
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
