import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType, WatchProvider } from '@/lib/types';
import { getScoringData } from '@/lib/titleData';
import { buildVerdict } from '@/lib/scoring';
import { getProfile, regionFor, getPersonalContext, getMyServices } from '@/lib/profile';
import { includedServiceNames } from '@/lib/services';
import { discoverTitles, getWatchProviders } from '@/lib/tmdb/client';
import { tmdbImage } from '@/lib/tmdb/image';
import { tileRatingsFromScore, type TileRatings } from '@/lib/ratings';

const FREE_TYPES: ReadonlySet<WatchProvider['type']> = new Set(['free', 'ads']);
// TMDB provider ids for the free, ad-supported services.
const FREE_SERVICE_IDS = [73, 300, 207, 613]; // Tubi, Pluto TV, Roku Channel, Amazon Freevee

export type WatchNowKind = 'mine' | 'free';

export interface WatchNowItem {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterUrl: string | null;
  posterPath: string | null;
  matchScore: number;
  primaryCall: string;
  kind: WatchNowKind; // on your services, or free
  where: string; // provider to show
  free: boolean; // watchable at no extra cost (your plan or an ad-free/free tier)
  ratings: TileRatings;
}

interface WatchlistRow {
  tmdb_id: number;
  media_type: string;
  title: string | null;
  poster_path: string | null;
  status: string;
}

const DONE = new Set(['watched', 'dropped']);
const MAX_SCORED = 24;

/**
 * "Ready to watch" — the JustWatch magic, but tied to YOUR list and YOUR verdict.
 * Takes the titles on the user's watchlist, checks each one's live availability,
 * and returns only the ones they can actually watch right now — on a service they
 * pay for, or free — ranked by how well it matches them. Real TMDB availability;
 * nothing invented.
 */
export async function getReadyToWatch(supabase: SupabaseClient, userId: string): Promise<WatchNowItem[]> {
  if (!userId) return [];
  const [profile, services, personal, wl] = await Promise.all([
    getProfile(supabase, userId),
    getMyServices(supabase, userId),
    getPersonalContext(supabase, userId, null),
    supabase
      .from('watchlist_items')
      .select('tmdb_id, media_type, title, poster_path, status')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(80),
  ]);
  const region = regionFor(profile);

  const rows = ((wl.data ?? []) as WatchlistRow[]).filter((r) => !DONE.has(r.status)).slice(0, 60);
  if (rows.length === 0) return [];

  // Phase 1 — cheap availability check (providers only) to find what's watchable
  // now, so we never run the heavy verdict scoring on titles we won't show.
  const checks = await Promise.all(
    rows.map(async (r) => {
      const mediaType: MediaType = r.media_type === 'tv' ? 'tv' : 'movie';
      const providers = await getWatchProviders(mediaType, r.tmdb_id, region).catch(() => null);
      const opts = providers?.options ?? [];
      const mine = services.length > 0 ? includedServiceNames(opts, services) : [];
      const freeOpts = opts.filter((o) => FREE_TYPES.has(o.type));
      if (mine.length > 0) return { r, mediaType, kind: 'mine' as WatchNowKind, where: mine[0]! };
      if (freeOpts.length > 0) return { r, mediaType, kind: 'free' as WatchNowKind, where: freeOpts[0]!.providerName };
      return null;
    }),
  );
  const watchable = checks.filter((x): x is NonNullable<typeof x> => x !== null).slice(0, MAX_SCORED);

  // Phase 2 — score only the watchable titles for this user's taste.
  const scored = await Promise.all(
    watchable.map(async ({ r, mediaType, kind, where }) => {
      try {
        const { meta, providers } = await getScoringData(mediaType, r.tmdb_id, region);
        const report = buildVerdict({ meta, providers, personal: { ...personal, collectionId: null } });
        return {
          id: r.tmdb_id,
          mediaType,
          title: meta.title,
          year: meta.year,
          posterUrl: tmdbImage(meta.posterPath, 'w342'),
          posterPath: meta.posterPath,
          matchScore: report.personal.score,
          primaryCall: report.primaryCall,
          kind,
          where,
          free: true,
          ratings: tileRatingsFromScore(report.general),
        } as WatchNowItem;
      } catch {
        return null;
      }
    }),
  );

  const items = scored.filter((x): x is WatchNowItem => x !== null);
  // Your services first, then free; best match on top within each.
  const rank = (k: WatchNowKind) => (k === 'mine' ? 0 : 1);
  items.sort((a, b) => rank(a.kind) - rank(b.kind) || b.matchScore - a.matchScore);
  return items;
}

export interface FreeTitle {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
}

/**
 * Popular titles you can watch free right now on the ad-supported services
 * (Tubi, Pluto, Roku, Freevee). Discovery, region-aware — real availability only.
 */
export async function getFreeToWatch(supabase: SupabaseClient, userId: string): Promise<FreeTitle[]> {
  const profile = userId ? await getProfile(supabase, userId) : null;
  const region = regionFor(profile);

  const [movies, tv] = await Promise.all([
    discoverTitles('movie', { providerIds: FREE_SERVICE_IDS, region, minVotes: 100, sortBy: 'popularity.desc' }),
    discoverTitles('tv', { providerIds: FREE_SERVICE_IDS, region, minVotes: 60, sortBy: 'popularity.desc' }),
  ]);

  const seen = new Set<string>();
  const out: FreeTitle[] = [];
  const max = Math.max(movies.length, tv.length);
  for (let i = 0; i < max; i++) {
    for (const arr of [movies, tv]) {
      const t = arr[i];
      if (!t) continue;
      const key = `${t.mediaType}-${t.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath });
    }
  }
  return out.slice(0, 18);
}
