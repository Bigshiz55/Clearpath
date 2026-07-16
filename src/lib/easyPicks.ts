import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runFinder, type FinderQuery } from '@/lib/finder';
import { EMPTY_QUERY } from '@/lib/finderParse';
import { getMyServices } from '@/lib/profile';
import { tmdbImage } from '@/lib/tmdb/image';
import type { MediaType } from '@/lib/types';
import type { TileRatings } from '@/lib/ratings';

export type EasyAudience = 'me' | 'partner' | 'family';

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
  ratings: TileRatings;
}

// Family genres only — Family + Animation + Adventure — so "the whole family"
// never surfaces horror or other clearly-adult fare.
const FAMILY_GENRES = [10751, 16, 12];

/**
 * Three picks for tonight — the whole point of Easy Mode. Reuses the same
 * deterministic verdict engine as the rest of the app, tuned to the audience,
 * and prefers things watchable on the user's own services. Returns at most 3.
 */
export async function getEasyPicks(supabase: SupabaseClient, userId: string, audience: EasyAudience): Promise<EasyPick[]> {
  if (!userId) return [];
  const services = await getMyServices(supabase, userId);

  const query: FinderQuery = {
    ...EMPTY_QUERY,
    genreIds: audience === 'family' ? FAMILY_GENRES : [],
    onMyServices: services.length > 0, // prefer things they can actually watch now
    minMatch: null,
  };

  const res = await runFinder(supabase, userId, query);
  return res.items.slice(0, 3).map((i) => ({
    id: i.id,
    mediaType: i.mediaType,
    title: i.title,
    year: i.year,
    posterUrl: tmdbImage(i.posterPath, 'w500'),
    primaryCall: i.primaryCall,
    matchScore: i.matchScore,
    reason: i.reason,
    where: i.where,
    ratings: i.ratings,
  }));
}
