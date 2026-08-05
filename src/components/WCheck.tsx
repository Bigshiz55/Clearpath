'use client';

/**
 * THE W — "put this in front of the judge".
 *
 * A fourth verb, and deliberately not a rename of any of the three that exist:
 *
 *   Save        → a watchlist. Someday.
 *   Not for me  → teaches your DNA. Never.
 *   For         → a reaction. I like this.
 *   W           → I am CONSIDERING this, right now, against the others.
 *
 * It lives on the poster rather than in the action row for two reasons: the row
 * is already three buttons wide and a fourth breaks at 320px, and the W has to
 * sit in the same place on every surface — grid, wall, guide, search — or it
 * stops reading as one consistent gesture.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Gavel } from 'lucide-react';
import {
  addToDocketStore,
  docketKey,
  getDocket,
  getDocketServerSnapshot,
  removeFromDocketStore,
  subscribeDocket,
} from '@/lib/docketStore';
import { coachFor, shouldRetire } from '@/lib/verdict/wOnboarding';
import type { MediaType } from '@/lib/types';

/**
 * ONE COACH MARK PER PAGE. A module-level claim, not React state: thirty
 * posters mount at once and each would otherwise decide it is the first. The
 * first to mount wins the right to coach and holds it for the page's life.
 */
let coachClaimed = false;
const DISMISS_KEY = 'wv.wcoach.dismissed.v1';
const EVER_KEY = 'wv.wcoach.everSelected.v1';
const PROGRESS_SHOWN_KEY = 'wv.wcoach.progressShown.v1';

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* private mode — the coach simply shows again next session */
  }
}

export function WCheck({
  tmdbId,
  mediaType,
  title,
  year = null,
  posterUrl = null,
  placement = 'poster',
  className = '',
}: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year?: number | null;
  posterUrl?: string | null;
  /**
   * WHERE THIS ONE SITS — the only thing that varies between surfaces.
   *
   * 'poster' is the established position and the default: pinned to the
   * artwork's top-right on every card, which is what makes it read as one
   * gesture across grid, wall, guide and search. 'inline' drops the absolute
   * positioning so it can stand in a normal action row — the full title
   * page, where there is no poster corner to pin to. Same size, same colours,
   * same behaviour; only `position` changes.
   */
  placement?: 'poster' | 'inline';
  className?: string;
}) {
  const docket = useSyncExternalStore(subscribeDocket, getDocket, getDocketServerSnapshot);
  const [refused, setRefused] = useState<string | null>(null);
  const key = docketKey(mediaType as 'movie' | 'tv', tmdbId);
  const on = docket.some((e) => e.key === key);

  // ONBOARDING. Client-only and after mount, so the server render (which has
  // no localStorage and no docket) is identical for everyone and hydration
  // cannot mismatch.
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [everSelected, setEverSelected] = useState(true);
  const [progressShown, setProgressShown] = useState(true); // persisted at mount only — see below
  const isFirst = useRef(false);

  useEffect(() => {
    if (!coachClaimed) {
      coachClaimed = true;
      isFirst.current = true;
    }
    setDismissed(readFlag(DISMISS_KEY));
    setEverSelected(readFlag(EVER_KEY));
    setProgressShown(readFlag(PROGRESS_SHOWN_KEY));
    setMounted(true);
  }, []);

  // Retire the coach for good once a full docket has been assembled — at that
  // point the feature is demonstrably understood, and repeating it is nagging.
  useEffect(() => {
    if (mounted && !dismissed && shouldRetire(docket.length)) {
      writeFlag(DISMISS_KEY);
      setDismissed(true);
    }
  }, [mounted, dismissed, docket.length]);

  const coach = mounted
    ? coachFor({ selected: docket.length, everSelected, dismissed, isFirstOnPage: isFirst.current, progressShown })
    : { step: 'none' as const, text: '' };

  /**
   * "SHOWN ONCE, EVER" HAS TO MEAN ONCE AND *READ*, NOT ONCE AND GONE.
   *
   * This used to `setProgressShown(true)` as well as persisting the flag —
   * which fed straight back into `coachFor` on the very next render and
   * unmounted the panel one commit after it appeared. The line that explains
   * what unlocks the gavel was therefore shown for a single frame and never
   * read by anyone. (It is what made two of the onboarding specs fail: the
   * element was gone before any assertion could reach it.)
   *
   * So: persist the flag once, so the line never returns in a LATER session —
   * but leave this session's state alone, so the line stays up until the user
   * dismisses it or reaches the minimum (`shouldRetire`).
   */
  const progressPersisted = useRef(false);
  useEffect(() => {
    if (mounted && coach.step === 'progress' && !progressPersisted.current) {
      progressPersisted.current = true;
      writeFlag(PROGRESS_SHOWN_KEY);
    }
  }, [mounted, coach.step]);

  /**
   * THE COACH MARK CANNOT LIVE INSIDE THE CARD, AND THAT IS THE WHOLE PROBLEM.
   *
   * The W is pinned to the artwork's top-right, and `.wv-card-art` is
   * `overflow-hidden` (it has to be — it clips the blurred matte and the
   * rounded corner). On a phone that box is ~103-126px wide, so a 216px panel
   * anchored inside it was CLIPPED to the poster's width: the first-run
   * instruction, cut in half, on the exact screen where a new visitor is least
   * sure what to do. Widening the panel or anchoring it left could not fix it;
   * no descendant of a clipping box can escape the box. Measured on the
   * shipped harness at 320/360/390: 216px of content in a 103-126px box, and
   * on the title page the same panel overran the placard's own
   * `overflow-hidden` header by 32px.
   *
   * So it is a portal on `document.body`, positioned from the button's own
   * rect in viewport coordinates. `fixed` follows the button on scroll via the
   * listeners below, and the clamp keeps all 216px on screen at 320px.
   */
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [coachPos, setCoachPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const coachOpen = mounted && coach.step !== 'none' && !refused;

  const placeCoach = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const width = Math.min(216, vw - 16);
    // Grows leftward from the control, then clamped into the viewport.
    const left = Math.max(8, Math.min(r.right - width, vw - width - 8));
    // Below the control by default; above it only if there is no room below,
    // so the panel never covers the thing it is pointing at.
    const ESTIMATED_H = 112;
    const below = r.bottom + 8;
    const top = below + ESTIMATED_H > vh ? Math.max(8, r.top - ESTIMATED_H - 8) : below;
    setCoachPos({ top, left, width });
  }, []);

  useEffect(() => {
    if (!coachOpen) {
      setCoachPos(null);
      return;
    }
    placeCoach();
    // `capture` so a scroll in any ancestor (a rail, the tray) repositions it,
    // not just the window.
    const onMove = () => placeCoach();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [coachOpen, coach.text, placeCoach]);

  function toggle(e: React.MouseEvent) {
    // These sit inside card links; a tap here is never a navigation.
    e.preventDefault();
    e.stopPropagation();
    setRefused(null);
    if (on) {
      removeFromDocketStore(key);
      return;
    }
    const res = addToDocketStore({
      key,
      tmdbId,
      mediaType: mediaType as 'movie' | 'tv',
      title,
      year,
      posterUrl,
    });
    if (!res.ok) {
      setRefused(res.message);
      window.setTimeout(() => setRefused(null), 3500);
      return;
    }
    if (!everSelected) {
      writeFlag(EVER_KEY);
      setEverSelected(true);
    }
  }

  const body = (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-pressed={on}
        data-testid={`w-check-${tmdbId}`}
        aria-label={
          on
            ? `${title} — on your docket. Tap to remove.`
            : `${title} — add to your docket`
        }
        title={on ? 'On your docket — tap to remove' : 'Add to your docket'}
        className={[
          // 44px, always, on every surface. Glass rather than a flat black
          // disc: it has to read against a bright poster and a dark one, and a
          // translucent fill with a ring does that without a hard outline.
          placement === 'poster' ? 'absolute right-1.5 top-1.5 z-10' : 'relative',
          'grid h-11 w-11 place-items-center rounded-full',
          'transition duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/60',
          'active:scale-95 disabled:cursor-not-allowed disabled:opacity-50',
          on
            // SELECTED. Brand fill AND a ring AND a tick — never colour alone,
            // because a selected state that only differs by hue is invisible to
            // a good share of the people using it.
            ? 'bg-[#ff1493] text-white ring-2 ring-pink-100/90 shadow-[0_2px_10px_-2px_rgba(255,20,147,0.9)]'
            : 'bg-black/55 text-white/90 ring-1 ring-white/45 backdrop-blur-sm hover:bg-black/70 hover:ring-white/80',
          className,
        ].join(' ')}
      >
        {/* THE GAVEL ICON IS THE IDENTITY IN BOTH STATES. Selected adds a tick
            beside it rather than replacing it — swapping the icon for a
            checkmark makes the selected control look like a different
            feature. */}
        <span aria-hidden className="relative leading-none">
          <Gavel className="h-5 w-5" strokeWidth={2.25} />
          {on && (
            <svg
              viewBox="0 0 24 24"
              data-testid="w-check-tick"
              className="absolute -right-2.5 -top-2 h-3.5 w-3.5 rounded-full bg-white p-[1px] text-[#ff1493]"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 13 4 4L19 7" />
            </svg>
          )}
        </span>
      </button>
      {/* The docket is a running state, and a change to it has to be audible
          as well as visible — a screen-reader user gets no feedback at all
          from a fill colour changing on a button they just left. */}
      <span className="sr-only" role="status" data-testid="w-check-announce">
        {on ? `${title} added to your docket` : ''}
      </span>
      {refused && (
        <span
          role="status"
          data-testid="w-check-refused"
          className="absolute inset-x-1 top-14 z-10 rounded-lg bg-black/90 px-2 py-1.5 text-[11px] font-semibold leading-tight text-amber-200"
        >
          {refused}
        </span>
      )}

      {/* THE COACH MARK. One per page, and only until the user has shown they
          understand: "what is this" before the first-ever selection, then "how
          many more unlock the gavel" until the docket is full. Dismissible,
          and retired for good once a full docket has been assembled. */}
      {coachOpen && coachPos != null && typeof document !== 'undefined' && createPortal(
        <span
          data-testid="w-coach"
          data-step={coach.step}
          /* FIXED, ON THE BODY. See placeCoach above: every ancestor that
             could host this panel clips it. Position comes from the button's
             own rect, clamped into the viewport, so it is fully visible and
             fully tappable at 320px.

             AND IT NEVER EATS A TAP IT WAS NOT GIVEN. Floating free of the
             card, the panel can land over a search result or the next poster —
             and it did: every "open the title" click in search-to-title
             started failing with "w-coach intercepts pointer events". A coach
             mark is advice, not a modal. The panel is transparent to the
             pointer and only its own "Got it" takes clicks back, so whatever
             is underneath still receives the tap and the coach disappears with
             the screen it was explaining. */
          style={{
            position: 'fixed',
            top: coachPos.top,
            left: coachPos.left,
            width: coachPos.width,
            pointerEvents: 'none',
          }}
          className="z-[60] rounded-xl border border-[#ff1493]/50 bg-ink-950 p-2.5 text-left shadow-[0_12px_36px_-8px_rgba(0,0,0,0.9)]"
        >
          <span className="block text-[11px] font-semibold leading-snug text-slate-100">{coach.text}</span>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              writeFlag(DISMISS_KEY);
              setDismissed(true);
            }}
            data-testid="w-coach-dismiss"
            // The ONE part of the panel that takes clicks back (the panel
            // itself is pointer-events: none — see above).
            style={{ pointerEvents: 'auto' }}
            // 44px minimum. This is the dismiss for the coach a brand-new
            // visitor sees, so it was the smallest tap target in the product on
            // the exact screen where a first-time user is least sure what to do.
            // It was 43x28 and failed the 44px floor at every viewport.
            className="mt-1.5 inline-flex min-h-[44px] items-center rounded-md px-2 text-[11px] font-bold text-slate-400 transition hover:text-white"
          >
            Got it
          </button>
        </span>,
        document.body,
      )}
    </>
  );

  // ON A POSTER the button is already absolutely positioned, so the refusal
  // toast anchors to the artwork. INLINE there is no such anchor — without a
  // positioned wrapper it would hang off whatever ancestor happened to be
  // positioned, which on the title page is the page. (The coach mark no
  // longer depends on either: it is a portal, see placeCoach.)
  return placement === 'inline' ? <span className="relative inline-flex">{body}</span> : body;
}
