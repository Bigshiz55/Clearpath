// Client-safe TMDB image helpers. No secrets, no server-only imports — safe to
// use from client components.

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export type TmdbImageSize = 'w92' | 'w185' | 'w342' | 'w500' | 'w780' | 'original';

export function tmdbImage(path: string | null, size: TmdbImageSize = 'w342'): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}
