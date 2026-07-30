import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runFinder, DEFAULT_RESULT_LIMIT, type FinderQuery, type Watcher } from '@/lib/finder';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { tmdbImage } from '@/lib/tmdb/image';
import { parseAskWithAI, resolvePersonId, parseRequestedCount } from '@/lib/askParse';
import { augmentInternational } from '@/lib/askInternational';
import { applyOverrides, sanitizeOverrides } from '@/lib/finderOverrides';
import { askSimilarTo, extractReference } from '@/lib/askJudge';
import { classifySearch, statedMediaType } from '@/lib/nlu/searchMode';

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

    let body: { query?: unknown; text?: string; watcher?: unknown; overrides?: unknown } = {};
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
    let limit = DEFAULT_RESULT_LIMIT;
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const cls = text ? classifySearch(text) : null;
    const ai = text ? await parseAskWithAI(text) : null;
    if (ai) {
      query = ai.query;
      limit = ai.limit;
    } else {
      query = body.query ? coerceQuery(body.query) : text ? naiveParseQuery(text) : { ...EMPTY_QUERY };
      if (text) limit = parseRequestedCount(text);
    }
    // "SOMETHING LIKE TULSA KING" IS A DIFFERENT QUESTION.
    //
    // The Refine box posts here, but only the ask route knew how to answer a
    // "more like X" request — this one read `ai.query` and dropped `ai.similarTo`
    // on the floor. The reference vanished, the ask degraded to generic
    // discovery, and someone asking for something like a mob drama got six
    // unrelated new releases. Same retrieval path as the ask route now: resolve
    // the named title, seed from its neighbours, and fall through to ordinary
    // discovery when there is no confident match rather than guessing.
    // Precedence matters: the classifier's `reference` is the raw matched
    // span — for "Looking for something similar to Tulsa King that I would
    // like" that is the WHOLE SENTENCE, which resolves to no title at all.
    // The AI's extraction first, then the regex, and the raw span only as a
    // last resort.
    const reference =
      (ai?.similarTo ?? '').trim() ||
      (text ? extractReference(text) : null) ||
      (cls?.mode === 'similar_to' ? (cls.reference ?? null) : null);
    if (reference && cls?.mode === 'similar_to') {
      // An explicitly stated media type ("a boxing MOVIE like Rocky") is not a
      // guess and must survive into the results. Without it the seed's own type
      // became the filter, and a movie request read back as "Shows".
      const similar = await askSimilarTo(supabase, user.id, reference, limit, statedMediaType(text, cls));
      if (similar) {
        return NextResponse.json({
          query: similar.query,
          scoredFor: similar.scoredFor,
          relaxed: null,
          items: similar.items.map((i) => ({ ...i, posterUrl: tmdbImage(i.posterPath, 'w342') })),
        });
      }
    }

    // Foreign-origin / English-audio / runtime augmentation — the SAME unified
    // step the ask route applies. Neither parser extracts these, so without it
    // "a Spanish film with English audio under two hours" would keep only
    // "movie" and leak wrong-origin results. Restricts the pool to the real
    // origin/language + runtime and requires English audio at verification.
    query = augmentInternational(query, text);
    // WHAT YOU SET BY HAND BEATS WHAT WE READ IN YOUR SENTENCE.
    //
    // The free text is re-parsed on every run, so without this a user who ran
    // an ask and then dragged a slider got their sentence's value back and the
    // same results — the control looked broken because it WAS being discarded.
    // `overrides` is the list of fields the user has touched since that
    // sentence was typed; each one is copied from the client's query on top of
    // whatever the parse produced. Typing a new ask clears the list.
    if (body.query) {
      const overrides = sanitizeOverrides(body.overrides, EMPTY_QUERY);
      if (overrides.length > 0) query = applyOverrides(query, coerceQuery(body.query), overrides);
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

    const coerceWatcher = (raw: unknown): Watcher | null => {
      const w = raw as Partial<Watcher> | undefined;
      if (w && typeof w.name === 'string' && Array.isArray(w.love) && Array.isArray(w.avoid)) {
        return { name: w.name.slice(0, 40), love: w.love.map(String).slice(0, 12), avoid: w.avoid.map(String).slice(0, 12) };
      }
      return null;
    };
    // `watchers` (array) = HOUSEHOLD mode: the user plus everyone named decide
    // together, ranked by the floor-weighted household verdict. `watcher`
    // (single) keeps the legacy "score for that one person" behaviour.
    const bodyWatchers = (body as { watchers?: unknown }).watchers;
    const household = Array.isArray(bodyWatchers)
      ? bodyWatchers.map(coerceWatcher).filter((x): x is Watcher => x !== null).slice(0, 6)
      : null;
    const watcher = coerceWatcher(body.watcher);

    const result = await runFinder(supabase, user.id, query, household && household.length > 0 ? household : watcher, limit);
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
