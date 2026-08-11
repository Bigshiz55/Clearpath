import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType } from '@/lib/types';
import { discoverTitles, discoverTitlesChecked, getTvFreshness, getWatchProviders } from '@/lib/tmdb/client';
import { getProfile, regionFor, getMyServices } from '@/lib/profile';
import { topStreamingProvider } from '@/lib/services';

export interface FeedItem {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  releaseDate?: string | null; // ISO date the title released / airs
  network?: string | null; // primary streaming service carrying it (null = unknown)
}

export type ReleaseWindow = 'recent' | 'upcoming';
export type ReleaseSort = 'popular' | 'new' | 'top';
export interface ReleaseQuery {
  mediaType: 'all' | 'movie' | 'tv';
  window: ReleaseWindow;
  sort: ReleaseSort;
  /** TMDB provider ids to filter to; empty = every platform. */
  providerIds: number[];
}

export interface ReleaseResult {
  items: FeedItem[];
  /** True when one or more of the underlying TMDB discover calls failed
   *  (network error, timeout, non-2xx after retries) and were silently
   *  omitted from the pool. A thin or empty `items` alongside `degraded:
   *  true` means "we couldn't fully check," never "confirmed no matches" —
   *  the caller must not render an honest-empty-state claiming the latter. */
  degraded: boolean;
}

/**
 * The engine behind the New Release Wall — flexible discovery the client can
 * fine-tune: media type, recent vs. upcoming, sort order, and platform filter.
 * Region-aware, excludes what's already on the user's watchlist, real TMDB rows
 * only. Upcoming titles carry their release date so the UI can label them.
 */
export async function getReleases(
  supabase: SupabaseClient,
  userId: string,
  query: ReleaseQuery,
): Promise<ReleaseResult> {
  const profile = await getProfile(supabase, userId);
  const region = regionFor(profile);
  const types: MediaType[] = query.mediaType === 'all' ? ['movie', 'tv'] : [query.mediaType];
  const upcoming = query.window === 'upcoming';

  const sortField = (mt: MediaType) => (mt === 'movie' ? 'primary_release_date' : 'first_air_date');
  const sortFor = (mt: MediaType): string => {
    if (query.sort === 'popular') return 'popularity.desc';
    if (query.sort === 'top') return 'vote_average.desc';
    // "new": upcoming → soonest first; recent → most-recent first.
    return `${sortField(mt)}.${upcoming ? 'asc' : 'desc'}`;
  };
  // Upcoming titles have few/no votes; don't gate them. "Top rated" needs a floor.
  const minVotesFor = (mt: MediaType): number => {
    if (upcoming) return 0;
    if (query.sort === 'top') return 100;
    return mt === 'movie' ? 25 : 12;
  };

  // `discoverTitlesChecked` (not the fail-open `discoverTitles`) so a real
  // TMDB failure is distinguishable from a genuine zero-result page — see
  // ReleaseResult.degraded above. Never `.catch()`d away here: a caught
  // failure would silently look identical to "checked, found nothing."
  const checkedPools = await Promise.all(
    types.flatMap((mt) =>
      [1, 2].map((page) =>
        discoverTitlesChecked(mt, {
          region,
          providerIds: query.providerIds.length > 0 ? query.providerIds : undefined,
          sortBy: sortFor(mt),
          minVotes: minVotesFor(mt),
          minRating: query.sort === 'top' ? 6 : undefined,
          sinceDays: upcoming ? undefined : 120,
          upcomingDays: upcoming ? 120 : undefined,
          page,
        }),
      ),
    ),
  );
  const degraded = checkedPools.some((p) => !p.ok);
  const pools = checkedPools.map((p) => p.items);

  const wl = userId
    ? await supabase.from('watchlist_items').select('tmdb_id, media_type').eq('user_id', userId)
    : { data: [] };
  const exclude = new Set<string>();
  for (const r of (wl as { data: { tmdb_id: number; media_type: string }[] | null }).data ?? []) {
    exclude.add(`${r.media_type}-${r.tmdb_id}`);
  }

  // Group pools back by media type, then interleave movie/tv for a mixed wall.
  const byType = new Map<MediaType, typeof pools[number]>();
  types.forEach((mt, i) => {
    byType.set(mt, [...pools[i * 2]!, ...pools[i * 2 + 1]!]);
  });

  const seen = new Set<string>();
  const items: FeedItem[] = [];
  const lists = types.map((mt) => byType.get(mt) ?? []);
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const arr of lists) {
      const t = arr[i];
      if (!t) continue;
      const key = `${t.mediaType}-${t.id}`;
      if (exclude.has(key) || seen.has(key)) continue;
      seen.add(key);
      items.push({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath, releaseDate: t.releaseDate });
    }
  }

  // Attach the primary streaming service (where-to-watch) per title, from the
  // 12h-cached provider data. Real availability only — null when TMDB has none
  // yet (common for still-upcoming titles), so the UI simply shows no badge.
  const top = items.slice(0, 36);
  const withNetwork = await Promise.all(
    top.map(async (it) => {
      try {
        const providers = await getWatchProviders(it.mediaType, it.id, region);
        const provider = providers ? topStreamingProvider(providers.options) : null;
        // Keep `network` (name string) for back-compat, and add `provider` which
        // carries the VERIFIED TMDB logo path so the card can render the brand.
        return { ...it, network: provider?.name ?? null, provider };
      } catch {
        return { ...it, network: null, provider: null };
      }
    }),
  );
  return { items: withNetwork, degraded };
}

export interface NewOnServices {
  services: number[];
  items: FeedItem[];
}

/**
 * Recently released movies & shows available to stream on the plans the user
 * subscribes to. Empty (with services list) when they haven't picked services.
 */
export async function getNewOnServices(
  supabase: SupabaseClient,
  userId: string,
): Promise<NewOnServices> {
  const [profile, services] = await Promise.all([
    getProfile(supabase, userId),
    getMyServices(supabase, userId),
  ]);
  if (services.length === 0) return { services, items: [] };
  const region = regionFor(profile);

  const [movies, tv, wl] = await Promise.all([
    discoverTitles('movie', { providerIds: services, region, sinceDays: 120, minVotes: 30, sortBy: 'primary_release_date.desc' }),
    discoverTitles('tv', { providerIds: services, region, sinceDays: 120, minVotes: 15, sortBy: 'first_air_date.desc' }),
    supabase.from('watchlist_items').select('tmdb_id, media_type').eq('user_id', userId),
  ]);

  const exclude = new Set<string>();
  for (const r of wl.data ?? []) exclude.add(`${r.media_type}-${r.tmdb_id}`);

  const seen = new Set<string>();
  const items: FeedItem[] = [];
  const max = Math.max(movies.length, tv.length);
  for (let i = 0; i < max; i++) {
    for (const arr of [movies, tv]) {
      const t = arr[i];
      if (!t) continue;
      const key = `${t.mediaType}-${t.id}`;
      if (exclude.has(key) || seen.has(key)) continue;
      seen.add(key);
      items.push({ id: t.id, mediaType: t.mediaType, title: t.title, year: t.year, posterPath: t.posterPath });
    }
  }
  return { services, items: items.slice(0, 18) };
}

export interface WaitingShow {
  id: number;
  title: string;
  posterPath: string | null;
  note: string; // truthful, e.g. "New episode Oct 16" or "New episodes recently"
  soon: boolean;
}

const DAY = 86_400_000;

/**
 * TV shows on the user's watchlist that are actively releasing episodes —
 * "back with new episodes" or "next episode <date>". Bounded and truthful: we
 * only claim what TMDB's air-dates actually say, never a fabricated count.
 */
export async function getEpisodesWaiting(
  supabase: SupabaseClient,
  userId: string,
  todayMs: number,
): Promise<WaitingShow[]> {
  /* ORDERED BY `added_at`, NOT `updated_at`.
     `watchlist_items` has never had an `updated_at` column (0001_init: it has
     added_at and watched_at). PostgREST rejects the request when a select or
     an order names an unknown column, so this query returned an error, `data`
     was null, and "episodes waiting" has been silently empty for every user
     since it shipped — a broken feature that looked exactly like an empty
     watchlist. Found by `schemaColumns.test.ts`, which was written after the
     same mistake (`tv_stations.lineup_id`) cost a production deploy.
     `added_at` is the recency this table actually records; `watched_at` is
     null for precisely the unwatched shows this list is about. */
  const { data } = await supabase
    .from('watchlist_items')
    .select('tmdb_id, title, poster_path, status, added_at')
    .eq('user_id', userId)
    .eq('media_type', 'tv')
    .in('status', ['watching', 'strict', 'possible', 'paused'])
    .order('added_at', { ascending: false })
    .limit(16);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const checked = await Promise.all(
    rows.map(async (r) => {
      const fresh = await getTvFreshness(r.tmdb_id as number).catch(() => null);
      return { r, fresh };
    }),
  );

  const out: WaitingShow[] = [];
  for (const { r, fresh } of checked) {
    if (!fresh) continue;
    const posterPath = (r.poster_path as string | null) ?? null;
    const title = (r.title as string) ?? fresh.name;

    if (fresh.nextAirDate) {
      const days = Math.round((Date.parse(fresh.nextAirDate) - todayMs) / DAY);
      if (days >= 0 && days <= 21) {
        out.push({ id: r.tmdb_id as number, title, posterPath, note: `Next episode ${fresh.nextAirDate}`, soon: true });
        continue;
      }
    }
    if (fresh.lastAirDate) {
      const daysAgo = Math.round((todayMs - Date.parse(fresh.lastAirDate)) / DAY);
      const returning = (fresh.status ?? '').toLowerCase().includes('return');
      if (daysAgo >= 0 && daysAgo <= 30) {
        out.push({ id: r.tmdb_id as number, title, posterPath, note: 'New episodes recently', soon: false });
      } else if (returning && fresh.nextAirDate) {
        out.push({ id: r.tmdb_id as number, title, posterPath, note: `Returning · next ${fresh.nextAirDate}`, soon: false });
      }
    }
  }
  // Upcoming first, then recent.
  return out.sort((a, b) => Number(b.soon) - Number(a.soon)).slice(0, 8);
}
