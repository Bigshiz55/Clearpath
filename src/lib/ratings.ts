// Client-safe helpers for putting real ratings on a tile "plaque". We only ever
// surface numbers we actually have — TMDB audience, Rotten Tomatoes critics,
// IMDb, Metacritic — plus our own Standard Score. Decider has no public data
// feed, so it can only ever be an outbound link, never a fabricated score.
import type { WatchVerdictScore } from '@/lib/types';

export interface TileRatings {
  standardScore: number | null; // our blended 0..100
  audience: number | null; // TMDB audience %
  tomatometer: number | null; // Rotten Tomatoes critics %
  imdb: number | null; // 0..10
  metacritic: number | null; // 0..100
}

export const EMPTY_TILE_RATINGS: TileRatings = {
  standardScore: null,
  audience: null,
  tomatometer: null,
  imdb: null,
  metacritic: null,
};

/** Pull the tile-facing ratings out of a computed general score. */
export function tileRatingsFromScore(general: WatchVerdictScore): TileRatings {
  const find = (name: string) => general.sources.find((s) => s.name === name && s.available);
  const imdb = find('IMDb');
  return {
    standardScore: general.standardScore ?? general.score ?? null,
    audience: find('TMDB Audience')?.value ?? null,
    tomatometer: find('Rotten Tomatoes')?.value ?? null,
    imdb: imdb?.value != null ? Math.round(imdb.value) / 10 : null,
    metacritic: find('Metacritic')?.value ?? null,
  };
}

export function hasAnyRating(r: TileRatings): boolean {
  return r.standardScore != null || r.audience != null || r.tomatometer != null || r.imdb != null || r.metacritic != null;
}

/** An honest outbound link to Decider's coverage of a title (a search — they
 *  have no API, so we never claim their verdict, only point to it). */
export function deciderSearchUrl(title: string, year?: number | null): string {
  const q = year ? `${title} ${year}` : title;
  return `https://decider.com/?s=${encodeURIComponent(q)}`;
}
