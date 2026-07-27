'use client';

/**
 * WHAT THE THING IS ABOUT.
 *
 * A card was a poster, a title and a number. Judging from the artwork alone is
 * exactly what someone asked not to have to do, and it is the one question
 * every other service answers on the tile.
 *
 * It reads from the same per-title fetch the ratings strip already makes, so a
 * synopsis costs a grid nothing extra. When TMDB has no synopsis it renders
 * NOTHING — an empty line is honest, a generated one would not be. It also
 * renders nothing while loading rather than reserving a grey block, because a
 * card that jumps once the text lands is worse than one that grows.
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

  if (!overview) return null;

  return (
    <p
      data-testid="card-synopsis"
      className={`${lines === 2 ? 'line-clamp-2' : 'line-clamp-3'} text-[13px] leading-relaxed text-slate-400 ${className}`}
    >
      {overview}
    </p>
  );
}
