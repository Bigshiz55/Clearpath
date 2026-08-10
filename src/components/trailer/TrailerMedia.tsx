'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reportVisibility, dropVisibility, useIsActiveTrailer, MIN_VISIBILITY } from './activeTrailer';
import {
  getAutoplayPref,
  prefersReducedMotion,
  trailerFeatureEnabled,
  youTubeEmbedUrl,
} from '@/lib/trailer/prefs';
import { createHoverIntent, hoverPreviewAllowed, type HoverIntent } from '@/lib/trailer/hoverIntent';
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
 *   • HOVER-INTENT PREVIEW is the desktop gesture: a pointer that RESTS on a
 *     poster past a short dwell gets a muted preview, and moving away restores
 *     the poster. It is the "P" in HOVER = PREVIEW · CLICK = UNDERSTAND · FULL
 *     VERDICT = ANALYZE, so it is not behind the `?trailers=1` flag — that flag
 *     gates the far more intrusive scroll-dwell autoplay, which starts playing
 *     at a card you never pointed at. A hover preview only ever happens where
 *     the user is already looking, and it still honours reduced-motion and the
 *     Autoplay preference. It can never happen on touch: see
 *     `hoverPreviewAllowed`, which requires a real mouse AND a hover-capable
 *     device, because a tap synthesises a hover and would otherwise turn "open
 *     More Info" into "start a trailer".
 *
 * SINGLE ACTIVE PLAYER: a module-level store holds the one card that is playing
 * (manual OR auto OR hover). Starting any card stops the previous one, so a grid
 * of 50 cards has at most one iframe — hovering card B is what stops card A.
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
  releaseAll() {
    if (this.id === null) return;
    this.id = null;
    this.listeners.forEach((l) => l());
  },
};

/**
 * Stop whatever is playing anywhere in the grid.
 *
 * Pointer-leave already covers the ordinary case, but a dialog opening under
 * the cursor is not an ordinary case: the pointer never moves, so no boundary
 * event fires, and a muted preview would keep running behind More Info. The
 * callers that open something over the results say so explicitly rather than
 * relying on a boundary event the browser is not obliged to synthesise.
 */
export function stopAllTrailerPlayback(): void {
  playing.releaseAll();
}

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

/** Why the inline player is open. `null` = poster only. */
type PlaySource = 'manual' | 'auto' | 'hover' | null;

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
  /** WHY the inline player is open — null means it is not. The source matters
   *  because a HOVER preview is ephemeral and pointer-transparent, while a
   *  manual or dwell-autoplay player is a thing the user is holding open. */
  const [source, setSource] = useState<PlaySource>(null);
  const open = source != null;
  const [loading, setLoading] = useState(false);
  const [noTrailer, setNoTrailer] = useState(false);
  const [muted, setMuted] = useState(true);
  const impressionSent = useRef(false);
  const startedSent = useRef(false);

  // Feature flag now controls ONLY automatic dwell/autoplay, never manual play.
  const [autoplayFeature, setAutoplayFeature] = useState(false);
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);
  const [autoplayPref, setAutoplayPref] = useState<'on' | 'off'>('on');
  /** `(hover: hover) and (pointer: fine)` — resolved on the client only, so SSR
   *  never renders a hover-dependent branch and a phone never qualifies. */
  const [hoverCapable, setHoverCapable] = useState(false);
  useEffect(() => {
    setAutoplayFeature(trailerFeatureEnabled());
    setAutoplayPref(getAutoplayPref());
    try {
      setHoverCapable(window.matchMedia('(hover: hover) and (pointer: fine)').matches);
    } catch {
      setHoverCapable(false);
    }
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

  // Losing the single-active PLAYING slot stops this card immediately. This is
  // the ONE place a card stops on someone else's account — hovering another
  // card, a manual play elsewhere, a dialog calling stopAllTrailerPlayback().
  useEffect(() => {
    if (!isPlayingSlot && open) {
      setSource(null);
      setMuted(true);
      startedSent.current = false;
      hoverClaim.current = false;
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
      setSource('auto');
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
  /** A hover preview is transient chrome-less video; anything else is a player
   *  the user is holding open and gets the full control set. */
  const isHoverPreview = source === 'hover';

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  // ── HOVER-INTENT PREVIEW ────────────────────────────────────────────────────
  //
  // Three refs carry the parts that must not go stale between a pointerenter
  // and the dwell firing ~380ms later:
  //   • `sourceRef`    — is this card already playing for some other reason?
  //   • `pointerOver`  — is the pointer STILL here now that resolve() returned?
  //   • `hoverClaim`   — does this card hold the single-active slot BECAUSE of
  //                      a hover? Only then may pointer-leave stop it. Clicking
  //                      ▶ Trailer during a preview promotes it to manual, and
  //                      a manual player must survive the pointer leaving.
  const sourceRef = useRef<PlaySource>(null);
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);
  const pointerOver = useRef(false);
  const hoverClaim = useRef(false);

  const startHoverPreview = useCallback(async () => {
    if (sourceRef.current != null) return; // already playing for a better reason
    // Claim FIRST, before any network: hovering card B must stop card A now,
    // not after a round trip, and not conditionally on B having a trailer.
    playing.claim(id);
    hoverClaim.current = true;
    setMuted(true);
    // LAZY: this is the first and only time a hovered card touches the network.
    // Nothing is preloaded for the other 49 cards in the grid.
    const t = cache.has(id) ? cache.get(id) ?? null : await resolve();
    if (!pointerOver.current) return; // the pointer left while we resolved
    // NO TRAILER → the poster simply stays. No player, no error chrome, no
    // "No trailer" toast: the user asked for nothing, they only paused.
    if (!t) return;
    setSource('hover');
    emit('trailer_hover_preview');
  }, [id, resolve, emit]);

  /** Latest-callback ref so the intent object never closes over a stale render. */
  const fire = useRef<() => void>(() => {});
  useEffect(() => {
    fire.current = () => {
      void startHoverPreview();
    };
  }, [startHoverPreview]);

  const intentRef = useRef<HoverIntent | null>(null);
  if (intentRef.current === null) {
    intentRef.current = createHoverIntent({ onFire: () => fire.current() });
  }

  const endHoverPreview = useCallback(() => {
    pointerOver.current = false;
    intentRef.current?.leave();
    if (!hoverClaim.current) return; // manual/auto player — the pointer is not its owner
    hoverClaim.current = false;
    if (sourceRef.current === 'hover') {
      setSource(null);
      setMuted(true);
      startedSent.current = false;
    }
    playing.release(id);
  }, [id]);

  const onPointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (
        !hoverPreviewAllowed({
          pointerType: e.pointerType,
          hoverCapable,
          reducedMotion,
          autoplayPref,
        })
      ) {
        return;
      }
      if (sourceRef.current != null) return;
      pointerOver.current = true;
      intentRef.current?.enter();
    },
    [hoverCapable, reducedMotion, autoplayPref],
  );

  // UNMOUNT / ROUTE CHANGE. The dwell lives on this component, so tearing the
  // component down is what cancels it — there is no global timer table that
  // could outlive the card and fire into nothing. Releasing the slot on the way
  // out means a grid replaced mid-preview does not leave the store pointing at
  // a card that no longer exists.
  useEffect(() => {
    const intent = intentRef.current;
    return () => {
      intent?.dispose();
      playing.release(id);
    };
  }, [id]);

  // MANUAL play — always available. Claims the single-active slot, resolves on
  // click, plays inline. If no verified trailer, says so and stays on the poster.
  const manualPlay = useCallback(
    async (e: React.MouseEvent) => {
      stop(e);
      setNoTrailer(false);
      playing.claim(id);
      // PROMOTION. Clicking ▶ Trailer during a hover preview turns it into a
      // deliberate playback the pointer no longer owns: dropping the hover
      // claim is what stops the next pointer-leave from killing it. Explicit
      // intent outranks ambient intent.
      hoverClaim.current = false;
      intentRef.current?.leave();
      setMuted(true);
      emit('trailer_manual_play');
      const t = cache.has(id) ? cache.get(id) ?? null : await resolve();
      if (t) {
        setSource('manual');
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
      setSource(null);
      setMuted(true);
      startedSent.current = false;
      hoverClaim.current = false;
      // The pointer is still inside the card after ✕, so the dwell must be told
      // this preview is over — otherwise the intent believes it is still
      // previewing and a genuine re-hover would never re-arm.
      intentRef.current?.leave();
      playing.release(id);
      emit('trailer_closed');
    },
    [id, emit],
  );

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
      data-source={source ?? 'none'}
      /* POINTER-ENTER/LEAVE, NOT OVER/OUT. Enter and leave fire only when the
         pointer crosses THIS element's boundary, treating descendants as part
         of it — so drifting from the poster onto the ▶ Trailer chip, or the
         player mounting under the cursor, is not a new hover. That is half the
         jitter guarantee; `createHoverIntent` is the other half. */
      onPointerEnter={onPointerEnter}
      onPointerLeave={endHoverPreview}
      /* A cancelled pointer (the OS taking over, a drag starting) is a leave as
         far as this card is concerned. */
      onPointerCancel={endHoverPreview}
    >
      {/* The poster (and the card's own click target) is always present underneath
          — the trailer crossfades over it, and is what remains if resolution
          misses or the player is closed. */}
      <div className={showIframe ? 'opacity-0 transition-opacity duration-500' : 'opacity-100'}>{children}</div>

      {showIframe && embed && (
        <div
          /* A HOVER PREVIEW MUST NOT SWALLOW THE CLICK.
             The player covers the poster, and the poster IS the card's click
             target — so without `pointer-events: none` the interaction model
             inverts the moment a preview starts: hovering a card would disable
             "click to understand it" on exactly the card you are looking at.
             Transparent to the pointer, the click lands on the link underneath
             and More Info opens, preview or no preview. A manual/dwell player
             keeps its pointer events, because it owns controls. */
          className={`absolute inset-0${isHoverPreview ? ' pointer-events-none' : ''}`}
          data-testid="trailer-player"
          data-preview={isHoverPreview ? 'hover' : 'explicit'}
        >
          <iframe
            ref={iframeRef}
            src={embed}
            title={`${title} — trailer`}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
            /* Nothing inside a preview is reachable by keyboard either — the
               preview is not a control the user navigated to. */
            tabIndex={isHoverPreview ? -1 : undefined}
          />
          {/* Controls belong to a player the user opened on purpose. A hover
              preview has exactly one way to end — move the pointer — so a ✕
              that cannot be clicked (see pointer-events above) would be a lie. */}
          {!isHoverPreview && (
          <>
          {/* Close (✕) — top-LEFT, restores the poster. (Top-right is where the
              card's own W/docket badge lives, so ✕ goes left to avoid it.) */}
          <button
            type="button"
            onClick={close}
            aria-label={`Close ${title} trailer`}
            data-testid="trailer-close"
            className="absolute left-1 top-1 z-[3] grid h-8 w-8 place-items-center rounded-full bg-black/65 text-sm text-white backdrop-blur transition hover:bg-black/85"
          >
            ✕
          </button>
          {/* Minimal control overlay — mute / restart / fullscreen. */}
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
          </>
          )}
        </div>
      )}

      {/* MANUAL ▶ Trailer affordance — always present (no flag) while not playing.
          Bottom-RIGHT so it clears bottom-left card labels (release date, etc.).

          A 44px TARGET AROUND A SMALL PILL. The control was the pill itself:
          68×25, which is a 25px tap target on the busiest surface in the app —
          it was flagged at all twelve viewports the visual-QA suite walks, from
          320 up to 1440, and it is the last sub-44px control in the grid.
          Making the pill itself 44px tall would put a chunky lozenge over the
          artwork on every card, so the BUTTON carries the height and the pill
          is drawn inside it: same thing to look at, a target a thumb can
          actually hit. `pt-*` keeps the extra height above the pill, so the
          visible chip stays where it was in the corner. */}
      {/* It stays put DURING a hover preview, too. A preview answers "what is
          this"; ▶ Trailer is still how you say "now play it properly" — with
          controls, with sound if you want it, and without it vanishing the
          moment you move the mouse. Losing the affordance mid-preview would
          make the ambient gesture cost you the deliberate one. */}
      {(!showIframe || isHoverPreview) && (
        <button
          type="button"
          onClick={manualPlay}
          aria-label={`Play ${title} trailer`}
          data-testid="trailer-play"
          className="absolute bottom-0 right-0 z-[2] flex min-h-[44px] items-end justify-end p-1 pt-0 transition"
        >
          <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[11px] font-bold text-white backdrop-blur transition group-hover:bg-black/80">
            <span aria-hidden>▶</span>
            <span>{loading ? '…' : noTrailer ? 'No trailer' : 'Trailer'}</span>
          </span>
        </button>
      )}
    </div>
  );
}
