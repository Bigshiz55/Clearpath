'use client';

import { useEffect, useState } from 'react';
import { RatingsStrip } from './RatingsStrip';
import { EMPTY_TILE_RATINGS, type TileRatings } from '@/lib/ratings';
import type { MediaType } from '@/lib/types';

// Dedupe across every card on the page (and across renders): one in-flight fetch
// per title, shared. The endpoint is CDN-cached too, so grids stay cheap.
const cache = new Map<string, Promise<TileRatings>>();

function load(mediaType: MediaType, tmdbId: number): Promise<TileRatings> {
  const key = `${mediaType}:${tmdbId}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/ratings/${mediaType}/${tmdbId}`)
      .then((r) => r.json())
      .then((d) => (d?.ratings as TileRatings) ?? EMPTY_TILE_RATINGS)
      .catch(() => EMPTY_TILE_RATINGS);
    cache.set(key, p);
  }
  return p;
}

/** Drop-in ratings row that hydrates itself from the cached ratings endpoint —
 *  so any card can show real ratings without its list query fetching them. */
export function CardRatings({
  tmdbId,
  mediaType,
  title,
  year,
  decider = true,
  hideCall = false,
  className = '',
}: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  year?: number | null;
  decider?: boolean;
  hideCall?: boolean;
  className?: string;
}) {
  const [ratings, setRatings] = useState<TileRatings | null>(null);

  useEffect(() => {
    let active = true;
    load(mediaType, tmdbId).then((r) => active && setRatings(r));
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
      decider={decider}
      hideCall={hideCall}
      loading={ratings == null}
      className={className}
    />
  );
}
