import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runFinder, type FinderQuery, type Watcher } from '@/lib/finder';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { tmdbImage } from '@/lib/tmdb/image';
import { searchPeople } from '@/lib/tmdb/client';
import { parseAskWithAI } from '@/lib/askParse';

const WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  a: 1, couple: 2, few: 3, several: 5,
};

/**
 * Read intent out of the plain-English ask that the pure client parser can't:
 * a requested count ("five …") and a person name ("Sigourney Weaver"), which we
 * resolve to a TMDB cast id. Mutates `query` in place, returns the result limit.
 */
async function enrichFromText(text: string, query: FinderQuery): Promise<number> {
  let limit = 8;
  const numToken = text
    .toLowerCase()
    .match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|a|couple|few|several|\d{1,2})\b/)?.[1];
  if (numToken) {
    const n = WORD_NUM[numToken] ?? Number.parseInt(numToken, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 20) limit = n;
  }
  // A capitalized multi-word run is almost always a person's name in these asks.
  const namePhrase = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z']+){1,2}\b/)?.[0];
  if (namePhrase) {
    const people = await searchPeople(namePhrase).catch(() => []);
    const top = people[0];
    if (top) {
      query.castIds = [top.id];
      query.mediaType = 'movie'; // cast filtering is movie-only
    }
  }
  return limit;
}

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
      if (text) limit = await enrichFromText(text, query);
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
