'use client';

import { useState } from 'react';
import Link from 'next/link';
import { QuickLook, type QuickLookTarget } from './QuickLook';
import { stopAllTrailerPlayback } from './trailer/TrailerMedia';

/**
 * CLICK = UNDERSTAND IT.
 *
 * The card's poster and title used to navigate straight to the full title
 * page. That is a departure from the results — the grid unmounts, the scroll
 * position goes, and getting back means the browser's Back button and a
 * re-render. The interaction model is that clicking a card EXPANDS it: More
 * Info opens over the results, and closing puts you exactly where you were.
 *
 * WHY THIS IS STILL AN `<a href>` AND NOT A BUTTON.
 *
 * Only the PLAIN left click is intercepted. Cmd/Ctrl-click, middle-click,
 * shift-click and "open in new tab" keep working and go to the real page,
 * because the destination is a genuine URL and taking that away to win a modal
 * is a bad trade. It also means the card is keyboard-reachable and
 * screen-reader-announced as a link to the title, with Enter opening More Info
 * exactly as a click does — no `tabIndex`/`role`/`onKeyDown` reimplementation
 * of something the platform already gets right.
 *
 * PosterCard cannot own this state itself: it has no `'use client'` directive
 * and is rendered inside server components, so the interactive part lives here
 * and the card stays server-renderable.
 *
 * Interactive children (Trailer, FOR, AGAINST, SAVE, the W) are SIBLINGS of
 * this link in PosterCard, never descendants, so they cannot bubble into it.
 */
export function MoreInfoLink({
  href,
  target,
  className = '',
  children,
  label,
}: {
  /** The title's real page. When absent — some grids carry no URL — the
   *  control degrades to a button: a card must be understandable on click
   *  whether or not there is somewhere else to send you. */
  href?: string;
  target: QuickLookTarget;
  className?: string;
  children: React.ReactNode;
  /** Distinct from the trailer control's label — screen readers must be able
   *  to tell "understand this" apart from "play this". */
  label: string;
}) {
  const [open, setOpen] = useState(false);

  /**
   * Opening More Info ends any hover preview underneath it.
   *
   * The dialog appears under a stationary cursor, and a cursor that does not
   * move fires no boundary event — so the card's own pointer-leave cannot be
   * relied on here. Without this, a muted trailer would keep playing behind
   * the dialog it was covered by. Stated explicitly rather than inferred.
   */
  const openMoreInfo = () => {
    stopAllTrailerPlayback();
    setOpen(true);
  };

  return (
    <>
      {href ? (
      <Link
        href={href}
        className={className}
        aria-label={label}
        data-testid="more-info-open"
        onClick={(e) => {
          // Let the browser do its normal thing for anything that is not a
          // plain primary click — new tab, new window, download modifiers.
          if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          openMoreInfo();
        }}
      >
        {children}
      </Link>
      ) : (
        <button
          type="button"
          className={`${className} text-left`}
          aria-label={label}
          data-testid="more-info-open"
          onClick={openMoreInfo}
        >
          {children}
        </button>
      )}
      {open && <QuickLook target={target} onClose={() => setOpen(false)} />}
    </>
  );
}
