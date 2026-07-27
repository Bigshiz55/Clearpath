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
  if (!overview) return <div aria-hidden className={`${reserve} ${className}`} />;

  return (
    <p
      data-testid="card-synopsis"
      className={`${reserve} ${lines === 2 ? 'line-clamp-2' : 'line-clamp-3'} text-[13px] leading-relaxed text-slate-400 ${className}`}
    >
      {overview}
    </p>
  );
}
