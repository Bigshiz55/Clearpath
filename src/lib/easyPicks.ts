import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runFinder, type FinderQuery } from '@/lib/finder';
import { EMPTY_QUERY } from '@/lib/finderParse';
import { getMyServices } from '@/lib/profile';
import { tmdbImage } from '@/lib/tmdb/image';
import type { MediaType } from '@/lib/types';
import type { TileRatings } from '@/lib/ratings';

export type EasyAudience = 'me' | 'partner' | 'family';
export type EasyEra = 'any' | 'recent' | 'classic';

export interface EasyPrefs {
  audience: EasyAudience;
  /** Max runtime in minutes, or null for any length. */
  maxRuntime: number | null;
  /** Keep it family-safe (no mature content) regardless of audience. */
  familySafe: boolean;
  era: EasyEra;
  /** TMDB person ids the user loves — biases picks toward their films. */
  actorIds: number[];
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
  featuresFavorite: boolean; // contains one of the user's favorite actors
  ratings: TileRatings;
}

// Family genres only — Family + Animation + Adventure.
const FAMILY_GENRES = [10751, 16, 12];

export const DEFAULT_PREFS: EasyPrefs = {
  audience: 'me',
  maxRuntime: null,
  familySafe: false,
  era: 'any',
  actorIds: [],
  excludeKeys: [],
};

/**
 * Three picks for tonight — customizable and taste-aware. Every preference maps
 * onto the same deterministic verdict engine (runFinder), so the picks stay
 * honest and explainable. Favorite actors bias the candidate pool; era and
 * length constrain it; the family/content-safe flag keeps it appropriate.
 */
export async function getEasyPicks(supabase: SupabaseClient, userId: string, prefs: EasyPrefs): Promise<EasyPick[]> {
  if (!userId) return [];
  const services = await getMyServices(supabase, userId);
  const familySafe = prefs.familySafe || prefs.audience === 'family';

  const query: FinderQuery = {
    ...EMPTY_QUERY,
    genreIds: familySafe ? FAMILY_GENRES : [],
    maxRuntime: prefs.maxRuntime,
    sinceMonths: prefs.era === 'recent' ? 120 : null,
    maxYear: prefs.era === 'classic' ? 1999 : null,
    onMyServices: services.length > 0,
    minMatch: null,
    castIds: prefs.actorIds.length > 0 ? prefs.actorIds : undefined,
  };

  const res = await runFinder(supabase, userId, query);
  const exclude = new Set(prefs.excludeKeys);

  return res.items
    .filter((i) => !exclude.has(`${i.mediaType}-${i.id}`))
    .slice(0, 3)
    .map((i) => ({
      id: i.id,
      mediaType: i.mediaType,
      title: i.title,
      year: i.year,
      posterUrl: tmdbImage(i.posterPath, 'w500'),
      primaryCall: i.primaryCall,
      matchScore: i.matchScore,
      reason: i.reason,
      where: i.where,
      // With actor filtering, movie candidates all contain a favorite (OR match).
      featuresFavorite: prefs.actorIds.length > 0 && i.mediaType === 'movie',
      ratings: i.ratings,
    }));
}
