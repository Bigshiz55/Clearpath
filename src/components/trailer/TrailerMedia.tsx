'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reportVisibility, dropVisibility, useIsActiveTrailer, MIN_VISIBILITY } from './activeTrailer';
import {
  getAutoplayPref,
  prefersReducedMotion,
  trailerFeatureEnabled,
  youTubeEmbedUrl,
} from '@/lib/trailer/prefs';
import type { ResolvedTrailer } from '@/lib/trailer/resolve';
import { recordAnalyticsEvent } from '@/lib/actions/passFeedback';

/**
 * THE ONE TRAILER-PREVIEW MEDIA WRAPPER.
 *
 * Wraps a card's existing poster (passed as children) inside the same media
 * box. Default is a pure passthrough — with the feature off, or no tmdbId, or
 * server-side render, it renders exactly the poster and changes nothing, so no
 * card can regress. With the feature on, the card that becomes the single
 * active trailer (see activeTrailer.ts) resolves its official trailer, mounts
 * ONE muted YouTube iframe over the poster, and offers minimal controls; when
 * another card wins, this one unmounts its iframe and the audio stops.
 *
 * Only the active card ever mounts an iframe, so a grid of 50 cards has at most
 * one player. Nothing here fabricates a trailer: a resolver miss stays on the
 * poster.
 */

// Client memo so scrolling a grid never re-resolves the same title.
const cache = new Map<string, ResolvedTrailer | null>();

interface Props {
  tmdbId: number | null;
  mediaType: 'movie' | 'tv';
  title: string;
  children: React.ReactNode; // the existing poster element
}

export function TrailerMedia({ tmdbId, mediaType, title, children }: Props) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(trailerFeatureEnabled());
  }, []);

  // Passthrough: feature off or no id → just the poster, zero behavior change.
  if (!enabled || tmdbId == null) return <>{children}</>;
  return <TrailerMediaInner tmdbId={tmdbId} mediaType={mediaType} title={title}>{children}</TrailerMediaInner>;
}

function TrailerMediaInner({ tmdbId, mediaType, title, children }: Props & { tmdbId: number }) {
  const id = `${mediaType}:${tmdbId}`;
  const isActive = useIsActiveTrailer(id);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [trailer, setTrailer] = useState<ResolvedTrailer | null | undefined>(cache.get(id));
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const impressionSent = useRef(false);
  const startedSent = useRef(false);

  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const [autoplayPref, setAutoplayPref] = useState<'on' | 'off'>('on');
  useEffect(() => {
    setAutoplayPref(getAutoplayPref());
    const onPref = () => setAutoplayPref(getAutoplayPref());
    window.addEventListener('wv-trailer-pref', onPref);
    return () => window.removeEventListener('wv-trailer-pref', onPref);
  }, []);

  // Autoplay is allowed only when the user hasn't turned it off and hasn't
  // asked for reduced motion. Otherwise the card can still become active — it
  // just waits for a tap (manual play), never surprising the user.
  const autoplayAllowed = autoplayPref === 'on' && !reducedMotion;

  const emit = useCallback(
    (name: string, extra?: Record<string, unknown>) => {
      void recordAnalyticsEvent(name, { tmdbId, mediaType, source: 'card_trailer', ...extra }).catch(() => {});
    },
    [tmdbId, mediaType],
  );

  // Report visibility to the coordinator glue.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) reportVisibility(id, e.intersectionRatio);
      },
      { threshold: [0, 0.25, MIN_VISIBILITY, 0.9, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      dropVisibility(id);
    };
  }, [id]);

  // When this card becomes active, resolve its trailer once (cached).
  useEffect(() => {
    if (!isActive) return;
    if (!impressionSent.current) {
      impressionSent.current = true;
      emit('trailer_impression');
    }
    if (cache.has(id)) {
      setTrailer(cache.get(id));
      return;
    }
    let cancelled = false;
    fetch(`/api/trailer/${mediaType}/${tmdbId}`, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : { trailer: null }))
      .then((d: { trailer: ResolvedTrailer | null }) => {
        if (cancelled) return;
        cache.set(id, d.trailer ?? null);
        setTrailer(d.trailer ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          cache.set(id, null);
          setTrailer(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isActive, id, mediaType, tmdbId, emit]);

  // Losing active status stops playback immediately (iframe unmounts below).
  useEffect(() => {
    if (!isActive) {
      setPlaying(false);
      setMuted(true);
      startedSent.current = false;
    }
  }, [isActive]);

  const canAutoplay = isActive && autoplayAllowed && trailer?.autoplayEligible === true;
  // Mount the iframe when auto-eligible, or when the user manually pressed play.
  const showIframe = isActive && trailer != null && (canAutoplay || playing);

  useEffect(() => {
    if (showIframe && !startedSent.current) {
      startedSent.current = true;
      setPlaying(true);
      emit('trailer_started', { official: trailer?.official, type: trailer?.type });
    }
  }, [showIframe, emit, trailer]);

  // Lightweight YouTube control via postMessage (no full SDK).
  const command = useCallback((func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      'https://www.youtube-nocookie.com',
    );
  }, []);

  // Controls sit visually over the card's own click target; stop the event so a
  // tap on a control never also opens/navigates the card.
  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const toggleMute = useCallback((e: React.MouseEvent) => {
    stop(e);
    setMuted((m) => {
      const next = !m;
      command(next ? 'mute' : 'unMute');
      emit(next ? 'trailer_muted' : 'trailer_unmuted');
      return next;
    });
  }, [command, emit]);

  const restart = useCallback((e: React.MouseEvent) => {
    stop(e);
    command('seekTo', [0, true]);
    command('playVideo');
    emit('trailer_replayed');
  }, [command, emit]);

  const fullscreen = useCallback((e: React.MouseEvent) => {
    stop(e);
    rootRef.current?.requestFullscreen?.().catch(() => {});
    emit('trailer_fullscreen');
  }, [emit]);

  const manualPlay = useCallback((e: React.MouseEvent) => {
    stop(e);
    setPlaying(true);
    emit('trailer_manual_play');
  }, [emit]);

  const embed = trailer ? youTubeEmbedUrl(trailer.videoId, { muted, autoplay: true }) : null;

  return (
    <div ref={rootRef} className="relative h-full w-full" data-testid="trailer-media" data-active={isActive ? '1' : '0'}>
      {/* The poster is always present underneath — the trailer crossfades over
          it, and is what remains if resolution misses or the player is blocked. */}
      <div className={showIframe ? 'opacity-0 transition-opacity duration-500' : 'opacity-100'}>{children}</div>

      {showIframe && embed && (
        <div className="absolute inset-0">
          <iframe
            ref={iframeRef}
            src={embed}
            title={`${title} — trailer`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
          {/* Minimal, on-brand control overlay. */}
          <div className="absolute bottom-1 right-1 flex gap-1">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? `Unmute ${title} trailer` : `Mute ${title} trailer`}
              className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-sm text-white backdrop-blur transition hover:bg-black/80"
            >
              {muted ? '🔇' : '🔊'}
            </button>
            <button
              type="button"
              onClick={restart}
              aria-label={`Restart ${title} trailer`}
              className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-sm text-white backdrop-blur transition hover:bg-black/80"
            >
              ↺
            </button>
            <button
              type="button"
              onClick={fullscreen}
              aria-label={`Play ${title} trailer fullscreen`}
              className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-sm text-white backdrop-blur transition hover:bg-black/80"
            >
              ⛶
            </button>
          </div>
          <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90">
            Trailer
          </span>
        </div>
      )}

      {/* Active, trailer exists, but not autoplaying (pref off / reduced motion
          / autoplay blocked) → a manual play affordance over the poster. */}
      {isActive && trailer != null && !showIframe && (
        <button
          type="button"
          onClick={manualPlay}
          aria-label={`Play ${title} trailer`}
          data-testid="trailer-manual-play"
          className="absolute inset-0 grid place-items-center bg-black/0 transition hover:bg-black/20"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-black/60 text-lg text-white backdrop-blur">▶</span>
        </button>
      )}
    </div>
  );
}
