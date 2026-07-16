import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReleases, type ReleaseQuery } from '@/lib/servicesFeed';
import { tmdbImage } from '@/lib/tmdb/image';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function coerce(raw: unknown): ReleaseQuery {
  const q = (raw ?? {}) as Partial<ReleaseQuery>;
  return {
    mediaType: q.mediaType === 'movie' || q.mediaType === 'tv' ? q.mediaType : 'all',
    window: q.window === 'upcoming' ? 'upcoming' : 'recent',
    sort: q.sort === 'new' || q.sort === 'top' ? q.sort : 'popular',
    providerIds: Array.isArray(q.providerIds)
      ? q.providerIds.map(Number).filter((n) => Number.isFinite(n)).slice(0, 24)
      : [],
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
      /* empty body is fine */
    }
    const query = coerce(body);
    const items = await getReleases(supabase, user?.id ?? '', query);
    return NextResponse.json({
      items: items.map((i) => ({ ...i, posterUrl: tmdbImage(i.posterPath, 'w342') })),
    });
  } catch {
    return NextResponse.json({ error: 'Could not load releases.' }, { status: 500 });
  }
}
