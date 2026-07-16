import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runFinder, type FinderQuery, type Watcher } from '@/lib/finder';
import { askJudgeTitle } from '@/lib/askJudge';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { tmdbImage } from '@/lib/tmdb/image';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function coerceQuery(raw: unknown): FinderQuery {
  const q = (raw ?? {}) as Partial<FinderQuery>;
  return {
    mediaType: q.mediaType === 'movie' || q.mediaType === 'tv' ? q.mediaType : 'any',
    genreIds: Array.isArray(q.genreIds) ? q.genreIds.map(Number).filter((n) => Number.isFinite(n)).slice(0, 6) : [],
    maxRuntime: typeof q.maxRuntime === 'number' ? q.maxRuntime : null,
    sinceMonths: typeof q.sinceMonths === 'number' ? q.sinceMonths : null,
    minAudience: typeof q.minAudience === 'number' ? q.minAudience : null,
    minImdb: typeof q.minImdb === 'number' ? q.minImdb : null,
    englishAudioOnly: Boolean(q.englishAudioOnly),
    onMyServices: Boolean(q.onMyServices),
    minMatch: typeof q.minMatch === 'number' ? q.minMatch : null,
    streamItOnly: Boolean(q.streamItOnly),
    bingeableOnly: Boolean(q.bingeableOnly),
    pace: typeof q.pace === 'number' ? Math.max(0, Math.min(100, q.pace)) : null,
  };
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

    let body: { query?: unknown; text?: string; watcher?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      /* empty */
    }

    // 1) If they named a specific title, put THAT on trial (full verdict + reasons).
    const text = typeof body.text === 'string' ? body.text.slice(0, 300) : '';
    if (text.trim()) {
      const titled = await askJudgeTitle(supabase, user.id, text);
      if (titled) return NextResponse.json({ kind: 'title', ...titled });
    }

    // 2) Otherwise fall back to constraint-based discovery (the Finder).
    const query: FinderQuery = body.query ? coerceQuery(body.query) : text ? naiveParseQuery(text) : { ...EMPTY_QUERY };

    let watcher: Watcher | null = null;
    const w = body.watcher as Partial<Watcher> | undefined;
    if (w && typeof w.name === 'string' && Array.isArray(w.love) && Array.isArray(w.avoid)) {
      watcher = { name: w.name.slice(0, 40), love: w.love.map(String).slice(0, 12), avoid: w.avoid.map(String).slice(0, 12) };
    }

    const result = await runFinder(supabase, user.id, query, watcher);
    return NextResponse.json({
      kind: 'search',
      query,
      scoredFor: result.scoredFor,
      relaxed: result.relaxed,
      items: result.items.map((i) => ({ ...i, posterUrl: tmdbImage(i.posterPath, 'w342') })),
    });
  } catch {
    return NextResponse.json({ error: 'The court hit a snag.' }, { status: 500 });
  }
}
