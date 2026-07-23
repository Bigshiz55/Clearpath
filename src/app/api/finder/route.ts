import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runFinder, type FinderQuery, type Watcher } from '@/lib/finder';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { tmdbImage } from '@/lib/tmdb/image';
import { parseAskWithAI, resolvePersonId, parseRequestedCount } from '@/lib/askParse';

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
    providerIds: Array.isArray(q.providerIds)
      ? q.providerIds.map(Number).filter((n) => Number.isFinite(n)).slice(0, 20)
      : undefined,
    minMatch: typeof q.minMatch === 'number' ? q.minMatch : null,
    streamItOnly: Boolean(q.streamItOnly),
    bingeableOnly: Boolean(q.bingeableOnly),
    upcoming: Boolean(q.upcoming),
    liveOnly: Boolean(q.liveOnly),
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

    // Smart path: when there's a free-text ask, let the LLM parse it into
    // filters (understands almost anything). Fall back to the client's parsed
    // query, then the regex enrichment for actor/count. Scoring stays
    // deterministic in runFinder — the AI only fills search filters.
    let query: FinderQuery;
    let limit = 8;
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const ai = text ? await parseAskWithAI(text) : null;
    if (ai) {
      query = ai.query;
      limit = ai.limit;
    } else {
      query = body.query ? coerceQuery(body.query) : text ? naiveParseQuery(text) : { ...EMPTY_QUERY };
      if (text) limit = parseRequestedCount(text);
    }
    // An explicit provider from the deep-link — e.g. tapping "Best movies on
    // Netflix" sends ?providers=8 → body.query.providerIds=[8] — must survive AI
    // parsing. The AI fills genre/mood from the free text but doesn't read the
    // named platform, so without this the Netflix filter is silently dropped and
    // results leak in from every service. The named platform wins.
    if (body.query) {
      const clientProviders = coerceQuery(body.query).providerIds;
      if (clientProviders && clientProviders.length && !(query.providerIds && query.providerIds.length)) {
        query.providerIds = clientProviders;
      }
    }
    // Guarantee the actor filter regardless of AI (fuzzy, so misspellings match).
    if (text && (!query.castIds || query.castIds.length === 0)) {
      const pid = await resolvePersonId(text);
      if (pid) {
        query.castIds = [pid];
        query.mediaType = 'movie';
      }
    }

    let watcher: Watcher | null = null;
    const w = body.watcher as Partial<Watcher> | undefined;
    if (w && typeof w.name === 'string' && Array.isArray(w.love) && Array.isArray(w.avoid)) {
      watcher = {
        name: w.name.slice(0, 40),
        love: w.love.map(String).slice(0, 12),
        avoid: w.avoid.map(String).slice(0, 12),
      };
    }

    const result = await runFinder(supabase, user.id, query, watcher, limit);
    return NextResponse.json({
      query,
      scoredFor: result.scoredFor,
      relaxed: result.relaxed,
      items: result.items.map((i) => ({ ...i, posterUrl: tmdbImage(i.posterPath, 'w342') })),
    });
  } catch {
    return NextResponse.json({ error: 'Could not run the finder right now.' }, { status: 500 });
  }
}
