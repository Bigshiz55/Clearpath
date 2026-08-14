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
 * Wraps a card's existing poster (passed as children) and adds an INLINE trailer
 * that plays in place — never a modal, never a new tab, never a navigation. Two
 * independent behaviours:
 *
 *   • MANUAL play is ALWAYS available (no feature flag): every movie/TV card
 *     shows a small "▶ Trailer" affordance. Tapping it resolves the title's own
 *     official trailer ON CLICK (zero network/iframe cost until then), mounts one
 *     muted YouTube iframe over the poster, and offers mute / restart /
 *     fullscreen / ✕-close. ✕ restores the poster. If the title has no verified
 *     embeddable trailer it says so briefly and stays on the poster — trailer
 *     enrichment never blocks a title.
 *
 *   • AUTOMATIC dwell/autoplay is what the `?trailers=1` flag gates. Only the
 *     single most-visible ("active") card, and only when the user's Autoplay pref
 *     is on and reduced-motion is off, begins muted playback on its own.
 *
 * SINGLE ACTIVE PLAYER: a module-level store holds the one card that is playing
 * (manual OR auto). Starting any card stops the previous one, so a grid of 50
 * cards has at most one iframe.
 *
 * INTERACTION HIERARCHY: TrailerMedia must be the OUTER element and the card's
 * own click target (a button/Link/div) its child, so TrailerMedia's own control
 * buttons are SIBLINGS of that target, never nested inside it. Every control here
 * also calls stopPropagation + preventDefault, so a tap on ▶ Trailer / mute / ✕
 * never triggers the card's own click (QuickLook, navigation). Trailer, Save,
 * For, Against stay independent actions.
 */

// Client memo so scrolling a grid never re-resolves the same title.
const cache = new Map<string, ResolvedTrailer | null>();

// ---- Single-active PLAYING store (manual + auto share one slot) --------------
type Listener = () => void;
const playing = {
  id: null as string | null,
  listeners: new Set<Listener>(),
  claim(id: string) {
    if (this.id === id) return;
    this.id = id;
    this.listeners.forEach((l) => l());
  },
  release(id: string) {
    if (this.id !== id) return;
    this.id = null;
    this.listeners.forEach((l) => l());
  },
};

function useIsPlayingSlot(id: string): boolean {
  const [isSlot, setIsSlot] = useState(() => playing.id === id);
  useEffect(() => {
    const on = () => setIsSlot(playing.id === id);
    playing.listeners.add(on);
    on();
    return () => {
      playing.listeners.delete(on);
    };
  }, [id]);
  return isSlot;
}

interface Props {
  tmdbId: number | null;
  mediaType: 'movie' | 'tv';
  title: string;
  children: React.ReactNode; // the existing poster element (may itself be the card's click target)
}

export function TrailerMedia({ tmdbId, mediaType, title, children }: Props) {
  // Passthrough only when there is no id to resolve (server render or missing
  // metadata). NOT gated by the feature flag — manual play is always on.
  if (tmdbId == null) return <>{children}</>;
  return (
    <TrailerMediaInner tmdbId={tmdbId} mediaType={mediaType} title={title}>
      {children}
    </TrailerMediaInner>
  );
}

function TrailerMediaInner({ tmdbId, mediaType, title, children }: Props & { tmdbId: number }) {
  const id = `${mediaType}:${tmdbId}`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const isActive = useIsActiveTrailer(id); // dwell "most visible" — autoplay eligibility only
  const isPlayingSlot = useIsPlayingSlot(id); // the one card actually playing

  const [trailer, setTrailer] = useState<ResolvedTrailer | null | undefined>(cache.get(id));
  const [open, setOpen] = useState(false); // user (or autoplay) opened the inline player
  const [loading, setLoading] = useState(false);
  const [noTrailer, setNoTrailer] = useState(false);
  const [muted, setMuted] = useState(true);
  const impressionSent = useRef(false);
  const startedSent = useRef(false);

  // Feature flag now controls ONLY automatic dwell/autoplay, never manual play.
  const [autoplayFeature, setAutoplayFeature] = useState(false);
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const [autoplayPref, setAutoplayPref] = useState<'on' | 'off'>('on');
  useEffect(() => {
    setAutoplayFeature(trailerFeatureEnabled());
    setAutoplayPref(getAutoplayPref());
    const onPref = () => setAutoplayPref(getAutoplayPref());
    window.addEventListener('wv-trailer-pref', onPref);
    return () => window.removeEventListener('wv-trailer-pref', onPref);
  }, []);
  const autoplayAllowed = autoplayFeature && autoplayPref === 'on' && !reducedMotion;

  const emit = useCallback(
    (name: string, extra?: Record<string, unknown>) => {
      void recordAnalyticsEvent(name, { tmdbId, mediaType, source: 'card_trailer', ...extra }).catch(() => {});
    },
    [tmdbId, mediaType],
  );

  // Report visibility to the dwell coordinator (drives autoplay eligibility only).
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

  // Resolve the title's OWN trailer by its TMDB id — never a text/YouTube search,
  // so same-name reboots can't cross-contaminate. Cached; returns the memo fast.
  const resolve = useCallback(async (): Promise<ResolvedTrailer | null> => {
    if (cache.has(id)) {
      const v = cache.get(id) ?? null;
      setTrailer(v);
      return v;
    }
    setLoading(true);
    try {
      const r = await fetch(`/api/trailer/${mediaType}/${tmdbId}`, { cache: 'force-cache' });
      const d = (r.ok ? await r.json() : { trailer: null }) as { trailer: ResolvedTrailer | null };
      cache.set(id, d.trailer ?? null);
      setTrailer(d.trailer ?? null);
      return d.trailer ?? null;
    } catch {
      cache.set(id, null);
      setTrailer(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [id, mediaType, tmdbId]);

  // Losing the single-active PLAYING slot stops this card immediately.
  useEffect(() => {
    if (!isPlayingSlot && open) {
      setOpen(false);
      setMuted(true);
      startedSent.current = false;
    }
  }, [isPlayingSlot, open]);

  // AUTOMATIC dwell autoplay: only the active card, only when the flag + prefs
  // allow. Resolve on becoming active, then autoplay if the trailer is eligible.
  useEffect(() => {
    if (!isActive) return;
    if (!impressionSent.current) {
      impressionSent.current = true;
      emit('trailer_impression');
    }
    if (!autoplayAllowed) return;
    let cancelled = false;
    void resolve().then((t) => {
      if (cancelled || !t || t.autoplayEligible !== true) return;
      playing.claim(id);
      setMuted(true);
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isActive, autoplayAllowed, resolve, emit, id]);

  // When the inline player opens, fire the started event once.
  useEffect(() => {
    if (open && trailer && !startedSent.current) {
      startedSent.current = true;
      emit('trailer_started', { official: trailer.official, type: trailer.type });
    }
  }, [open, trailer, emit]);

  const showIframe = open && trailer != null;

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // MANUAL play — always available. Claims the single-active slot, resolves on
  // click, plays inline. If no verified trailer, says so and stays on the poster.
  const manualPlay = useCallback(
    async (e: React.MouseEvent) => {
      stop(e);
      setNoTrailer(false);
      playing.claim(id);
      setMuted(true);
      emit('trailer_manual_play');
      const t = cache.has(id) ? cache.get(id) ?? null : await resolve();
      if (t) {
        setOpen(true);
      } else {
        setNoTrailer(true);
        setTimeout(() => setNoTrailer(false), 2200);
      }
    },
    [id, resolve, emit],
  );

  // The one way back to the poster, whatever asked for it.
  const dismiss = useCallback(() => {
    setOpen(false);
    setMuted(true);
    startedSent.current = false;
    playing.release(id);
    emit('trailer_closed');
  }, [id, emit]);

  const close = useCallback(
    (e: React.MouseEvent) => {
      stop(e);
      dismiss();
    },
    [dismiss],
  );

  // ESCAPE RETURNS THE POSTER. A video that took over the media frame is a
  // mode, and every mode needs the key people already press to leave one —
  // otherwise the only way out is finding a 32px ✕ over moving artwork. Bound
  // only while this card is the one playing, so a grid of fifty cards never
  // has fifty listeners and Escape never reaches a card that is not showing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismiss]);

  // Lightweight YouTube control via postMessage (no full SDK).
  const command = useCallback((func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      'https://www.youtube-nocookie.com',
    );
  }, []);

  const toggleMute = useCallback(
    (e: React.MouseEvent) => {
      stop(e);
      setMuted((m) => {
        const next = !m;
        command(next ? 'mute' : 'unMute');
        emit(next ? 'trailer_muted' : 'trailer_unmuted');
        return next;
      });
    },
    [command, emit],
  );

  const restart = useCallback(
    (e: React.MouseEvent) => {
      stop(e);
      command('seekTo', [0, true]);
      command('playVideo');
      emit('trailer_replayed');
    },
    [command, emit],
  );

  const fullscreen = useCallback(
    (e: React.MouseEvent) => {
      stop(e);
      rootRef.current?.requestFullscreen?.().catch(() => {});
      emit('trailer_fullscreen');
    },
    [emit],
  );

  const embed = trailer ? youTubeEmbedUrl(trailer.videoId, { muted, autoplay: true }) : null;

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full"
      data-testid="trailer-media"
      data-active={isActive ? '1' : '0'}
      data-playing={showIframe ? '1' : '0'}
    >
      {/* The poster (and the card's own click target) is always present underneath
          — the trailer crossfades over it, and is what remains if resolution
          misses or the player is closed. */}
      {/* `h-full w-full` IS LOAD-BEARING. This wrapper had no size, so a child
          asking for `h-full` (every poster/Link/button passed in here does)
          resolved against an auto-height box and collapsed to its content —
          which is why a card with no artwork drew its fallback title at the
          top of an empty frame instead of centred in it. The wrapper must be
          exactly the media frame, because that is what the poster state is
          defined as occupying. */}
      <div className={`h-full w-full ${showIframe ? 'opacity-0 transition-opacity duration-500' : 'opacity-100'}`}>
        {children}
      </div>

      {showIframe && embed && (
        <div className="absolute inset-0" data-testid="trailer-player">
          <iframe
            ref={iframeRef}
            src={embed}
            title={`${title} — trailer`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
          {/* Close (✕) — top-LEFT, restores the poster. (Top-right is where the
              card's own W/docket badge lives, so ✕ goes left to avoid it.) */}
          <button
            type="button"
            onClick={close}
            aria-label={`Close ${title} trailer`}
            data-testid="trailer-close"
            className="wv-tr-hit absolute left-0 top-0 z-[3] justify-start pl-1 pt-1"
          >
            <span aria-hidden className="wv-tr-chip h-8 w-8 justify-center text-sm">✕</span>
          </button>
          {/* Minimal control overlay — mute / restart / fullscreen. Same
              pattern: a 44px button, an 32px mark inside it. */}
          <div className="absolute bottom-0 right-0 flex">
            <button
              type="button"
              onClick={toggleMute}
              data-testid="trailer-mute"
              aria-label={muted ? `Unmute ${title} trailer` : `Mute ${title} trailer`}
              className="wv-tr-hit pb-1"
            >
              <span aria-hidden className="wv-tr-chip h-8 w-8 justify-center text-sm">{muted ? '🔇' : '🔊'}</span>
            </button>
            <button
              type="button"
              onClick={restart}
              data-testid="trailer-restart"
              aria-label={`Restart ${title} trailer`}
              className="wv-tr-hit pb-1"
            >
              <span aria-hidden className="wv-tr-chip h-8 w-8 justify-center text-sm">↺</span>
            </button>
            <button
              type="button"
              onClick={fullscreen}
              data-testid="trailer-fullscreen"
              aria-label={`Play ${title} trailer fullscreen`}
              className="wv-tr-hit pb-1 pr-1"
            >
              <span aria-hidden className="wv-tr-chip h-8 w-8 justify-center text-sm">⛶</span>
            </button>
          </div>
        </div>
      )}

      {/* MANUAL ▶ Trailer affordance — always present (no flag) while not playing.
          Bottom-RIGHT so it clears bottom-left card labels (release date, etc.).

          THE TARGET IS 44px; THE MARK IS NOT. This rendered as a 68×25 pill —
          the whole control was the visible chrome, so meeting the interaction
          minimum by growing it would have meant a slab of black across the
          corner of every poster. Instead the BUTTON is the target (>=44 in both
          axes, transparent, extending into the poster's own dead corner) and
          the pill inside it is the mark. Same refined chrome, a thumb-sized
          hit area. See `.wv-tr-hit` / `.wv-tr-chip` in globals.css. */}
      {!showIframe && (
        <button
          type="button"
          onClick={manualPlay}
          aria-label={`Play ${title} trailer`}
          data-testid="trailer-play"
          className="wv-tr-hit absolute bottom-0 right-0 z-[2] pb-1 pr-1"
        >
          <span className="wv-tr-chip gap-1 px-2 py-1 text-[11px] font-bold">
            <span aria-hidden>▶</span>
            <span>{loading ? '…' : noTrailer ? 'No trailer' : 'Trailer'}</span>
          </span>
        </button>
      )}
    </div>
  );
}
