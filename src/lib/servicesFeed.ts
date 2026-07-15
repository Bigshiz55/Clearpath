import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType } from '@/lib/types';
import { discoverTitles, getTvFreshness } from '@/lib/tmdb/client';
import { getProfile, regionFor, getMyServices } from '@/lib/profile';

export interface FeedItem {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
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
  const { data } = await supabase
    .from('watchlist_items')
    .select('tmdb_id, title, poster_path, status, updated_at')
    .eq('user_id', userId)
    .eq('media_type', 'tv')
    .in('status', ['watching', 'strict', 'possible', 'paused'])
    .order('updated_at', { ascending: false })
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
