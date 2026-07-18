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
  metacritic: number | null; // 0..100 — Metacritic critics (Metascore)
  metacriticUser: number | null; // 0..10 — Metacritic user score
  trakt: number | null; // 0..100 — Trakt community rating
  letterboxd: number | null; // 0..5 — Letterboxd community average
  rogerEbert: number | null; // 0..4 — RogerEbert.com star rating
}

interface MdbRating {
  source?: string;
  value?: number | null; // native scale (IMDb 8.5, Letterboxd 3.7, RT 90…)
  score?: number | null; // MDBList-normalized 0..100
}
interface MdbResponse {
  response?: boolean;
  ratings?: MdbRating[];
}

// MDBList has used a few source strings for RT audience over time — accept all.
const RT_AUDIENCE = new Set(['audience', 'tomatoesaudience', 'popcorn']);
const RT_CRITIC = new Set(['tomatoes', 'tomatometer']);

/** First rating object whose source string is in `sources`, else null. */
function find(ratings: MdbRating[], sources: Set<string>): MdbRating | null {
  for (const r of ratings) {
    if (r.source && sources.has(r.source.toLowerCase())) return r;
  }
  return null;
}

const num = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null);

/** Normalized 0..100 value (prefers MDBList's `score`). */
function pickNorm(ratings: MdbRating[], sources: Set<string>): number | null {
  const r = find(ratings, sources);
  return r ? num(r.score) ?? num(r.value) : null;
}

/** Native-scale value (prefers MDBList's `value`), for sources shown on their
 *  own scale (IMDb /10, Letterboxd /5, Roger Ebert /4). */
function pickNative(ratings: MdbRating[], sources: Set<string>): number | null {
  const r = find(ratings, sources);
  return r ? num(r.value) ?? num(r.score) : null;
}

export async function getMdbRatings(
  tmdbId: number,
  mediaType: MediaType,
  imdbId: string | null,
): Promise<MdbRatings | null> {
  const key = serverEnv.mdblistKey();
  if (!key) return null;

  // MDBList's media endpoint is REST: /{imdb|tmdb}/{movie|show}/{id}. The root
  // host (https://api.mdblist.com/) just returns API docs with no `ratings`, so
  // the old query-param form silently yielded null for every title. Prefer the
  // IMDb id when we have it; otherwise use the TMDB id.
  const kind = mediaType === 'tv' ? 'show' : 'movie';
  const path = imdbId ? `imdb/${kind}/${encodeURIComponent(imdbId)}` : `tmdb/${kind}/${tmdbId}`;
  const url = new URL(`https://api.mdblist.com/${path}`);
  url.searchParams.set('apikey', key);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal, next: { revalidate: 60 * 60 * 12 } });
    if (!res.ok) return null;
    const data = (await res.json()) as MdbResponse;
    const ratings = Array.isArray(data.ratings) ? data.ratings : [];
    if (ratings.length === 0) return null;

    const imdb = pickNative(ratings, new Set(['imdb']));
    const metacriticUser = pickNative(ratings, new Set(['metacriticuser', 'metacritic_user']));
    const letterboxd = pickNative(ratings, new Set(['letterboxd']));
    const rogerEbert = pickNative(ratings, new Set(['rogerebert', 'roger_ebert']));
    const out: MdbRatings = {
      rtAudience: clampPct(pickNorm(ratings, RT_AUDIENCE)),
      rtCritic: clampPct(pickNorm(ratings, RT_CRITIC)),
      imdb: clampScale(imdb, 10),
      metacritic: clampPct(pickNorm(ratings, new Set(['metacritic']))),
      metacriticUser: clampScale(metacriticUser, 10),
      trakt: clampPct(pickNorm(ratings, new Set(['trakt']))),
      letterboxd: clampScale(letterboxd, 5),
      rogerEbert: clampScale(rogerEbert, 4),
    };
    if (Object.values(out).every((v) => v == null)) return null;
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

/** Clamp a native-scale rating to [0, max], preserving one decimal (e.g. IMDb
 *  8.5/10, Letterboxd 3.7/5). Returns null when absent. */
function clampScale(n: number | null, max: number): number | null {
  if (n == null) return null;
  return Math.max(0, Math.min(max, Math.round(n * 10) / 10));
}
