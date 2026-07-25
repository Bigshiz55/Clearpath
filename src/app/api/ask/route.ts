import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runFinder, type FinderQuery, type Watcher } from '@/lib/finder';
import { askJudgeTitle, askSimilarTo, extractReference } from '@/lib/askJudge';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { tmdbImage } from '@/lib/tmdb/image';
import { parseAskWithAI, resolvePersonId, parseRequestedCount } from '@/lib/askParse';
import { augmentInternational } from '@/lib/askInternational';
import { detectOrigin, detectAudio, detectNetwork, detectPlatform } from '@/lib/nlu/detectors';
import { classifySearch } from '@/lib/nlu/searchMode';
import { buildQueryPlan } from '@/lib/nlu/queryPlan';
import { mediaTypeSatisfies } from '@/lib/nlu/mediaOntology';

/**
 * "Something like X" is best served by TMDB-similar ONLY when the reference is
 * the dominant signal. When the ask ALSO carries hard constraints — a foreign
 * origin, a platform/network, or English audio — raw similar (which ignores all
 * of them) would return wrong-origin / wrong-platform titles. In that case we
 * fall through to the ONE finder pipeline, which enforces those constraints and
 * still carries the reference for read-back. Unifies the two retrieval paths.
 */
function hasCompetingConstraints(text: string): boolean {
  if (!text) return false;
  return (
    detectOrigin(text).countries.length > 0 ||
    detectAudio(text).englishAudioRequired ||
    detectNetwork(text) != null ||
    detectPlatform(text) != null
  );
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
    providerIds: Array.isArray(q.providerIds)
      ? q.providerIds.map(Number).filter((n) => Number.isFinite(n)).slice(0, 20)
      : undefined,
    minMatch: typeof q.minMatch === 'number' ? q.minMatch : null,
    streamItOnly: Boolean(q.streamItOnly),
    bingeableOnly: Boolean(q.bingeableOnly),
    upcoming: Boolean(q.upcoming),
    liveOnly: Boolean(q.liveOnly),
    pace: typeof q.pace === 'number' ? Math.max(0, Math.min(100, q.pace)) : null,
    originCountries: Array.isArray(q.originCountries) ? q.originCountries.map(String).slice(0, 4) : undefined,
    originalLanguages: Array.isArray(q.originalLanguages) ? q.originalLanguages.map(String).slice(0, 4) : undefined,
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

    // 0) Classify the search mode up front. A title-plus-provider query
    // ("Gone on BritBox") is an EXACT-TITLE lookup and must never be routed into
    // recommendation/similarity search (which is what returned "Gone Girl").
    const text = typeof body.text === 'string' ? body.text.slice(0, 300) : '';
    const cls = text.trim() ? classifySearch(text) : null;

    // 1) Named-title lookup → put THAT title on trial (with the identity guard,
    // exact-match ranking and provider hard filter inside askJudgeTitle).
    if (text.trim() && cls?.mode !== 'similar_to') {
      const titled = await askJudgeTitle(supabase, user.id, text, cls ?? undefined);
      if (titled) return NextResponse.json({ kind: 'title', ...titled });
    }

    // 2) Otherwise → smart discovery. Let the LLM parse the ask (handles
    // misspellings, actor names, counts); fall back to the regex parser.
    let query: FinderQuery;
    let limit = 8;
    const ai = text ? await parseAskWithAI(text) : null;

    // 1.5) "More like X" — if the ask compares to a title ("shows like
    // Mindhunter"), seed recommendations from THAT title's neighbors. Uses the
    // LLM's reference when present, else a regex on the raw text (so it still
    // works with no OpenAI key). Falls through to plain discovery on a miss.
    // Only route into similarity when the query is EXPLICITLY a "like X" ask
    // (classifier mode), not merely because a title was named. A bare title —
    // even with a provider — stays an exact-title lookup above.
    const reference = (ai?.similarTo ?? '').trim() || (cls?.mode === 'similar_to' ? (cls.reference ?? (text ? extractReference(text) : null)) : null);
    if (reference && cls?.mode === 'similar_to' && !hasCompetingConstraints(text)) {
      const wantCount = text ? parseRequestedCount(text) : 10;
      const similar = await askSimilarTo(supabase, user.id, reference, wantCount);
      if (similar) {
        return NextResponse.json({
          kind: 'search',
          query: similar.query,
          scoredFor: similar.scoredFor,
          relaxed: null,
          items: similar.items.map((i) => ({ ...i, posterUrl: tmdbImage(i.posterPath, 'w342') })),
        });
      }
    }

    if (ai) {
      query = ai.query;
      limit = ai.limit;
    } else {
      query = body.query ? coerceQuery(body.query) : text ? naiveParseQuery(text) : { ...EMPTY_QUERY };
      if (text) limit = parseRequestedCount(text);
    }
    // Foreign-origin / English-audio / runtime augmentation (deterministic; the
    // parser paths don't extract these) — restricts the pool to the real origin.
    query = augmentInternational(query, text);
    // Guarantee the actor filter regardless of AI: if a person is named and not
    // already resolved, look them up (fuzzy, so misspellings still match).
    if (text && (!query.castIds || query.castIds.length === 0)) {
      const pid = await resolvePersonId(text);
      if (pid) {
        query.castIds = [pid];
        query.mediaType = 'movie';
      }
    }

    const coerceWatcher = (raw: unknown): Watcher | null => {
      const w = raw as Partial<Watcher> | undefined;
      if (w && typeof w.name === 'string' && Array.isArray(w.love) && Array.isArray(w.avoid)) {
        return { name: w.name.slice(0, 40), love: w.love.map(String).slice(0, 12), avoid: w.avoid.map(String).slice(0, 12) };
      }
      return null;
    };
    // Household (array) → floor-weighted joint ranking; single watcher → legacy.
    const bodyWatchers = (body as { watchers?: unknown }).watchers;
    const household = Array.isArray(bodyWatchers)
      ? bodyWatchers.map(coerceWatcher).filter((x): x is Watcher => x !== null).slice(0, 6)
      : null;
    const watcher = coerceWatcher(body.watcher);

    const result = await runFinder(supabase, user.id, query, household && household.length > 0 ? household : watcher, limit);

    // FINAL MEDIA-TYPE GUARD (last line of defence): when the request explicitly
    // asked for movies (or shows), a candidate of the opposite type must never be
    // shown — regardless of how high it ranks. This is what stops "three movies
    // on Lifetime" from surfacing TV series. It only REMOVES wrong-type results;
    // it never substitutes, so an honest shortfall is preferred over a wrong fill.
    let items = result.items;
    const plan = text.trim() ? buildQueryPlan(text) : null;
    if (plan && plan.mediaTypes.length > 0) {
      items = items.filter((i) => plan.mediaTypes.some((mt) => mediaTypeSatisfies(mt, i.mediaType === 'tv' ? 'tv' : 'movie')));
    }

    return NextResponse.json({
      kind: 'search',
      query,
      scoredFor: result.scoredFor,
      relaxed: result.relaxed,
      items: items.map((i) => ({ ...i, posterUrl: tmdbImage(i.posterPath, 'w342') })),
    });
  } catch {
    return NextResponse.json({ error: 'The court hit a snag.' }, { status: 500 });
  }
}
