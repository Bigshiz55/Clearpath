'use client';

import { useState } from 'react';
import { QuickLook } from './QuickLook';
import type { MediaType } from '@/lib/types';

/**
 * MORE INFO — the card's door to the big experience.
 *
 * The browse card is deliberately bounded (see PosterCard): poster, title,
 * metadata, score, one reason, availability, actions. Everything that used to
 * make it 763px tall — the full synopsis, every "why it fits", the cautions,
 * the source ratings, the complete availability with its live re-check, the
 * cast, the Taste DNA explanation — lives behind this button, in a surface
 * that has room for it.
 *
 * A separate client component so PosterCard itself stays server-renderable:
 * nine surfaces mount PosterCard, several of them from server pages that pass
 * JSX into `evidence`, and turning the whole card into a client component to
 * hold one `useState` would drag all of that across the boundary.
 */
export function MoreInfoButton({
  tmdbId,
  mediaType,
  title,
  year = null,
  posterPath = null,
  variant = 'button',
  className = '',
}: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year?: number | null;
  posterPath?: string | null;
  /**
   * `chip` is the browse card's placement: a small control ON the artwork,
   * opposite the ▶ Trailer affordance. It is there rather than in the decision
   * row because four 44px controls do not fit across a 272px grid column — the
   * row wrapped and cost the card 56px. `button` is the ordinary in-row form
   * for surfaces with the width for it.
   */
  variant?: 'button' | 'chip';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // 44px ON BOTH AXES. A control on artwork is still a control, and the floor
  // is a box, not a height: collapsed to its glyph in a narrow frame this chip
  // measured 31×36 and failed the tap-target sweep at all twelve viewports.
  const chip =
    'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-full bg-black/60 px-2.5 text-[11px] font-bold text-white backdrop-blur transition hover:bg-black/80';
  const plain =
    'inline-flex min-h-[44px] items-center rounded-xl border border-white/12 bg-white/5 px-3 text-[12px] font-bold text-slate-200 transition hover:border-white/25 hover:bg-white/10';
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // On the artwork this button is a sibling of the card's own click
          // target, not a child of it — but the card wrapper may still carry a
          // handler, and opening the modal must never also navigate.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        data-testid="card-more-info"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`More info about ${title}`}
        className={`${variant === 'chip' ? chip : plain} ${className}`}
      >
        {variant === 'chip' && <span aria-hidden>ⓘ</span>}
        {/* See TrailerMedia's ▶ chip: below a 220px media frame the two chips
            collide, so both drop their label and keep their glyph. The
            accessible name is on the button, not in this span. */}
        <span className={variant === 'chip' ? 'wv-chip-label' : ''}>
          {variant === 'chip' ? 'Info' : 'More info'}
        </span>
      </button>
      {open && (
        <QuickLook
          target={{ id: tmdbId, mediaType, title, year, posterPath }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
