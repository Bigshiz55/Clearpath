/**
 * HOVER-INTENT — the desktop half of the card interaction model.
 *
 *   HOVER = PREVIEW IT · CLICK = UNDERSTAND IT · FULL VERDICT = ANALYZE IT
 *
 * This is NOT a second trailer subsystem. `TrailerMedia` still owns the single
 * active player, the lazy resolve and the poster restore; all that lives here
 * is the decision of WHEN a pointer resting on a poster has said "show me",
 * kept pure so it can be unit-tested without a browser.
 *
 * Two separable pieces, because they fail in different ways:
 *
 *  1. `hoverPreviewAllowed` — may this pointer preview at all? A finger is not
 *     a pointer that can hover: touch devices synthesise a hover on tap, which
 *     would turn "open More Info" into "start a trailer". Reduced-motion and
 *     the user's autoplay preference are honoured here too, so one predicate
 *     answers the whole question and no caller can forget half of it.
 *
 *  2. `createHoverIntent` — the dwell. A pointer crossing a grid on its way
 *     somewhere else passes over four or five posters; only one that STAYS is
 *     asking for anything. Entering arms a timer, leaving disarms it, and
 *     re-entering while already previewing is deliberately a no-op so a hand
 *     resting with a tremor (or a mount-driven boundary event) cannot restart
 *     playback over and over.
 *
 * The timer functions are injected so tests drive them directly instead of
 * sleeping — a "wait 400ms and hope" test is exactly the kind that goes flaky
 * on a loaded CI box and then gets deleted.
 */

/**
 * The dwell before a hovered poster previews. The assignment's window is
 * 300–500ms; 380 sits in the middle — long enough that a pointer travelling
 * across the grid triggers nothing, short enough that a deliberate stop feels
 * like a response rather than a delay.
 */
export const HOVER_INTENT_MS = 380;

export interface HoverGate {
  /** `PointerEvent.pointerType` — only a real mouse/trackpad may preview. */
  pointerType: string;
  /** `(hover: hover) and (pointer: fine)` — the device can hover at all. */
  hoverCapable: boolean;
  /** `prefers-reduced-motion: reduce`. */
  reducedMotion: boolean;
  /** The user's own autoplay preference; a hover preview is still autoplay. */
  autoplayPref: 'on' | 'off';
}

/**
 * May a hover on this pointer, on this device, start a muted preview?
 *
 * `pointerType` and `hoverCapable` are both required and neither is redundant:
 * a hybrid laptop reports `(hover: hover)` and still delivers `pointerType:
 * 'touch'` for finger input, while a phone in desktop-mode emulation reports a
 * mouse pointer type on a device that cannot hover.
 */
export function hoverPreviewAllowed(gate: HoverGate): boolean {
  if (gate.pointerType !== 'mouse') return false;
  if (!gate.hoverCapable) return false;
  if (gate.reducedMotion) return false;
  if (gate.autoplayPref !== 'on') return false;
  return true;
}

type TimeoutId = ReturnType<typeof setTimeout>;

export interface HoverIntentOptions {
  /** Dwell before firing. Defaults to `HOVER_INTENT_MS`. */
  intentMs?: number;
  /** Called once, after an uninterrupted dwell. */
  onFire: () => void;
  /** Injected for tests; defaults to the real timers. */
  schedule?: (fn: () => void, ms: number) => TimeoutId;
  cancel?: (id: TimeoutId) => void;
}

export interface HoverIntent {
  /** Pointer entered the poster. Arms the dwell (no-op if already armed or previewing). */
  enter(): void;
  /** Pointer left the poster. Disarms the dwell and clears the previewing flag. */
  leave(): void;
  /** Tear down on unmount / route change. Never fires after this. */
  dispose(): void;
  /** True between `enter()` and the dwell elapsing. */
  readonly armed: boolean;
  /** True once `onFire` has run, until `leave()`/`dispose()`. */
  readonly previewing: boolean;
}

/**
 * A one-shot dwell timer with the jitter and teardown rules baked in.
 *
 * Deliberately NOT a global timer keyed by card id: a module-level `setTimeout`
 * shared across a grid is the fragile pattern the assignment rules out — it
 * outlives the component that armed it, so an unmounted card can still fire.
 * Each card owns its own instance and disposes it in its own cleanup, which
 * makes "unmount cancels the pending preview" true by construction rather than
 * by remembering to clear the right key.
 */
export function createHoverIntent({
  intentMs = HOVER_INTENT_MS,
  onFire,
  schedule = setTimeout,
  cancel = clearTimeout,
}: HoverIntentOptions): HoverIntent {
  let timer: TimeoutId | null = null;
  let previewing = false;
  let disposed = false;

  const disarm = () => {
    if (timer != null) {
      cancel(timer);
      timer = null;
    }
  };

  return {
    enter() {
      // Already showing, already counting down, or torn down: entering again
      // must not restart anything. This is the jitter guard — a pointer that
      // wobbles inside the poster, or a boundary event synthesised when the
      // player mounts under the cursor, has not asked for a new preview.
      if (disposed || previewing || timer != null) return;
      timer = schedule(() => {
        timer = null;
        if (disposed) return;
        previewing = true;
        onFire();
      }, intentMs);
    },
    leave() {
      disarm();
      previewing = false;
    },
    dispose() {
      disposed = true;
      disarm();
      previewing = false;
    },
    get armed() {
      return timer != null;
    },
    get previewing() {
      return previewing;
    },
  };
}
