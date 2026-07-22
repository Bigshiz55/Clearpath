// TMDB genre id map + the chip set the Finder exposes. Client-safe.

export const GENRE_IDS: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  reality: 10764, // TV-only TMDB genre
  'reality tv': 10764,
  'reality-tv': 10764,
  'science fiction': 878,
  'sci-fi': 878,
  scifi: 878,
  thriller: 53,
  war: 10752,
  western: 37,
};

/** The chips shown in the Finder UI. */
export const GENRE_CHIPS: { key: string; label: string; id: number }[] = [
  { key: 'crime', label: 'Crime', id: 80 },
  { key: 'thriller', label: 'Thriller', id: 53 },
  { key: 'mystery', label: 'Mystery', id: 9648 },
  { key: 'drama', label: 'Drama', id: 18 },
  { key: 'comedy', label: 'Comedy', id: 35 },
  { key: 'action', label: 'Action', id: 28 },
  { key: 'scifi', label: 'Sci-Fi', id: 878 },
  { key: 'horror', label: 'Horror', id: 27 },
  { key: 'romance', label: 'Romance', id: 10749 },
  { key: 'reality', label: 'Reality TV', id: 10764 },
  { key: 'documentary', label: 'Documentary', id: 99 },
  { key: 'fantasy', label: 'Fantasy', id: 14 },
  { key: 'adventure', label: 'Adventure', id: 12 },
];

export function genreLabel(id: number): string {
  const hit = GENRE_CHIPS.find((g) => g.id === id);
  if (hit) return hit.label;
  const name = Object.entries(GENRE_IDS).find(([, v]) => v === id)?.[0];
  return name ? name.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Genre';
}

/** Resolve a free-text genre name to a TMDB id. */
export function genreIdFromName(name: string): number | null {
  return GENRE_IDS[name.trim().toLowerCase()] ?? null;
}
