import 'server-only';
import { serverEnv } from '@/lib/env';

/**
 * Optional OMDb adapter for critic aggregator ratings (IMDb rating, Rotten
 * Tomatoes, Metacritic). Server-only. Returns null when `OMDB_API_KEY` is
 * unset, the title isn't found, or the request fails — the app degrades
 * gracefully and never fabricates ratings.
 */
export interface CriticRatings {
  imdbRating: number | null; // 0..10
  rottenTomatoes: number | null; // 0..100
  metascore: number | null; // 0..100
}

interface OmdbResponse {
  Response: string;
  imdbRating?: string;
  Metascore?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
}

function parseNum(v: string | undefined): number | null {
  if (!v || v === 'N/A') return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export async function getCriticRatings(imdbId: string | null): Promise<CriticRatings | null> {
  const key = serverEnv.omdbKey();
  if (!key || !imdbId) return null;

  const url = new URL('https://www.omdbapi.com/');
  url.searchParams.set('apikey', key);
  url.searchParams.set('i', imdbId);
  url.searchParams.set('tomatoes', 'true');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal, next: { revalidate: 60 * 60 * 6 } });
    if (!res.ok) return null;
    const data = (await res.json()) as OmdbResponse;
    if (data.Response !== 'True') return null;

    const imdbRating = parseNum(data.imdbRating);
    const metascore = parseNum(data.Metascore);
    let rottenTomatoes: number | null = null;
    for (const r of data.Ratings ?? []) {
      if (r.Source === 'Rotten Tomatoes') {
        rottenTomatoes = parseNum(r.Value.replace('%', ''));
      }
    }
    if (imdbRating == null && metascore == null && rottenTomatoes == null) return null;
    return { imdbRating, rottenTomatoes, metascore };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
