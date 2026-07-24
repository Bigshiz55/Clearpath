import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runFinder, type FinderQuery, type Watcher } from '@/lib/finder';
import { askJudgeTitle, askSimilarTo, extractReference } from '@/lib/askJudge';
import { naiveParseQuery, EMPTY_QUERY } from '@/lib/finderParse';
import { tmdbImage } from '@/lib/tmdb/image';
import { parseAskWithAI, resolvePersonId, parseRequestedCount } from '@/lib/askParse';
import { understandIntent } from '@/lib/search/retrieval/intent';
import { expandQueries } from '@/lib/search/retrieval/expand';
import { recover } from '@/lib/search/retrieval/recovery';
import { clarify } from '@/lib/search/clarify/engine';

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

    // 1) If they named a specific title, put THAT on trial (full verdict + reasons).
    const text = typeof body.text === 'string' ? body.text.slice(0, 300) : '';

    // 0) Clarification Engine (feature-flagged; default OFF so production is
    // unchanged). Runs before search: only a LOW-confidence ambiguous query is
    // intercepted with a single localized tap-clarification. High/medium proceed
    // to the normal flow. Localized to the caller's locale (body.locale) or the
    // detected query language. Pure + non-breaking.
    if (process.env.CLARIFY_ENGINE === '1' && text.trim()) {
      const appLocale = typeof (body as { locale?: unknown }).locale === 'string' ? (body as { locale: string }).locale : null;
      const c = clarify(text, { appLocale });
      if (c.decision.action === 'clarify') {
        return NextResponse.json({
          kind: 'clarification',
          locale: c.locale,
          dir: c.dir,
          heading: c.clarification!.heading,
          options: c.clarification!.options,           // localized tap targets, canonical meaningKey/intent attached
          canonicalIntents: c.decision.options.map((o) => ({ intent: o.intent, meaningKey: o.meaningKey, confidence: o.confidence })),
          topConfidence: c.decision.topConfidence,
        });
      }
    }

    if (text.trim()) {
      const titled = await askJudgeTitle(supabase, user.id, text);
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
    const reference = (ai?.similarTo ?? '').trim() || (text ? extractReference(text) : null);
    if (reference) {
      const wantCount = text ? parseRequestedCount(text) : 10;
      const similar = await askSimilarTo(supabase, user.id, reference, wantCount);
      if (similar && similar.kind === 'similar') {
        return NextResponse.json({
          kind: 'search',
          query: similar.query,
          scoredFor: similar.scoredFor,
          relaxed: null,
          items: similar.items.map((i) => ({ ...i, posterUrl: tmdbImage(i.posterPath, 'w342') })),
        });
      }
      // A resolved similar request that qualified ZERO candidates returns an
      // honest no-close-matches state — it is NEVER silently handed to the
      // ungated Finder. Broader, personally-appealing titles are returned in a
      // clearly-labelled separate field, never blended with similar results.
      if (similar && similar.kind === 'no_close_matches') {
        return NextResponse.json({
          kind: 'no_close_matches',
          scoredFor: similar.scoredFor,
          interpretation: similar.noClose.interpretation,
          reason: similar.noClose.reason,
          gateBreakdown: similar.noClose.gateBreakdown,
          candidatesConsidered: similar.noClose.candidatesConsidered,
          broadenOptions: similar.noClose.broadenOptions,
          message: similar.noClose.message,
          broaderAlternatives: similar.broaderAlternatives.map((i) => ({
            ...i, posterUrl: tmdbImage(i.posterPath, 'w342'), label: 'broader_alternative',
          })),
        });
      }
      // similar === null → the reference title couldn't be resolved at all, so
      // this was not a similar-to request; fall through to plain discovery.
    }

    if (ai) {
      query = ai.query;
      limit = ai.limit;
    } else {
      query = body.query ? coerceQuery(body.query) : text ? naiveParseQuery(text) : { ...EMPTY_QUERY };
      if (text) limit = parseRequestedCount(text);
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

    let watcher: Watcher | null = null;
    const w = body.watcher as Partial<Watcher> | undefined;
    if (w && typeof w.name === 'string' && Array.isArray(w.love) && Array.isArray(w.avoid)) {
      watcher = { name: w.name.slice(0, 40), love: w.love.map(String).slice(0, 12), avoid: w.avoid.map(String).slice(0, 12) };
    }

    const result = await runFinder(supabase, user.id, query, watcher, limit);

    // The never-dead-end guarantee: a literal search must NEVER terminate on a bare
    // "No results". When discovery finds nothing, return an honest RECOVERY state —
    // likely interpretations + useful suggestions (navigation/refinements), and a
    // single clarifying question only when necessary. No titles are fabricated.
    if (result.items.length === 0 && text.trim()) {
      const intent = understandIntent(text);
      const expansions = expandQueries(text, intent);
      const recovery = recover(text, intent, expansions, []);
      return NextResponse.json({
        kind: 'recovery',
        scoredFor: result.scoredFor,
        query,
        intent: intent.kind,
        interpretations: recovery.interpretations,
        suggestions: recovery.suggestions,
        clarifyingQuestion: recovery.clarifyingQuestion,
        message: recovery.message,
        relaxed: result.relaxed,
      });
    }

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
