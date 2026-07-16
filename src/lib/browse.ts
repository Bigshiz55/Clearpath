import 'server-only';
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType } from '@/lib/types';
import { discoverTitles, getProviderCatalog, type ProviderCatalogEntry } from '@/lib/tmdb/client';
import { getProfile, regionFor } from '@/lib/profile';

export type BrowseMonetization = 'all' | 'flatrate' | 'free' | 'rent' | 'buy';
export type BrowseSort = 'popularity' | 'rating' | 'new';

export interface BrowseQuery {
  mediaType: MediaType;
  providerIds: number[];
  genreIds: number[];
  monetization: BrowseMonetization;
  minRating: number | null; // TMDB vote average 0..10
  sort: BrowseSort;
  page: number;
}

export interface BrowseItem {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
}

function monetizationParam(m: BrowseMonetization, hasProviders: boolean): string | undefined {
  switch (m) {
    case 'flatrate':
      return 'flatrate';
    case 'free':
      return 'free|ads';
    case 'rent':
      return 'rent';
    case 'buy':
      return 'buy';
    case 'all':
    default:
      // With a provider filter, "all" means every way it's offered there.
      return hasProviders ? 'flatrate|free|ads|rent|buy' : undefined;
  }
}

function sortParam(sort: BrowseSort, mediaType: MediaType): string {
  if (sort === 'rating') return 'vote_average.desc';
  if (sort === 'new') return mediaType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
  return 'popularity.desc';
}

/** JustWatch-style catalog browse — every streamable title, filtered by service,
 *  type, genre, price, and rating, region-aware. Real TMDB rows only. */
export async function getBrowse(supabase: SupabaseClient, userId: string, q: BrowseQuery): Promise<BrowseItem[]> {
  const profile = userId ? await getProfile(supabase, userId) : null;
  const region = regionFor(profile);
  const hasProviders = q.providerIds.length > 0;

  const items = await discoverTitles(q.mediaType, {
    region,
    genreIds: q.genreIds,
    providerIds: hasProviders ? q.providerIds : undefined,
    monetization: monetizationParam(q.monetization, hasProviders),
    minRating: q.minRating ?? undefined,
    // Ratings sort needs a vote floor so a 10/10-from-3-votes doesn't win.
    minVotes: q.sort === 'rating' ? 150 : 20,
    sortBy: sortParam(q.sort, q.mediaType),
    page: Math.max(1, Math.min(q.page, 500)),
  });

  return items.map((t) => ({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath }));
}

/** Cached full provider catalog for a region — the breadth of services to filter by. */
export function getBrowseProviders(region: string): Promise<ProviderCatalogEntry[]> {
  return unstable_cache(() => getProviderCatalog(region), ['provider-catalog', region], {
    revalidate: 60 * 60 * 24,
    tags: [`provider-catalog:${region}`],
  })();
}
