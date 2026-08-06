import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runFinder, DEFAULT_RESULT_LIMIT, type FinderQuery, type Watcher } from '@/lib/finder';
import { askJudgeTitle, askSimilarTo, extractReference } from '@/lib/askJudge';
import { naiveParseQuery, EMPTY_QUERY, parseTopicTerms, extractExcludedPerson } from '@/lib/finderParse';
import { tmdbImage } from '@/lib/tmdb/image';
import { searchKeywords, searchPeople, getCredits } from '@/lib/tmdb/client';
import { parseAskWithAI, resolvePersonId, parseRequestedCount } from '@/lib/askParse';
import { augmentInternational } from '@/lib/askInternational';
import { detectOrigin, detectAudio, detectNetwork, detectPlatform } from '@/lib/nlu/detectors';
import { classifySearch, statedMediaType } from '@/lib/nlu/searchMode';
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
  if (
    detectOrigin(text).countries.length > 0 ||
    detectAudio(text).englishAudioRequired ||
    detectNetwork(text) != null ||
    detectPlatform(text) != null
  ) {
    return true;
  }
  // Stated years, recency, and genre exclusions are hard constraints too.
  // Raw similar ignores every one of them — "like Rocky, released after 2020"
  // was answering with Fat City (1972) because the year never left the sentence.
  const det = naiveParseQuery(text);
  return det.minYear != null || det.maxYear != null || det.sinceMonths != null || (det.excludeGenreIds?.length ?? 0) > 0;
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

    // 0.5) A question about the USER'S OWN history is answered from their list,
    // never from the general catalog — "What haven't I finished?" was returning
    // this week's trending titles, which is a non-answer wearing a confident
    // face. Empty history gets an honest empty answer, not a trending dump.
    const HISTORY_ASK =
      /\bwhat\s+(?:have\s+i\s+not|haven'?t\s+i|didn'?t\s+i|did\s+i\s+not)\s+(?:finish(?:ed)?|watch(?:ed)?)\b|\bcontinue\s+watching\b|\bpick\s+up\s+where\s+i\s+left\s+off\b/i;
    if (HISTORY_ASK.test(text)) {
      const wantsFinish = /finish/i.test(text);
      const { data: rows } = await supabase
        .from('watchlist_items')
        .select('tmdb_id, media_type, title, year, poster_path, status, added_at')
        .eq('user_id', user.id)
        .in('status', wantsFinish ? ['watching', 'paused'] : ['strict', 'possible', 'watching', 'paused'])
        .order('added_at', { ascending: false })
        .limit(20);
      const items = (rows ?? []).map((r) => ({
        id: r.tmdb_id,
        mediaType: r.media_type,
        title: r.title,
        year: r.year,
        posterPath: r.poster_path,
        posterUrl: tmdbImage(r.poster_path, 'w342'),
        matchScore: null,
        generalScore: null,
        reason: r.status === 'watching' ? 'You are partway through this' : r.status === 'paused' ? 'Paused on your list' : 'On your list, not watched yet',
      }));
      return NextResponse.json({
        kind: 'search',
        query: { ...EMPTY_QUERY },
        scoredFor: 'Your list',
        relaxed:
          items.length > 0
            ? null
            : wantsFinish
              ? 'Nothing on your list is marked as started — there is nothing waiting to be finished yet.'
              : 'Your list is empty so far — add titles and this question will have a real answer.',
        items,
      });
    }

    // 1) Named-title lookup → put THAT title on trial (with the identity guard,
    // exact-match ranking and provider hard filter inside askJudgeTitle).
    if (text.trim() && cls?.mode !== 'similar_to') {
      const titled = await askJudgeTitle(supabase, user.id, text, cls ?? undefined);
      if (titled) return NextResponse.json({ kind: 'title', ...titled });
    }

    // 2) Otherwise → smart discovery. Let the LLM parse the ask (handles
    // misspellings, actor names, counts); fall back to the regex parser.
    let query: FinderQuery;
    let limit = DEFAULT_RESULT_LIMIT;
    const ai = text ? await parseAskWithAI(text) : null;

    // 1.5) "More like X" — if the ask compares to a title ("shows like
    // Mindhunter"), seed recommendations from THAT title's neighbors. Uses the
    // LLM's reference when present, else a regex on the raw text (so it still
    // works with no OpenAI key). Falls through to plain discovery on a miss.
    // Only route into similarity when the query is EXPLICITLY a "like X" ask
    // (classifier mode), not merely because a title was named. A bare title —
    // even with a provider — stays an exact-title lookup above.
    // Precedence matters: the classifier's `reference` is the raw matched
    // span — for "Looking for something similar to Tulsa King that I would
    // like" that is the WHOLE SENTENCE, which resolves to no title at all.
    // The AI's extraction first, then the regex, and the raw span only as a
    // last resort.
    const reference =
      (ai?.similarTo ?? '').trim() ||
      (text ? extractReference(text) : null) ||
      (cls?.mode === 'similar_to' ? (cls.reference ?? null) : null);
    if (reference && cls?.mode === 'similar_to' && !hasCompetingConstraints(text)) {
      const wantCount = text ? parseRequestedCount(text) : 10;
      // "…but not another Stallone movie" is a HARD constraint. The name is
      // extracted deterministically and must resolve against the real people
      // catalog before it excludes anything — an unresolvable candidate is a
      // no-op, never a guess.
      const exclName = text ? extractExcludedPerson(text) : null;
      const excludePersonId = exclName ? ((await searchPeople(exclName).catch(() => []))[0]?.id ?? null) : null;
      // An explicitly stated media type ("a boxing MOVIE like Rocky") is not a
      // guess and must survive into the results. Without it the seed's own type
      // became the filter, and a movie request read back as "Shows".
      const similar = await askSimilarTo(supabase, user.id, reference, wantCount, statedMediaType(text, cls), excludePersonId);
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
    // DETERMINISTIC CONSTRAINT OVERLAY. Stated years and genre exclusions are
    // facts of the sentence, not judgment calls — when the LLM parse dropped
    // one ("after 2020" arriving with no year bound), the regex parser's
    // reading fills the gap. Overlay only, never override.
    if (text.trim()) {
      const det = naiveParseQuery(text);
      if (det.minYear != null && query.minYear == null) query.minYear = det.minYear;
      if (det.maxYear != null && query.maxYear == null) query.maxYear = det.maxYear;
      if (det.excludeGenreIds?.length) {
        query.excludeGenreIds = [...new Set([...(query.excludeGenreIds ?? []), ...det.excludeGenreIds])];
      }
    }
    // SUBJECT MATTER — always resolved and MERGED, not only when the parse came
    // back empty. "Three wrestling movies" flapped between real wrestling
    // results and a trending dump depending on what the LLM parse happened to
    // carry; the subject the sentence names must reach the search
    // deterministically every time. Resolved through the same `searchKeywords`
    // the AI path uses. Best-effort: an unresolved term is skipped, never
    // guessed.
    if (text) {
      const topics = parseTopicTerms(text);
      if (topics.length) {
        const ids = await searchKeywords(topics).catch(() => []);
        if (ids.length) query.keywordIds = [...new Set([...(query.keywordIds ?? []), ...ids])];
      }
    }

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
    // The same excluded-person hard constraint, on the discovery path. Enforced
    // on real credit evidence, only when the ask names someone to rule out; an
    // unverifiable candidate is kept rather than silently emptying the answer.
    const finderExclName = text ? extractExcludedPerson(text) : null;
    if (finderExclName) {
      const pid = (await searchPeople(finderExclName).catch(() => []))[0]?.id ?? null;
      if (pid != null) {
        const verdicts = await Promise.all(
          items.map((i) =>
            getCredits(i.mediaType === 'tv' ? 'tv' : 'movie', i.id)
              .then(
                (c) =>
                  !c.cast.some((p) => p.id === pid) &&
                  !c.directors.some((p) => p.id === pid) &&
                  !c.creators.some((p) => p.id === pid),
              )
              .catch(() => true),
          ),
        );
        items = items.filter((_, idx) => verdicts[idx]);
      }
    }
    const plan = text.trim() ? buildQueryPlan(text) : null;
    if (plan && plan.mediaTypes.length > 0) {
      items = items.filter((i) => plan.mediaTypes.some((mt) => mediaTypeSatisfies(mt, i.mediaType === 'tv' ? 'tv' : 'movie')));
    }
    // …and the same guard for what the request ruled OUT — but ONLY for kinds
    // the coarse movie/tv type can actually decide. "documentary" is a GENRE
    // dressed as a media word: every documentary satisfies 'movie', so running
    // it through this filter deleted every movie in the answer and "Boxing
    // movies after 2020, no documentaries" returned nothing at all. Documentary
    // exclusion is enforced upstream as excludeGenreIds (TMDB genre 99), where
    // it belongs. Removing only, never substituting — an honest shortfall
    // beats a wrong fill.
    const coarseExcluded = plan
      ? plan.excludedMediaTypes.filter((mt) => mt === 'movie' || mt === 'tv_series' || mt === 'miniseries' || mt === 'episode')
      : [];
    if (coarseExcluded.length > 0) {
      items = items.filter((i) => !coarseExcluded.some((mt) => mediaTypeSatisfies(mt, i.mediaType === 'tv' ? 'tv' : 'movie')));
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
