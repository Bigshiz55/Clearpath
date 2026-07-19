import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getUpcomingTv } from '@/lib/onTv';
import { getProfile, regionFor } from '@/lib/profile';
import { getCriticRatings } from '@/lib/omdb';
import { findTmdbByImdb } from '@/lib/tmdb/client';
import type { MediaType } from '@/lib/types';

export interface DetectivePick {
  id: number; // TVmaze airing id (for reminders)
  showName: string;
  network: string | null;
  airstamp: string;
  showType: string;
  episodeName: string | null;
  season: number | null;
  number: number | null;
  image: string | null;
  tvmaze: number | null; // TVmaze community rating 0..10
  imdb: number | null; // 0..10
  rottenTomatoes: number | null; // 0..100
  metascore: number | null; // 0..100
  tmdbId: number | null; // resolved from the show's IMDb id — powers the DNA score
  mediaType: MediaType | null;
}

/**
 * The TV Detective's report: scan the next ~48 hours of broadcast listings and
 * return a shortlist worth recording or tuning in for, each with its airtime,
 * network, and every rating we can find (TVmaze community + IMDb / Rotten
 * Tomatoes / Metacritic via OMDb, matched by the show's IMDb id). Real data only.
 */
export async function getDetectivePicks(supabase: SupabaseClient, userId: string): Promise<DetectivePick[]> {
  const region = regionFor(userId ? await getProfile(supabase, userId) : null);
  const airings = (await getUpcomingTv(region, Date.now(), 2)).slice(0, 14); // ~48h

  return Promise.all(
    airings.map(async (a) => {
      const [critic, tmdb] = await Promise.all([
        a.imdb ? getCriticRatings(a.imdb).catch(() => null) : null,
        a.imdb ? findTmdbByImdb(a.imdb).catch(() => null) : null,
      ]);
      return {
        id: a.id,
        showName: a.showName,
        network: a.network,
        airstamp: a.airstamp,
        showType: a.showType,
        episodeName: a.episodeName,
        season: a.season,
        number: a.number,
        image: a.image,
        tvmaze: a.rating,
        imdb: critic?.imdbRating ?? null,
        rottenTomatoes: critic?.rottenTomatoes ?? null,
        metascore: critic?.metascore ?? null,
        tmdbId: tmdb?.id ?? null,
        mediaType: tmdb?.mediaType ?? null,
      };
    }),
  );
}
