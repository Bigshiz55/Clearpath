'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  reportVisibility,
  dropVisibility,
  useIsActiveTrailer,
  useIsPlayingSlot,
  claimPlaying,
  releasePlaying,
  MIN_VISIBILITY,
  DWELL_MS,
} from './activeTrailer';
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
 * ── THE CORE RULE ───────────────────────────────────────────────────────────
 * A TRAILER MAY NEVER CHANGE THE OUTER DIMENSIONS OF A CARD.
 *
 * This component fills its parent (`h-full w-full`) and paints EVERYTHING —
 * poster, iframe, controls, the ▶ affordance — either in normal flow at that
 * exact size or `absolute inset-0` on top of it. It has no intrinsic height of
 * its own, adds no padding, and never mounts a sibling that could push. The
 * frame it lives in (`.wv-card-art` / `.wv-rail-frame`) is sized by
 * `aspect-ratio` and carries `contain: layout` + `overflow: hidden`, so even a
 * future mistake in here cannot propagate out to the card.
 *
 * The complete card therefore stays visible before, during and after preview:
 * poster crossfades to video inside the same box, and nothing below the media
 * frame moves by a pixel. `tests/mobile/card-geometry.spec.ts` measures exactly
 * that — card height and the top of every region below the frame, sampled
 * before / during / after — at 1440×900, 1280×800 and 390×844.
 *
 * Wraps a card's existing poster (passed as children) and adds an INLINE trailer
 * that plays in place — never a modal, never a new tab, never a navigation.
 * Three independent behaviours:
 *
 *   • MANUAL play is ALWAYS available (no feature flag): every movie/TV card
 *     shows a small "▶ Trailer" affordance. Tapping it resolves the title's own
 *     official trailer ON CLICK (zero network/iframe cost until then), mounts one
 *     muted YouTube iframe over the poster, and offers pause/play, mute/unmute,
 *     restart and ✕-close. ✕ restores the poster. If the title has no verified
 *     embeddable trailer it says so briefly and stays on the poster — trailer
 *     enrichment never blocks a title. (The old ⛶ fullscreen control is gone:
 *     the card is not where the big experience lives — More Info is.)
 *
 *   • HOVER INTENT (pointer devices only). Crossing a card must not start a
 *     video — moving a mouse across a grid would fire a dozen. The pointer has
 *     to REST on the frame for `DWELL_MS` (550ms, the same proven delay the
 *     scroll-dwell coordinator already uses) before anything resolves, and
 *     leaving before that cancels it with no network cost. Gated by the same
 *     Autoplay preference and reduced-motion check as scroll autoplay: a user
 *     who turned autoplay off never gets video they did not ask for.
 *
 *   • AUTOMATIC dwell/autoplay is what the `?trailers=1` flag gates. Only the
 *     single most-visible ("active") card, and only when the user's Autoplay pref
 *     is on and reduced-motion is off, begins muted playback on its own.
 *
 * KEYBOARD parity: the ▶ Trailer affordance is a real button in the tab order,
 * so Enter/Space starts the same preview a pointer would, and ✕ returns to the
 * poster. Focus is never enough on its own — tabbing THROUGH a grid must not
 * start video any more than sweeping a mouse across it should.
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

// The single-active PLAYING store (manual + auto share one slot) now lives in
// `./activeTrailer` — see `claimPlaying` / `releasePlaying` / `useIsPlayingSlot`
// there. It moved out of this file so the More Info modal can stop a card
// preview without importing a component.

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
  const [paused, setPaused] = useState(false);
  const impressionSent = useRef(false);
  const startedSent = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setPaused(false);
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
      claimPlaying(id);
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
      claimPlaying(id);
      setMuted(true);
      setPaused(false);
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

  const close = useCallback(
    (e: React.MouseEvent) => {
      stop(e);
      setOpen(false);
      setMuted(true);
      setPaused(false);
      startedSent.current = false;
      releasePlaying(id);
      emit('trailer_closed');
    },
    [id, emit],
  );

  // ── HOVER INTENT ──────────────────────────────────────────────────────────
  // Resting, not crossing. Nothing at all happens until the pointer has been
  // still on this frame for DWELL_MS; leaving cancels the timer, so sweeping a
  // mouse over a grid of forty cards costs zero requests and starts zero
  // videos. Coarse pointers (touch) are excluded — there is no "hover" to have
  // intent with, and the explicit ▶ control is the phone's path.
  const hoverCapable = useMemo(() => {
    try {
      return typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    } catch {
      return false;
    }
  }, []);

  const cancelHover = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  const onPointerEnter = useCallback(() => {
    // The Autoplay preference and reduced-motion govern hover exactly as they
    // govern scroll-dwell: a user who turned autoplay off is never handed video
    // they did not press for.
    if (!hoverCapable || !autoplayAllowed || open) return;
    cancelHover();
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null;
      void (async () => {
        const t = cache.has(id) ? cache.get(id) ?? null : await resolve();
        if (!t) return; // no verified trailer: stay on the poster, say nothing
        claimPlaying(id);
        setMuted(true);
        setPaused(false);
        setOpen(true);
        emit('trailer_hover_play');
      })();
    }, DWELL_MS);
  }, [hoverCapable, autoplayAllowed, open, cancelHover, id, resolve, emit]);

  // Leaving returns to the poster. A preview that follows you down the page is
  // a video you have to go back and turn off.
  const onPointerLeave = useCallback(() => {
    cancelHover();
    if (open && hoverCapable) {
      setOpen(false);
      setMuted(true);
      setPaused(false);
      startedSent.current = false;
      releasePlaying(id);
    }
  }, [cancelHover, open, hoverCapable, id]);

  useEffect(() => cancelHover, [cancelHover]);

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

  // PAUSE/PLAY replaces the old ⛶ fullscreen control. Fullscreen was the card
  // trying to be the big experience; that job belongs to More Info, which has
  // room for it. What a preview actually needs is a way to hold the frame still.
  const togglePause = useCallback(
    (e: React.MouseEvent) => {
      stop(e);
      setPaused((p) => {
        const next = !p;
        command(next ? 'pauseVideo' : 'playVideo');
        emit(next ? 'trailer_paused' : 'trailer_resumed');
        return next;
      });
    },
    [command, emit],
  );

  const embed = trailer ? youTubeEmbedUrl(trailer.videoId, { muted, autoplay: true }) : null;

  return (
    <div
      ref={rootRef}
      /* `absolute inset-0`, not `h-full w-full`. Filling the frame in normal
         flow still lets the CHILDREN contribute intrinsic height on the day one
         of them stops being `h-full`; taking the wrapper out of flow entirely
         means this subtree cannot size its parent at all, whatever it holds.
         That is the core rule made structural rather than conventional. */
      className="absolute inset-0"
      data-testid="trailer-media"
      data-media-frame="1"
      data-active={isActive ? '1' : '0'}
      data-playing={showIframe ? '1' : '0'}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {/* The poster (and the card's own click target) is always present underneath
          — the trailer crossfades over it, and is what remains if resolution
          misses or the player is closed. Reduced motion gets the swap with no
          transition rather than a different layout: the contract is about
          geometry, and geometry is identical either way. */}
      <div
        className={
          showIframe
            ? `absolute inset-0 opacity-0 ${reducedMotion ? '' : 'transition-opacity duration-500'}`
            : 'absolute inset-0 opacity-100'
        }
      >
        {children}
      </div>

      {/* THE PLAYER LAYER SITS AT z-4. Below it (z-2) are the frame's poster-
          state affordances — the ⓘ Info chip and the ▶ Trailer control — which
          the video is meant to cover: while a preview runs the frame belongs to
          the video. Above it stay the two things that must remain readable
          during playback: the rank chip (z-6, see `.wv-rank-chip`) and the
          W/docket badge (z-10), because "rank remains visible" and "the docket
          is one gesture everywhere" are both contracts. */}
      {showIframe && embed && (
        <div className="absolute inset-0 z-[4]" data-testid="trailer-player">
          <iframe
            ref={iframeRef}
            src={embed}
            title={`${title} — trailer`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
          {/* Close (✕) — BOTTOM-LEFT, restores the poster. Both top corners are
              spoken for on every surface that mounts this: the W/docket badge
              sits top-right, and the rank chip (browse card in a feed, and every
              item in the Top Picks rail) sits top-LEFT. Rank must stay readable
              while a trailer plays, so ✕ moved down rather than covering it. */}
          <button
            type="button"
            onClick={close}
            aria-label={`Close ${title} trailer`}
            data-testid="trailer-close"
            className="absolute bottom-1 left-1 z-[5] grid h-8 w-8 place-items-center rounded-full bg-black/65 text-sm text-white backdrop-blur transition hover:bg-black/85"
          >
            ✕
          </button>
          {/* RESTRAINED CONTROLS — pause/play, mute, restart. Three, on the
              artwork, out of the way of the title block. The old ⛶ is gone:
              the card is not where the big experience lives. */}
          <div className="absolute bottom-1 right-1 z-[5] flex gap-1" data-testid="trailer-controls">
            <button
              type="button"
              onClick={togglePause}
              aria-label={paused ? `Play ${title} trailer` : `Pause ${title} trailer`}
              data-testid="trailer-pause"
              className="wv-trailer-optional grid h-8 w-8 place-items-center rounded-full bg-black/60 text-sm text-white backdrop-blur transition hover:bg-black/80"
            >
              <span aria-hidden>{paused ? '▶' : '❚❚'}</span>
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? `Unmute ${title} trailer` : `Mute ${title} trailer`}
              data-testid="trailer-mute"
              className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-sm text-white backdrop-blur transition hover:bg-black/80"
            >
              {muted ? '🔇' : '🔊'}
            </button>
            <button
              type="button"
              onClick={restart}
              aria-label={`Restart ${title} trailer`}
              data-testid="trailer-restart"
              className="wv-trailer-optional grid h-8 w-8 place-items-center rounded-full bg-black/60 text-sm text-white backdrop-blur transition hover:bg-black/80"
            >
              ↺
            </button>
          </div>
        </div>
      )}

      {/* MANUAL ▶ Trailer affordance — always present (no flag) while not playing.
          Bottom-RIGHT so it clears bottom-left card labels (release date, etc.). */}
      {!showIframe && (
        <button
          type="button"
          onClick={manualPlay}
          aria-label={`Play ${title} trailer`}
          data-testid="trailer-play"
          /* 36px minimum. It is a real control on a poster, and the smallest
             phone the app supports puts it in a 136px rail item — the tap-target
             floor applies there exactly as it does in the action row. */
          className="absolute bottom-1 right-1 z-[2] inline-flex min-h-[36px] items-center gap-1 rounded-full bg-black/60 px-2.5 text-[11px] font-bold text-white backdrop-blur transition hover:bg-black/80"
        >
          <span aria-hidden>▶</span>
          <span>{loading ? '…' : noTrailer ? 'No trailer' : 'Trailer'}</span>
        </button>
      )}
    </div>
  );
}
