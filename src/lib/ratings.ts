// Client-safe helpers for putting real ratings on a tile "plaque". We only ever
// surface numbers we actually have — TMDB audience, Rotten Tomatoes critics,
// IMDb, Metacritic — plus our own Standard Score. Decider has no public data
// feed, so it can only ever be an outbound link, never a fabricated score.
import type { WatchVerdictScore } from '@/lib/types';

export interface TileRatings {
  standardScore: number | null; // our blended 0..100
  audience: number | null; // TMDB audience %
  rtAudience: number | null; // Rotten Tomatoes audience / Popcorn %
  tomatometer: number | null; // Rotten Tomatoes critics %
  imdb: number | null; // 0..10
  metacritic: number | null; // 0..100
}

export const EMPTY_TILE_RATINGS: TileRatings = {
  standardScore: null,
  audience: null,
  rtAudience: null,
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
    rtAudience: find('RT Audience')?.value ?? null,
    tomatometer: find('Rotten Tomatoes')?.value ?? null,
    imdb: imdb?.value != null ? Math.round(imdb.value) / 10 : null,
    metacritic: find('Metacritic')?.value ?? null,
  };
}

/**
 * A valid, displayable IMDb rating (1..10) or `null`. Treats null, undefined,
 * empty string, 0, negatives, NaN/non-finite, "N/A", and dashes as MISSING — so a
 * card NEVER renders "IMDb —", "IMDb 0.0", an empty badge, or reserved blank space.
 * We never fabricate a value; missing simply hides the element.
 */
export function imdbScore(raw: unknown): number | null {
  if (raw == null) return null;
  let n: number;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string') {
    const t = raw.trim().toLowerCase();
    if (t === '' || t === '-' || t === '–' || t === '—' || t === 'n/a' || t === 'na' || t === 'null' || t === 'undefined') return null;
    n = Number.parseFloat(t);
  } else return null;
  if (!Number.isFinite(n) || n <= 0 || n > 10) return null;
  return n;
}

/**
 * A valid percentage 0..100 (0 IS meaningful for a critics/audience score) or
 * `null`. Rejects NaN/non-finite/out-of-range so a broken value never renders.
 */
export function pctScore(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseFloat(raw.trim()) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n);
}

export function hasAnyRating(r: TileRatings): boolean {
  return (
    r.standardScore != null ||
    r.audience != null ||
    r.rtAudience != null ||
    r.tomatometer != null ||
    r.imdb != null ||
    r.metacritic != null
  );
}

/** An honest outbound link to Decider's coverage of a title (a search — they
 *  have no API, so we never claim their verdict, only point to it). */
export function deciderSearchUrl(title: string, year?: number | null): string {
  const q = year ? `${title} ${year}` : title;
  return `https://decider.com/?s=${encodeURIComponent(q)}`;
}
