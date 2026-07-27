'use client';

/**
 * ONE FETCH PER TITLE, SHARED BY EVERY PART OF THE CARD.
 *
 * The ratings endpoint already hydrates a title's full metadata to compute the
 * scores, so its synopsis is sitting right there. Two components now want it —
 * the ratings strip and the synopsis line — and a grid of twenty cards must not
 * turn that into forty requests. So the in-flight promise cache that used to
 * live inside `CardRatings` moves here and is keyed by title, not by consumer.
 *
 * Everything degrades to empty rather than throwing: a card that cannot load
 * its facts still renders its poster and title.
 */
import { EMPTY_TILE_RATINGS, type TileRatings } from '@/lib/ratings';
import type { MediaType } from '@/lib/types';

export interface TileFacts {
  ratings: TileRatings;
  /** TMDB's own synopsis. Null when TMDB has none — never a placeholder. */
  overview: string | null;
}

const EMPTY: TileFacts = { ratings: EMPTY_TILE_RATINGS, overview: null };

const cache = new Map<string, Promise<TileFacts>>();

export function loadTileFacts(mediaType: MediaType, tmdbId: number): Promise<TileFacts> {
  const key = `${mediaType}:${tmdbId}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/ratings/${mediaType}/${tmdbId}`)
      .then((r) => r.json())
      .then((d) => ({
        ratings: (d?.ratings as TileRatings) ?? EMPTY_TILE_RATINGS,
        overview: typeof d?.overview === 'string' && d.overview.trim() ? (d.overview as string) : null,
      }))
      .catch(() => EMPTY);
    cache.set(key, p);
  }
  return p;
}
