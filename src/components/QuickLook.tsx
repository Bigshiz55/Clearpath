'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { CardRatings } from './CardRatings';
import { SaveButton } from './SaveButton';
import { CardVerdict } from './CardVerdict';
import { WhyThisTitle } from './watch/WhyThisTitle';
import { CardFit } from './CardFit';
import { WhereToWatch } from './watch/WhereToWatch';
import type { TileRatings } from '@/lib/ratings';
import type { MediaType } from '@/lib/types';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import { releaseAllTrailers } from './trailer/activeTrailer';

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

/**
 * ── MORE INFO OWNS THE BIG EXPERIENCE ─────────────────────────────────────
 *
 * The browse card is a bounded summary: poster, title, metadata, score, ONE
 * reason, availability, actions. This is where the rest of it went, and it is
 * the one place in the browse flow that is allowed to expand — a large
 * cinematic modal on desktop, an intentional full-height sheet on a phone.
 *
 * What lives here rather than on the card:
 *   • the extended synopsis, in full
 *   • every "why it fits" reason, not just the strongest
 *   • the Taste DNA sentence
 *   • the source ratings behind the score (RT · audience · IMDb · Metacritic)
 *   • the complete availability block, with its live re-check and panel
 *   • genres, runtime, certificate, status
 *   • a large trailer region — 16:9, the width of the modal
 *
 * ACCESSIBILITY IS THE POINT OF A MODAL, not decoration on one:
 *   • focus moves into the dialog and is TRAPPED there while it is open
 *   • Escape closes it
 *   • focus is RESTORED to the control that opened it
 *   • the page behind it does not scroll
 *   • opening it stops any card trailer — the single-active rule spans the
 *     whole app, and a card previewing behind a modal playing its own trailer
 *     is two videos at once
 */
export function QuickLook({ target, onClose }: { target: QuickLookTarget; onClose: () => void }) {
  const [data, setData] = useState<QuickLookData | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // ── RENDERED INTO document.body, NOT WHERE IT WAS CALLED ──────────────────
  // The card's More Info control lives ON the media frame, and that frame
  // carries `contain: layout` so a trailer inside it can never resize the card.
  // Containment ALSO makes the element a containing block for `position: fixed`
  // descendants — so this "full-screen" overlay was being laid out inside a
  // 294px poster box (measured: the modal's video region came out 244px wide,
  // narrower than the card's own). A portal is the fix and the right default
  // for any modal: it cannot be trapped by an ancestor's containment,
  // overflow or transform, wherever a future caller mounts it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // Captured on mount, before focus moves — this is what focus goes back to.
  const openerRef = useRef<HTMLElement | null>(null);

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

  // ONE TRAILER AT A TIME, ACROSS THE WHOLE APP. A card mid-preview behind this
  // modal would keep playing under a modal that has its own video.
  useEffect(() => {
    releaseAllTrailers();
  }, []);

  // Escape · scroll lock · focus trap · focus restore. All four together,
  // because three of them without the fourth is a dialog you can tab out of
  // and never find your way back into.
  //
  // GATED ON `mounted`. The portal only exists from the second render, so on
  // the first pass `closeRef` is still null — focus was never moved into the
  // dialog at all, and one Tab walked straight back out into the page behind
  // it. A focus trap that runs before its own DOM exists is not a trap.
  useEffect(() => {
    if (!mounted) return;
    openerRef.current = (document.activeElement as HTMLElement) ?? null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the close button rather than the panel: a keyboard user's first
    // Tab then lands on the first real control, and Escape is already covered.
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const focusable = [...root.querySelectorAll<HTMLElement>(
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

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      // Restore focus to whatever opened this, if it is still in the document.
      const opener = openerRef.current;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [onClose, mounted]);

  const stopBubble = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  const vid = youTubeId(data?.trailerUrl ?? null);
  const heroUrl = data?.backdropUrl ?? data?.posterUrl ?? null;
  const titleHref = `/app/title/${target.mediaType}/${target.id}`;
  const headingId = `quicklook-title-${target.mediaType}-${target.id}`;

  const overlay = (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      data-testid="quicklook"
    >
      <div
        ref={panelRef}
        /* DESKTOP: a large cinematic panel — wider than the old max-w-2xl so the
           trailer region is genuinely bigger than the card's, which is the whole
           reason to open it. PHONE: a full-height sheet off the bottom edge, not
           a shrunken desktop dialog. */
        className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-ink-900 shadow-card sm:max-h-[88dvh] sm:rounded-2xl"
        onClick={stopBubble}
      >
        <button
          ref={closeRef}
          onClick={onClose}
          className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/70 text-lg text-white backdrop-blur transition hover:bg-black/90"
          aria-label="Close"
          data-testid="quicklook-close"
        >
          ✕
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* THE BIG VIDEO REGION. 16:9 at the full width of the modal — this is
              the trailer experience the card deliberately does not try to be.
              CAPPED at 42dvh: at max-w-4xl a true 16:9 is 504px tall, which
              filled the modal and pushed the analysis — the other reason to
              open this — entirely below the fold. Big is the point; taking the
              whole surface is not. */}
          <div
            className="relative aspect-video max-h-[42dvh] w-full overflow-hidden bg-ink-850"
            data-testid="quicklook-media"
          >
            {playing && vid ? (
              <iframe
                className="h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0&playsinline=1`}
                title={`${target.title} trailer`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                data-testid="quicklook-trailer"
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
                    aria-label={`Play ${target.title} trailer`}
                    data-testid="quicklook-play"
                  >
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-white/90 text-2xl text-ink-950 shadow-glow transition hover:scale-105">
                      ▶
                    </span>
                  </button>
                )}
              </>
            )}
          </div>

          <div className="space-y-4 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id={headingId} className="text-xl font-bold text-white sm:text-2xl">{target.title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-300">
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

            {/* THE SOURCE RATINGS behind the score — the working the card no
                longer spends a row on. `CardRatings` rather than a raw strip
                fed from this modal's own payload: it reads the SAME cached
                per-title response the card's score already used, so the modal
                cannot disagree with the card that opened it, and the numbers
                are there on the first frame instead of after a second fetch. */}
            <CardRatings mediaType={target.mediaType} tmdbId={target.id} title={target.title} year={target.year} />

            {/* EVERY reason, not just the strongest — the card shows one, this
                shows the ranked set with its "Why?" expansion intact. */}
            <WhyThisTitle mediaType={target.mediaType} tmdbId={target.id} />

            {/* The Taste DNA sentence, when the rated history genuinely
                supports one. Silent otherwise — never boilerplate. */}
            <CardFit clamp={false} mediaType={target.mediaType} tmdbId={target.id} />

            {data && data.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5" data-testid="quicklook-genres">
                {data.genres.map((g) => (
                  <span key={g} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-slate-300">{g}</span>
                ))}
              </div>
            )}

            {/* THE EXTENDED SYNOPSIS, unclamped. The card carries none of it. */}
            {data?.overview && (
              <p className="text-sm leading-relaxed text-slate-200" data-testid="quicklook-synopsis">{data.overview}</p>
            )}
            {failed && (
              <p className="text-sm text-slate-400">
                Couldn’t load the full details.{' '}
                <button type="button" onClick={() => setAttempt((n) => n + 1)} className="font-semibold underline">Try again</button>
                {' '}or open the title for everything.
              </p>
            )}

            {/* THE COMPLETE AVAILABILITY BLOCK — every line, the honest label,
                the live re-check and the panel behind it. The card shows a
                single row of tiles; this is the full answer. */}
            <WhereToWatch
              mediaType={target.mediaType}
              tmdbId={target.id}
              title={target.title}
              year={target.year}
              posterPath={target.posterPath}
            />
          </div>
        </div>

        {/* The decision, pinned to the bottom of the sheet so it is reachable
            without scrolling back up through the analysis. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-ink-950/70 p-3 sm:p-4">
          <div className="wv-act-row min-w-0 flex-1">
            <CardVerdict tmdbId={target.id} mediaType={target.mediaType} title={target.title} year={target.year} posterPath={target.posterPath} />
          </div>
          <Link href={titleHref} className="btn-primary flex-none">⚖️ Full verdict</Link>
        </div>
      </div>
    </div>
  );

  // SSR renders nothing: `document` does not exist, and a modal has no server
  // markup worth emitting. The first client effect mounts it.
  return mounted ? createPortal(overlay, document.body) : null;
}
