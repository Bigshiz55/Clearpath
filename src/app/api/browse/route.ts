import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBrowse, type BrowseQuery, type BrowseMonetization, type BrowseSort } from '@/lib/browse';
import { tmdbImage } from '@/lib/tmdb/image';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MON = new Set<BrowseMonetization>(['all', 'flatrate', 'free', 'rent', 'buy']);
const SORT = new Set<BrowseSort>(['popularity', 'rating', 'new']);

function coerce(raw: unknown): BrowseQuery {
  const q = (raw ?? {}) as Partial<BrowseQuery>;
  const nums = (a: unknown, cap: number) =>
    Array.isArray(a) ? a.map(Number).filter((n) => Number.isFinite(n)).slice(0, cap) : [];
  return {
    mediaType: q.mediaType === 'tv' ? 'tv' : 'movie',
    providerIds: nums(q.providerIds, 30),
    genreIds: nums(q.genreIds, 6),
    monetization: MON.has(q.monetization as BrowseMonetization) ? (q.monetization as BrowseMonetization) : 'all',
    minRating: typeof q.minRating === 'number' ? Math.max(0, Math.min(10, q.minRating)) : null,
    sort: SORT.has(q.sort as BrowseSort) ? (q.sort as BrowseSort) : 'popularity',
    page: typeof q.page === 'number' && q.page > 0 ? Math.floor(q.page) : 1,
  };
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      /* empty */
    }
    const query = coerce(body);
    const items = await getBrowse(supabase, user?.id ?? '', query);
    return NextResponse.json({
      page: query.page,
      items: items.map((i) => ({ ...i, posterUrl: tmdbImage(i.posterPath, 'w342') })),
    });
  } catch {
    return NextResponse.json({ error: 'Could not browse right now.' }, { status: 500 });
  }
}
