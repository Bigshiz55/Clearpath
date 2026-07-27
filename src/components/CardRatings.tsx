'use client';

import { useEffect, useState } from 'react';
import { RatingsStrip } from './RatingsStrip';
import { EMPTY_TILE_RATINGS, type TileRatings } from '@/lib/ratings';
import { loadTileFacts } from '@/lib/tileFacts';
import type { MediaType } from '@/lib/types';

// The per-title fetch cache moved to `@/lib/tileFacts` — the synopsis line reads
// from the same response, and two consumers must not mean two requests.

/** Drop-in ratings row that hydrates itself from the cached ratings endpoint —
 *  so any card can show real ratings without its list query fetching them. */
export function CardRatings({
  tmdbId,
  mediaType,
  title,
  year,
  hideCall = false,
  className = '',
}: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year?: number | null;
  hideCall?: boolean;
  className?: string;
}) {
  const [ratings, setRatings] = useState<TileRatings | null>(null);

  useEffect(() => {
    let active = true;
    loadTileFacts(mediaType, tmdbId).then((f) => active && setRatings(f.ratings));
    return () => {
      active = false;
    };
  }, [mediaType, tmdbId]);

  return (
    <RatingsStrip
      ratings={ratings ?? EMPTY_TILE_RATINGS}
      title={title}
      year={year}
      mediaType={mediaType}
      tmdbId={tmdbId}
      hideCall={hideCall}
      loading={ratings == null}
      className={className}
    />
  );
}
