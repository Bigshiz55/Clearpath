// Client-safe Easy Mode types and constants (no server-only imports) so both the
// UI components and the server pick engine can share them.
import type { MediaType } from '@/lib/types';
import type { TileRatings } from '@/lib/ratings';

export type EasyAudience = 'me' | 'partner' | 'family';
export type EasyEra = 'any' | 'y2020s' | 'y2000s' | 'y80s90s' | 'y60s70s' | 'ypre60';
export type EasyContent = 'any' | 'mild' | 'clean' | 'family';

export const EASY_ERAS: EasyEra[] = ['any', 'y2020s', 'y2000s', 'y80s90s', 'y60s70s', 'ypre60'];
export const EASY_CONTENT: EasyContent[] = ['any', 'mild', 'clean', 'family'];

export interface EasyPrefs {
  audience: EasyAudience;
  /** Movies only, shows only, or both. */
  mediaType: 'any' | 'movie' | 'tv';
  /** Max runtime in minutes, or null for any length. */
  maxRuntime: number | null;
  /** How clean to keep it. */
  content: EasyContent;
  era: EasyEra;
  /** TMDB person ids the user loves — biases picks toward their films. */
  actorIds: number[];
  /** Tonight's mood — TMDB genre ids from the quiz (not saved long-term). */
  moodGenres?: number[];
  /** "type-id" keys the user waved off — never show these again. */
  excludeKeys: string[];
}

export interface EasyPick {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterUrl: string | null;
  primaryCall: string;
  matchScore: number;
  reason: string;
  where: string | null;
  featuresFavorite: boolean;
  ratings: TileRatings;
}

export const DEFAULT_PREFS: EasyPrefs = {
  audience: 'me',
  mediaType: 'any',
  maxRuntime: null,
  content: 'any',
  era: 'any',
  actorIds: [],
  moodGenres: [],
  excludeKeys: [],
};
