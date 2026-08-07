import { NextResponse } from 'next/server';
import { getTitleVideos } from '@/lib/tmdb/client';
import { pickBestTrailer, type TmdbVideo } from '@/lib/trailer/resolve';

export const runtime = 'nodejs';

/**
 * SMART TRAILER RESOLVER — the one server endpoint a card asks for a trailer.
 *
 * Resolves by TMDB title id (never a YouTube text search), ranks the title's
 * OWN official videos by confidence + language, and returns the single best
 * trailer or null. The TMDB key never crosses the boundary — only a public
 * YouTube video id does. Title-global (not per-user), so it is CDN-cacheable
 * for 12h, which — with the client-side memo in useTrailer — means scrolling a
 * grid never re-resolves the same title.
 *
 * Trailer availability is ENRICHMENT: a resolver miss returns `{ trailer: null }`
 * with a 200, so a card renders its poster and never disappears.
 */
export async function GET(_req: Request, { params }: { params: { type: string; id: string } }) {
  const mediaType = params.type === 'tv' ? 'tv' : 'movie';
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ trailer: null }, { headers: cacheHeaders() });
  }

  const videos = await getTitleVideos(mediaType, id);
  const asTmdb: TmdbVideo[] = videos.map((v) => ({
    key: v.key,
    site: v.site,
    type: v.type,
    official: v.official,
    name: v.name,
    iso_639_1: v.language,
    iso_3166_1: v.country,
    published_at: v.publishedAt,
  }));

  // The app language is English; the resolver still prefers en and falls back
  // deterministically. (A future locale-aware app can pass the viewer language.)
  const trailer = pickBestTrailer(asTmdb, { preferredLanguage: 'en' });
  return NextResponse.json({ trailer }, { headers: cacheHeaders() });
}

function cacheHeaders(): Record<string, string> {
  // Title-global content — safe to share across viewers on the CDN for 12h,
  // matching the rest of the title hydration TTL.
  return { 'Cache-Control': 'public, s-maxage=43200, stale-while-revalidate=86400' };
}
