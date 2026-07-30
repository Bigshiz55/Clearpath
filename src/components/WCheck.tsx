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
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
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
  className = '',
}: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year?: number | null;
  posterUrl?: string | null;
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
  const isFirst = useRef(false);

  useEffect(() => {
    if (!coachClaimed) {
      coachClaimed = true;
      isFirst.current = true;
    }
    setDismissed(readFlag(DISMISS_KEY));
    setEverSelected(readFlag(EVER_KEY));
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
    ? coachFor({ selected: docket.length, everSelected, dismissed, isFirstOnPage: isFirst.current })
    : { step: 'none' as const, text: '' };

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

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        data-testid={`w-check-${tmdbId}`}
        aria-label={
          on
            ? `${title} — selected for the decision pool. Tap to remove.`
            : `${title} — add to decision pool`
        }
        title={on ? 'Selected — tap to remove from the decision pool' : 'Add to decision pool'}
        className={[
          // 44px, always, on every surface. Glass rather than a flat black
          // disc: it has to read against a bright poster and a dark one, and a
          // translucent fill with a ring does that without a hard outline.
          'absolute right-1.5 top-1.5 z-10 grid h-11 w-11 place-items-center rounded-full text-base font-black',
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
        {/* The W IDENTITY IS KEPT IN BOTH STATES. Selected adds a tick beside
            it rather than replacing it — swapping the glyph for a checkmark
            makes the selected control look like a different feature. */}
        <span aria-hidden className="relative leading-none">
          W
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
      {/* The pool is a running state, and a change to it has to be audible as
          well as visible — a screen-reader user gets no feedback at all from a
          fill colour changing on a button they just left. */}
      <span className="sr-only" role="status" data-testid="w-check-announce">
        {on ? `${title} added to the decision pool` : ''}
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
      {coach.step !== 'none' && !refused && (
        <span
          data-testid="w-coach"
          data-step={coach.step}
          /* ANCHORED LEFT, NOT RIGHT. The W sits at the poster's top-RIGHT, so
             a right-anchored panel grows leftward — and on a phone the poster
             is only ~140px wide inside a card that starts ~28px from the
             screen edge, which put a 216px panel at x = -48 and off the
             screen entirely. Growing rightward from the poster's left edge
             keeps it inside the card at every width; `max-w` is the belt to
             that braces on the narrowest phones. */
          className="absolute left-0 top-[3.25rem] z-20 w-[13.5rem] max-w-[min(13.5rem,72vw)] rounded-xl border border-[#ff1493]/50 bg-ink-950 p-2.5 text-left shadow-[0_12px_36px_-8px_rgba(0,0,0,0.9)]"
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
            className="mt-1.5 inline-flex min-h-[28px] items-center rounded-md px-1 text-[11px] font-bold text-slate-400 transition hover:text-white"
          >
            Got it
          </button>
        </span>
      )}
    </>
  );
}
