'use client';

/**
 * WHAT THE THING IS ABOUT.
 *
 * A card was a poster, a title and a number. Judging from the artwork alone is
 * exactly what someone asked not to have to do, and it is the one question
 * every other service answers on the tile.
 *
 * It reads from the same per-title fetch the ratings strip already makes, so a
 * synopsis costs a grid nothing extra. When TMDB has no synopsis it renders NO
 * TEXT — an empty line is honest, a generated one would not be.
 *
 * BUT IT ALWAYS RESERVES ITS HEIGHT. This used to render nothing at all until
 * the text arrived, on the reasoning that "a card that jumps once the text
 * lands is worse than one that grows" — which has it exactly backwards.
 * Growing IS the jump. Every card in the grid gained two lines a few hundred
 * milliseconds after paint, so the row below it dropped ~54px while you were
 * reaching for a button. Measured: paint→settled moved every card in the
 * second row by 54px.
 *
 * So the space is claimed from the first frame and the text fills into it. A
 * gap on the handful of titles TMDB has no synopsis for is a fixed cost paid
 * once at layout; a moving grid is a cost paid on every tap.
 */
import { useEffect, useState } from 'react';
import { loadTileFacts } from '@/lib/tileFacts';
import type { MediaType } from '@/lib/types';

export function CardSynopsis({
  mediaType,
  tmdbId,
  /** Lines before the clamp. Three on a wide row, two in a narrow grid cell. */
  lines = 3,
  className = '',
}: {
  mediaType: MediaType;
  tmdbId: number;
  lines?: 2 | 3;
  className?: string;
}) {
  const [overview, setOverview] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    loadTileFacts(mediaType, tmdbId).then((f) => active && setOverview(f.overview));
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  // 13px at leading-relaxed is ~21px a line. The reservation is the clamp
  // height exactly, so text arriving changes nothing about the layout.
  const reserve = lines === 2 ? 'min-h-[2.65rem]' : 'min-h-[3.95rem]';

  // No synopsis (or not yet): hold the space, render no words. There is
  // deliberately no `card-synopsis` testid here — an empty box is not a
  // synopsis, and nothing should be able to mistake it for one.
  // The toggle's row is reserved WHETHER OR NOT there is a toggle. It is 18px,
  // and a control that appears only on some titles, a few hundred milliseconds
  // after paint, is the same "everything moved under my thumb" defect as text
  // arriving into no reserved space.
  const toggleRow = 'h-[18px]';

  // The placeholder mirrors the loaded structure exactly — text box AND toggle
  // row. Padding on a single box does not work here: `box-sizing: border-box`
  // means `min-h` swallows it, so the reservation came out 18px short and every
  // card grew by that the moment its synopsis landed.
  if (!overview) {
    return (
      <div aria-hidden className={className}>
        <div className={reserve} />
        <div className={toggleRow} />
      </div>
    );
  }

  // "More" ONLY WHEN THERE IS MORE.
  //
  // A synopsis is context for a decision, not the decision — three lines is the
  // budget, and the rest is available on request rather than taking the card
  // over. The control appears only for the titles whose text actually runs
  // past the clamp; a "More" that expands onto nothing is worse than none, so
  // the estimate is deliberately conservative (~54 characters a line at the
  // card's own width, three lines).
  const clamped = lines === 2 ? 2 : 3;
  const hasMore = overview.length > clamped * 54;

  return (
    <div className={className}>
      <p
        data-testid="card-synopsis"
        className={`${open ? '' : `${reserve} ${clamped === 2 ? 'line-clamp-2' : 'line-clamp-3'}`} text-[13px] leading-relaxed text-slate-400`}
      >
        {overview}
      </p>
      <div className={`${toggleRow} flex items-start`}>
        {hasMore && (
          <button
            type="button"
            data-testid="synopsis-more"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="text-[11px] font-bold uppercase leading-[18px] tracking-wide text-slate-400 transition hover:text-white"
          >
            {open ? 'Less' : 'More'}
          </button>
        )}
      </div>
    </div>
  );
}
