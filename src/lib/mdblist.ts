import 'server-only';
import { serverEnv } from '@/lib/env';
import type { MediaType } from '@/lib/types';

/**
 * Optional MDBList adapter — the one self-serve source for the Rotten Tomatoes
 * AUDIENCE (Popcorn) score, which OMDb does not provide. MDBList aggregates
 * ratings from IMDb, RT (critics + audience), Metacritic, etc. behind a free API
 * key. Server-only, gated by `MDBLIST_API_KEY`; returns null when unset or on any
 * failure, so the app degrades gracefully and never fabricates a number.
 *
 * Honesty caveat: MDBList refreshes periodically, so a value can lag the live RT
 * site by days. It is a real, sourced number — just not a live mirror.
 */
export interface MdbRatings {
  rtAudience: number | null; // Rotten Tomatoes audience / Popcorn, 0..100
  rtCritic: number | null; // Rotten Tomatoes Tomatometer, 0..100
  imdb: number | null; // 0..10
  metacritic: number | null; // 0..100
}

interface MdbRating {
  source?: string;
  value?: number | null;
  score?: number | null;
}
interface MdbResponse {
  response?: boolean;
  ratings?: MdbRating[];
}

// MDBList has used a few source strings for RT audience over time — accept all.
const RT_AUDIENCE = new Set(['audience', 'tomatoesaudience', 'popcorn']);
const RT_CRITIC = new Set(['tomatoes', 'tomatometer']);

function pick(ratings: MdbRating[], sources: Set<string>): number | null {
  for (const r of ratings) {
    if (r.source && sources.has(r.source.toLowerCase())) {
      const n = r.score ?? r.value;
      if (typeof n === 'number' && Number.isFinite(n)) return n;
    }
  }
  return null;
}

export async function getMdbRatings(
  tmdbId: number,
  mediaType: MediaType,
  imdbId: string | null,
): Promise<MdbRatings | null> {
  const key = serverEnv.mdblistKey();
  if (!key) return null;

  const url = new URL('https://api.mdblist.com/');
  url.searchParams.set('apikey', key);
  // Prefer the id we always have (TMDB); MDBList also accepts imdb via `i`.
  if (imdbId) url.searchParams.set('i', imdbId);
  else {
    url.searchParams.set('tm', String(tmdbId));
    url.searchParams.set('m', mediaType === 'tv' ? 'show' : 'movie');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal, next: { revalidate: 60 * 60 * 12 } });
    if (!res.ok) return null;
    const data = (await res.json()) as MdbResponse;
    const ratings = Array.isArray(data.ratings) ? data.ratings : [];
    if (ratings.length === 0) return null;

    const imdb = pick(ratings, new Set(['imdb']));
    const out: MdbRatings = {
      rtAudience: clampPct(pick(ratings, RT_AUDIENCE)),
      rtCritic: clampPct(pick(ratings, RT_CRITIC)),
      imdb: imdb != null ? Math.max(0, Math.min(10, imdb)) : null,
      metacritic: clampPct(pick(ratings, new Set(['metacritic']))),
    };
    if (out.rtAudience == null && out.rtCritic == null && out.imdb == null && out.metacritic == null) return null;
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function clampPct(n: number | null): number | null {
  if (n == null) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}
