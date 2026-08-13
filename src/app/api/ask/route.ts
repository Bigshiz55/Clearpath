import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runFinder, DEFAULT_RESULT_LIMIT, type FinderQuery, type Watcher } from '@/lib/finder';
import { askJudgeTitle, askSimilarTo, extractReference } from '@/lib/askJudge';
import { naiveParseQuery, EMPTY_QUERY, parseTopicTerms, extractExcludedPerson } from '@/lib/finderParse';
import { tmdbImage } from '@/lib/tmdb/image';
import { searchKeywords, searchPeople, getCredits, searchTitles, getTitle } from '@/lib/tmdb/client';
import { parseAskWithAI, resolvePersonId, parseRequestedCount } from '@/lib/askParse';
import { augmentInternational } from '@/lib/askInternational';
import { applyRequiredSubject, resolveSubjectRequirementForTerms } from '@/lib/finderSubject';
import { getBuildInfo } from '@/lib/buildInfo';
import { routeAsk } from '@/lib/critic/gate';
import { stripAnchorSpans } from '@/lib/critic/request';
import { needsClarification, applyChoice, readClarification } from '@/lib/critic/clarifyRequest';
import { buildCriticState } from '@/lib/critic/orchestrate';
import { resolveAnchor } from '@/lib/critic/anchor';
import { runStrands } from '@/lib/critic/strands';
import { rankCriticCandidates } from '@/lib/critic/decide';
import { buildComparativeExplanation } from '@/lib/critic/explain';
import { getCachedDimensions } from '@/lib/titleDimensions';
import { loadPreferenceCached } from '@/lib/preference/store';
import { detectOrigin, detectAudio, detectNetwork, detectPlatform } from '@/lib/nlu/detectors';
import { classifySearch, statedMediaType } from '@/lib/nlu/searchMode';
import { buildQueryPlan } from '@/lib/nlu/queryPlan';
import { mediaTypeSatisfies, resolveSource } from '@/lib/nlu/mediaOntology';
import { lexicalIntent } from '@/lib/search/searchIntent';
import {
  applyTurn,
  chipsFor,
  sanitizeRequestState,
  stateToQuery,
  hasConstraints,
  type CanonicalRequest,
  type TurnContext,
} from '@/lib/nlu/conversationState';
import { createHash, randomUUID } from 'node:crypto';
import { serverEnv } from '@/lib/env';
import { runAiDiscovery, recordShadowInterpretation } from '@/lib/ai/discoveryBridge';

/**
 * "Something like X" is best served by TMDB-similar ONLY when the reference is
 * the dominant signal. When the ask ALSO carries hard constraints — a foreign
 * origin, a platform/network, or English audio — raw similar (which ignores all
 * of them) would return wrong-origin / wrong-platform titles. In that case we
 * fall through to the ONE finder pipeline, which enforces those constraints and
 * still carries the reference for read-back. Unifies the two retrieval paths.
 */
/**
 * The TMDB keyword ids that describe a reference title's THEMES. Used to bias a
 * hard-filtered discovery toward "like X" without abandoning the hard filters:
 * "like Rocky, after 2020, on Hulu" keeps Rocky's boxing/underdog keywords so
 * the year+provider-filtered pool leans toward the right feel. Best-effort and
 * bounded; any failure yields [] (the discovery still runs, just unbiased).
 */
async function referenceKeywordIds(referenceTitles: string[]): Promise<number[]> {
  const out = new Set<number>();
  for (const name of referenceTitles.slice(0, 2)) {
    /* IDENTITY THROUGH GC2, NOT THROUGH SEARCH ORDER.
       This used to be `searchTitles(name)[0]` — popularity treated as identity.
       It did not merely risk the wrong anchor, it reliably produced one: "like
       Furious" fetched the keywords of Furious 7, so the search was biased
       toward a film the user had not named, and the read-back said we had kept
       the feel of the one they did. `resolveAnchor` refuses instead of
       guessing, and an anchor it cannot place contributes no keywords at all.

       STILL USED BY THE NON-CRITIC CONVERSATIONAL PATH, which carries reference
       titles as strings and never resolves them. The critic path takes
       `anchorKeywordsFor` below instead, which reuses the resolution GC2
       already did rather than repeating it. */
    const candidates = (await searchTitles(name).catch(() => [])).map((c) => ({
      id: c.id,
      title: c.title,
      mediaType: c.mediaType,
      year: c.year ?? null,
    }));
    const res = resolveAnchor({ spokenAs: name }, candidates);
    if (res.status !== 'resolved') continue;
    const kws = await keywordsForAnchor(res.anchor);
    kws.forEach((id) => out.add(id));
  }
  return [...out].slice(0, 12);
}

/** TMDB keyword ids for ONE already-resolved anchor. No identity work at all. */
async function keywordsForAnchor(a: { mediaType: 'movie' | 'tv'; tmdbId: number }): Promise<number[]> {
  const detail = await getTitle(a.mediaType, a.tmdbId).catch(() => null);
  const kwNames = (detail?.keywords ?? []).slice(0, 6);
  if (kwNames.length === 0) return [];
  return (await searchKeywords(kwNames).catch(() => [])).slice(0, 8);
}

/**
 * The critic path's soft keyword seed, derived from anchors GC2 already placed.
 *
 * Anchors are fetched CONCURRENTLY — a two-anchor comparison should cost one
 * round-trip, not two — and any failure yields an empty seed, because the
 * keywords are a recall widener and never the comparison itself.
 */
async function anchorKeywordsFor(
  anchors: readonly { mediaType: 'movie' | 'tv'; tmdbId: number }[],
): Promise<number[]> {
  const per = await Promise.all(anchors.slice(0, 2).map((a) => keywordsForAnchor(a).catch(() => [])));
  /* INTERLEAVED, NOT CONCATENATED. `blend` turns each seed into its own strand
     and the strand budget takes a PREFIX of this list, so anchor-A-then-
     anchor-B ordering meant a well-tagged A consumed the whole budget and B
     contributed nothing — the precise starvation per-seed strands exist to
     prevent. Round-robin makes the prefix contain both sides. */
  const out: number[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < Math.max(...per.map((p) => p.length), 0); i++) {
    for (const list of per) {
      const kw = list[i];
      if (kw == null || seen.has(kw)) continue;
      seen.add(kw);
      out.push(kw);
    }
  }
  return out.slice(0, 12);
}

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
    // A developer-safe request id, echoed on every response so a support report
    // ("I searched boxing and got Absentia") can be traced to the exact call.
    const requestId = randomUUID();

    // CONVERSATION MODE — the client sent its canonical request state, so this
    // turn MERGES into that state instead of being read in isolation. "Newer."
    // after "Something like Rocky." finally means newer-than-those, and every
    // earlier constraint survives. The state is client-held and re-validated
    // here on every request; there is no server-side conversation store to
    // leak between users, and `userKey` (a one-way hash of the user id) lets
    // the client refuse a stored conversation that belongs to someone else.
    const convRaw = (body as { conversation?: unknown }).conversation;
    const conversational = convRaw !== undefined;
    const userKey = createHash('sha256').update(user.id).digest('hex').slice(0, 12);
    let convState: CanonicalRequest | null = null;
    let convInterpretation: string[] = [];
    let convClarify: string | null = null;
    let prevHadConstraints = false;
    if (conversational) {
      // CROSS-USER GUARD (server-enforced, not just client-trusted). The client
      // stores the userKey the server issued; it must send it back. If it does
      // not match THIS authenticated user, the incoming state belonged to a
      // different account (or was tampered) — discard it and start fresh so
      // User B can never resume User A's conversation, whatever the client does.
      const claimedKey = typeof (body as { userKey?: unknown }).userKey === 'string' ? (body as { userKey: string }).userKey : null;
      const trustPrior = claimedKey == null || claimedKey === userKey;
      const prev = trustPrior ? sanitizeRequestState(convRaw) : sanitizeRequestState({});
      if (!trustPrior) convInterpretation.push('Started a fresh conversation for your account.');
      prevHadConstraints = hasConstraints(prev);
      const ctxIn = ((body as { turnContext?: unknown }).turnContext ?? {}) as {
        shownYears?: unknown;
        shownRuntimes?: unknown;
        shownIds?: unknown;
      };
      const ctx: TurnContext = {
        shownYears: Array.isArray(ctxIn.shownYears)
          ? ctxIn.shownYears.map(Number).filter(Number.isFinite).slice(0, 40)
          : undefined,
        shownRuntimes: Array.isArray(ctxIn.shownRuntimes)
          ? ctxIn.shownRuntimes.map(Number).filter(Number.isFinite).slice(0, 40)
          : undefined,
        shownIds: Array.isArray(ctxIn.shownIds)
          ? sanitizeRequestState({ excludeIds: ctxIn.shownIds }).excludeIds
          : undefined,
      };
      const turn = applyTurn(prev, text, ctx);
      convState = turn.state;
      convInterpretation = [...convInterpretation, ...turn.interpretation];
      convClarify = turn.clarify;
    }
    /** Attach the conversation envelope to any response in conversation mode. */
    const withConv = (payload: Record<string, unknown>) =>
      conversational && convState
        ? {
            ...payload,
            conversation: convState,
            chips: chipsFor(convState),
            interpretation: convInterpretation,
            clarify: convClarify,
            userKey,
          }
        : payload;

    // 0.5) A question about the USER'S OWN history is answered from their list,
    // never from the general catalog — "What haven't I finished?" was returning
    // this week's trending titles, which is a non-answer wearing a confident
    // face. Empty history gets an honest empty answer, not a trending dump.
    const HISTORY_ASK =
      /\bwhat\s+(?:have\s+i\s+not|haven'?t\s+i|didn'?t\s+i|did\s+i\s+not)\s+(?:finish(?:ed)?|watch(?:ed)?)\b|\bcontinue\s+watching\b|\bpick\s+up\s+where\s+i\s+left\s+off\b/i;
    // People type curly apostrophes ("haven’t") as often as straight ones —
    // normalise before matching or the intent silently misses.
    const asked = text.replace(/[’‘]/g, "'");
    if (HISTORY_ASK.test(asked)) {
      const wantsFinish = /finish/i.test(asked);
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

    // 0.6) A BARE vocabulary word ("crime", "Hulu", "boxing") is a browse
    // request for that thing — it must never be treated as a title ask, no
    // matter what happens to share the name.
    const lex = text.trim() ? lexicalIntent(text) : null;

    // 0.65) THE COMPARATIVE INTENT BOUNDARY.
    //
    // UNDERSTANDING WHAT WAS ASKED PRECEDES CHOOSING WHO ANSWERS IT. This runs
    // BEFORE the AI orchestrator on purpose: in `anthropic` mode
    // `runAiDiscovery` returns a finished search response, so a comparative
    // sentence would otherwise get the canonical GC1–GC5 pipeline under
    // `legacy` and an entirely independent interpretation under `anthropic`.
    // The default being `legacy` made that latent, not safe.
    //
    // `routeAsk` is the single decision, executed by `servingMode.test.ts`, so
    // the ordering rule cannot quietly reverse in a refactor. There is exactly
    // one parser — no Anthropic-specific CriticRequest exists anywhere.
    const aiMode = serverEnv.aiDiscoveryMode();
    const askDecision = routeAsk(text, aiMode, { conversational, lexical: lex != null });
    const criticRequest = askDecision.request;

    // 0.7) AI ORCHESTRATOR (feature-flagged; default legacy = OFF, nothing here
    // runs in production until the owner sets AI_DISCOVERY_MODE + a key). In
    // ANTHROPIC mode Claude is the primary brain for single-shot semantic
    // discovery/similarity: it interprets the request into a validated canonical
    // form, the app resolves entities + qualifies via the deterministic engine,
    // and only then ranks by DNA. Exact-title/person/live-TV intents defer back
    // to the deterministic handlers below. Any AI failure falls through to the
    // legacy path — the user never sees a broken search.
    //
    // Comparatives are NOT its to answer — that is `askDecision` above, and the
    // guard restates it here so the branch is self-explaining at the call site.
    if (aiMode === 'anthropic' && !conversational && text.trim() && !criticRequest) {
      const ai = await runAiDiscovery({ supabase, userId: user.id, text, route: 'ask', limit: parseRequestedCount(text) });
      if (ai.kind === 'clarify') {
        return NextResponse.json({ kind: 'clarify', requestId, clarify: ai.question, options: ai.options, interpretation: ai.interpretation, query: { ...EMPTY_QUERY }, items: [] });
      }
      if (ai.kind === 'search') {
        return NextResponse.json({
          kind: 'search',
          route: '/api/ask',
          requestId,
          appliedText: text,
          brain: 'anthropic',
          query: ai.query,
          interpretation: ai.interpretation,
          scoredFor: ai.scoredFor,
          relaxed: ai.relaxed,
          items: ai.items.map((i) => ({ ...i, posterUrl: tmdbImage(i.posterPath, 'w342') })),
        });
      }
      // ai.kind === 'unavailable' → fall through to the deterministic path.
    }

    // 0.9) THE CRITIC PATH — a request that COMPARES.
    //
    // The relation and the individual anchors were read at 0.65 by the one
    // parser every mode shares, so a comparison cannot survive on the
    // conversational route and silently degrade to a keyword union on the
    // discovery route — or be answered by a different brain entirely.
    //
    // This also sits ABOVE the exact-title lookup deliberately. "Better than
    // Furious or Widows Bay" classifies as `exact_title` today — the whole
    // sentence is searched as if it were the name of a film, finds nothing, and
    // falls through to generic discovery with no anchors at all. That is the
    // precise mechanism behind the Cool Hand Luke answer.
    if (criticRequest) {
      // Stated constraints only. The conversational state already carries the
      // accumulated ones; a fresh ask reads them off the deterministic parser
      // (never the LLM — a hard constraint must not depend on a key being set).
      /* CONSTRAINTS ARE PARSED FROM THE SENTENCE MINUS THE TITLES.
         `naiveParseQuery` reads genre words out of free text and cannot know
         "Supernatural" is an anchor here, so parsing the whole sentence turned
         an anchor's own NAME into a positive `genreIds` filter — which then rode
         the base query onto every strand, gating even the ungated recall floor.
         A guess derived from a title was REMOVING candidates, the one thing GC5
         promises an inference can never do. Genres the user genuinely stated
         ("better than X, but a comedy") survive, because only the known title
         spans are removed. */
      const constraintText = stripAnchorSpans(text, criticRequest.referenceTitles);
      const criticBase: FinderQuery = conversational && convState
        ? stateToQuery(convState)
        : augmentInternational(naiveParseQuery(constraintText), constraintText);
      if (criticRequest.referenceTitles.length > 0) {
        criticBase.similarTo = criticRequest.referenceTitles.join(' / ');
      }

      /* CACHED. `loadPreferenceCached` already existed with a 300s revalidate
         and had ZERO callers — a cache the codebase built and never used. Taste
         DNA is derived from an append-only event log, so a short window costs
         nothing in correctness and removes a full event-table read from every
         comparative request. */
      const { dna } = await loadPreferenceCached(supabase, user.id, Date.now());

      /* A CLARIFICATION THE USER JUST ANSWERED. The client echoes back the
         pending comparison it was given, plus the identity chosen, so the
         ORIGINAL request resumes rather than a new search starting. Anchors
         already placed are carried as canonical ids and never searched again. */
      const answered = readClarification(body);
      const carriedAnchors = answered
        ? applyChoice(answered.comparison, answered.choice).resolved
        : undefined;
      const criticState = await buildCriticState({
        request: criticRequest,
        dna,
        // HARD = what the sentence said. Nothing inferred may enter this object.
        hard: {
          mediaType: criticBase.mediaType,
          minYear: criticBase.minYear ?? null,
          maxYear: criticBase.maxYear ?? null,
          providerIds: criticBase.providerIds,
          excludeGenreIds: criticBase.excludeGenreIds,
          subjectKeywordIds: criticBase.subjectKeywordIds,
        },
        // GC2 JUDGES these candidates; search order never decides identity.
        searchCandidates: async (name) =>
          (await searchTitles(name).catch(() => [])).map((c) => ({
            id: c.id,
            title: c.title,
            mediaType: c.mediaType,
            year: c.year ?? null,
          })),
        // GC3, cache-only. A miss costs the anchor its authority, nothing more.
        loadDimensions: getCachedDimensions,
        /* SOFT seeds, derived from the anchors GC2 ALREADY RESOLVED.
           This used to call `referenceKeywordIds(names)`, which searched and
           resolved each name a SECOND time — two independent resolutions of the
           same title per request, free to disagree, and an extra TMDB identity
           search each. Now the keywords belong to the title we actually chose,
           and the loader runs concurrently with hydration. */
        loadAnchorKeywords: anchorKeywordsFor,
        anchorGenreIds: [],
        preResolved: carriedAnchors,
        mediaType: criticBase.mediaType === 'any' ? undefined : criticBase.mediaType,
      });

      /* NOTHING RESOLVED, NOTHING TO SAY — so do not take the request over.
         With no placed anchor the critic's only strand is the ungated recall
         floor, which is a popularity sweep wearing the authority of a
         comparison. Falling through leaves the user with the existing pipeline,
         which is a weaker answer honestly arrived at rather than a generic one
         presented as understanding. GC2's refusal is worth nothing if the
         caller answers anyway. */
      /* ── AMBIGUOUS OR UNKNOWN ANCHOR → ASK, DON'T ABANDON ──────────────
         GC2 still refuses to guess; this gives that refusal somewhere to go.
         Silently dropping the comparison is a different failure from guessing,
         not a fix for it: for a request whose whole point is the comparison,
         the honest move is the one question that settles it. */
      const clarification = needsClarification(
        text,
        criticRequest.relation,
        criticRequest.modifiers,
        criticRequest.unresolvedModifiers,
        criticState.resolutions,
      );
      if (clarification) {
        return NextResponse.json(
          withConv({
            kind: 'clarify',
            requestId,
            appliedText: text || null,
            clarify: clarification.question,
            // The real candidates, bounded — never an invented option.
            comparisonOptions: clarification.pending.options,
            pendingComparison: clarification.comparison,
            query: criticBase,
            items: [],
          }),
        );
      }

      if (criticState.objective.anchors.length === 0) {
        convInterpretation.push(
          `I couldn't pin down ${criticRequest.referenceTitles.join(' or ')} — answering without the comparison.`,
        );
      } else {
      const limitCritic = text ? parseRequestedCount(text) : DEFAULT_RESULT_LIMIT;
      /* GC5 RETRIEVAL, ISSUED FOR REAL. `hints.strands` always contains at
         least the ungated recall floor, so this is never an empty search — but
         the guard states that dependency rather than assuming it, because a
         zero-strand union would silently return nothing at all. */
      const { hints } = criticState;
      if (hints.strands.length === 0) throw new Error('critic: no retrieval strands');
      const strandRun = await runStrands(
        supabase,
        user.id,
        hints,
        criticBase,
        null,
        limitCritic,
      );
      criticState.attribution.candidateIds = strandRun.candidateIds;

      /* ── GC6 · THE FINAL DECISION ──────────────────────────────────────
         Candidate fingerprints, batch and CACHE-ONLY, keyed on the composite
         `mediaType + tmdbId`. No classifier, no per-title AI call, no title
         string. A candidate the classifier has not reached yet simply
         contributes nothing — it is never read as a neutral 50. */
      const candidateDims = await getCachedDimensions(
        strandRun.items.map((i) => ({ tmdb_id: i.id, media_type: i.mediaType })),
      );

      /* decisionScore = matchScore + planNudge, and nothing else.
         `matchScore` already carries general quality + the user's DURABLE
         preference rules; `buildPlan` already consumed canonical DNA to choose
         its targets. A raw preference nudge here would apply that same evidence
         a second time. See the audit in `docs/CRITIC-SHIP.md`. */
      const ranked = rankCriticCandidates(
        strandRun.items.map((i) => ({
          id: i.id,
          mediaType: i.mediaType,
          matchScore: i.matchScore,
          generalScore: i.generalScore,
          dims: candidateDims.get(`${i.mediaType}-${i.id}`),
        })),
        criticState.plan,
      );

      /* ORDER BY THE DECISION, DISPLAY THE DURABLE MATCH.
         The card keeps showing the Match it earned — general quality plus what
         we lastingly know about this user. `decisionScore` answers a different
         question ("which of these best answers what you asked me RIGHT NOW")
         and is request-specific, so it orders the list and is never written
         back onto the card or into Taste DNA. GC7 explains why the winner won. */
      const byKey = new Map(strandRun.items.map((i) => [`${i.mediaType}-${i.id}`, i]));

      /* ── GC7 · WHY IT WON ──────────────────────────────────────────────
         Built from the SAME contribution trail that produced the order, and
         attached to the item's existing `explain` payload as its own section.
         This is CUSTOMER-FACING, so it is assembled here rather than inside
         the development-only diagnostics below. A candidate the critic did not
         actually move gets `null` and the card renders exactly as before —
         "Why this beats X" must never appear merely because the user typed a
         comparison. */
      const criticItems = ranked.decisions
        .map((d) => {
          const item = byKey.get(d.key);
          if (!item) return null;
          const comparison = buildComparativeExplanation({
            relation: criticState.objective.relation,
            anchors: criticState.objective.anchors,
            contributions: d.contributions,
            nudge: d.criticNudge,
          });
          if (!comparison) return item;
          return {
            ...item,
            // The durable Match and its reasons are untouched below this.
            explain: item.explain
              ? { ...item.explain, comparison: { heading: comparison.heading, helped: comparison.helped, cautions: comparison.cautions } }
              : item.explain,
          };
        })
        .filter((i): i is NonNullable<typeof i> => i != null)
        .slice(0, limitCritic);

      criticState.attribution.finalRankingConsumesPlan = ranked.applied;

      return NextResponse.json(
        withConv({
          kind: 'search',
          requestId,
          appliedText: text || null,
          query: criticBase,
          scoredFor: strandRun.scoredFor || 'Your match',
          relaxed: strandRun.relaxed,
          items: criticItems.map((i) => ({ ...i, posterUrl: tmdbImage(i.posterPath, 'w342') })),
          // Structured evidence for development — enums, ids, labels and
          // numbers. Never a prompt, never free-text reasoning.
          ...(process.env.NODE_ENV === 'production'
            ? {}
            : {
                criticAttribution: {
                  ...criticState.attribution,
                  perStrand: strandRun.perStrand,
                  decisions: ranked.decisions.slice(0, limitCritic),
                },
              }),
        }),
      );
      }
    }

    // 1) Named-title lookup → put THAT title on trial (with the identity guard,
    // exact-match ranking and provider hard filter inside askJudgeTitle).
    // Mid-conversation this is OFF: once constraints have accumulated, a short
    // follow-up ("Newer.", "Rocky") is a refinement of the case, not a fresh
    // title lookup.
    if (text.trim() && cls?.mode !== 'similar_to' && !lex && !(conversational && prevHadConstraints)) {
      const titled = await askJudgeTitle(supabase, user.id, text, cls ?? undefined);
      if (titled) return NextResponse.json(withConv({ kind: 'title', ...titled }));
    }

    // 2a) CONVERSATION-DRIVEN DISCOVERY — the canonical state IS the query.
    // Deterministic by design: no LLM parse of the raw sentence; the state the
    // user can see as chips is exactly what runs.
    if (conversational && convState) {
      const s = convState;
      const limitConv = text ? parseRequestedCount(text) : DEFAULT_RESULT_LIMIT;
      // Hard constraints that the similarity path cannot enforce.
      const stateHasHard =
        s.minYear != null ||
        s.maxYear != null ||
        s.releasedAfter != null ||
        s.maxRuntime != null ||
        s.providers.length > 0 ||
        s.monetization.length > 0 ||
        s.onMyServices ||
        s.excludeGenreIds.length > 0 ||
        s.includeGenreIds.length > 0 ||
        s.subjects.length > 0 ||
        s.minImdb != null ||
        s.minAudience != null;

      // EVERY excluded person is enforced, not only the first. Each name is
      // resolved against the real people catalog; an unresolvable name is a
      // no-op, never a guess. (Fixes the "only the first person" defect.)
      const excludePersonIds = (
        await Promise.all(
          s.excludePeople.map((name) => searchPeople(name).then((r) => r[0]?.id ?? null).catch(() => null)),
        )
      ).filter((x): x is number => x != null);
      const excludeKeys = new Set(s.excludeIds.map((x) => `${x.mediaType}-${x.id}`));
      const dropExcludedPeople = async <T extends { id: number; mediaType: 'movie' | 'tv' }>(items: T[]): Promise<T[]> => {
        if (excludePersonIds.length === 0) return items;
        const keep = await Promise.all(
          items.map((i) =>
            getCredits(i.mediaType === 'tv' ? 'tv' : 'movie', i.id)
              .then((c) => {
                const people = new Set([
                  ...c.cast.map((p) => p.id),
                  ...c.directors.map((p) => p.id),
                  ...c.creators.map((p) => p.id),
                ]);
                return !excludePersonIds.some((pid) => people.has(pid));
              })
              .catch(() => true),
          ),
        );
        return items.filter((_, idx) => keep[idx]);
      };

      // Pure "more like X" with no hard constraints → the similarity engine.
      if (s.referenceTitles.length > 0 && !stateHasHard) {
        const similar = await askSimilarTo(
          supabase,
          user.id,
          `like ${s.referenceTitles.join(' or ')}`,
          limitConv,
          s.mediaType === 'any' ? null : s.mediaType,
          excludePersonIds[0] ?? null,
        );
        if (similar) {
          const filtered = await dropExcludedPeople(
            similar.items.filter((i) => !excludeKeys.has(`${i.mediaType}-${i.id}`)),
          );
          return NextResponse.json(
            withConv({
              kind: 'search',
              query: similar.query,
              scoredFor: similar.scoredFor,
              relaxed: null,
              items: filtered.map((i) => ({ ...i, posterUrl: tmdbImage(i.posterPath, 'w342') })),
            }),
          );
        }
      }

      // Otherwise: the full constraint set through the finder.
      const q = stateToQuery(s);
      const keywordIds = new Set<number>();
      // A NAMED SUBJECT is a HARD constraint on THIS path too — the exact same
      // semantic-eligibility pipeline the Forensic Search uses. Bare subjects
      // were previously resolved to SOFT keyword bias, so Taste DNA ranked a
      // keyword-tinted popularity list and "boxing" came back as whatever the
      // viewer's DNA liked (a crime/drama fan got Absentia). Now the subject
      // sets the required-subject lexemes, so a keyword match is only a
      // CANDIDATE and only titles where the subject is genuinely central are
      // eligible — no silent fall-through to generic recommendations.
      if (s.subjects.length > 0) {
        const sr = await resolveSubjectRequirementForTerms(s.subjects);
        if (sr) {
          q.subjectKeywordIds = sr.keywordIds;
          q.subjectLexemes = sr.requirement.lexemes;
          q.subjectStrict = true;
          q.subjectLabel = sr.requirement.label;
          q.subjectCanonical = sr.requirement.canonical;
          if (sr.keywordIds.length === 0) {
            convInterpretation.push(`"${s.subjects.join(', ')}" isn't a well-tagged catalog subject — showing only titles where it is genuinely central, if any`);
          }
        }
      }
      // REFERENCE + HARD CONSTRAINTS must not degenerate into filtered
      // popularity. The reference title's own TMDB keywords bias the
      // hard-filtered discovery toward its themes, so "like Rocky, after 2020,
      // on Hulu" returns boxing/underdog titles that ALSO clear every hard
      // filter — similarity preserved, no constraint dropped.
      if (s.referenceTitles.length > 0) {
        const refKws = await referenceKeywordIds(s.referenceTitles);
        refKws.forEach((id) => keywordIds.add(id));
        if (refKws.length > 0) convInterpretation.push(`kept the feel of ${s.referenceTitles.join(' / ')} within your other filters`);
      }
      if (keywordIds.size > 0) q.keywordIds = [...keywordIds];
      if (s.includePeople.length > 0) {
        const pids = (
          await Promise.all(s.includePeople.map((p) => searchPeople(p).then((r) => r[0]?.id ?? null).catch(() => null)))
        ).filter((x): x is number => x != null);
        if (pids.length) q.castIds = pids;
      }
      if (s.providers.length > 0) {
        const ids: number[] = [];
        for (const name of s.providers) {
          const src = resolveSource(name);
          if (src?.providerId != null) ids.push(src.providerId);
          else convInterpretation.push(`${name} is a TV network — network filtering isn't available in recommendations yet`);
        }
        if (ids.length) q.providerIds = ids;
      }
      if (s.monetization.length > 0) q.monetization = s.monetization.join('|');
      if (s.referenceTitles.length > 0) q.similarTo = s.referenceTitles.join(' / ');

      const convResult = await runFinder(supabase, user.id, q, null, limitConv);
      let convItems = await dropExcludedPeople(
        convResult.items.filter((i) => !excludeKeys.has(`${i.mediaType}-${i.id}`)),
      );
      // NO-FILLER SAFETY NET: a named subject may never ship a title whose
      // semantic verdict did not PASS — the Judge shows eligible titles or an
      // honest shortfall, never a generic recommendation.
      if (q.subjectLexemes && q.subjectLexemes.length > 0) {
        convItems = convItems.filter((i) => i.subjectEvidence?.satisfied === true);
      }
      return NextResponse.json(
        withConv({
          kind: 'search',
          requestId,
          appliedText: text || null,
          query: q,
          diagnostics: convResult.diagnostics,
          scoredFor: convResult.scoredFor,
          relaxed: convResult.relaxed,
          items: convItems.map((i) => ({ ...i, posterUrl: tmdbImage(i.posterPath, 'w342') })),
        }),
      );
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
      // "released after 2020" is a YEAR BOUND, not a recency window — but the
      // LLM parse kept turning it into sinceMonths too, and the stacked pair
      // ("since 2020" AND "last 36 months") shrank the window until nothing
      // survived. When the sentence states a year and no explicit recency
      // phrase, the year is the whole statement.
      if (det.minYear != null && det.sinceMonths == null && query.sinceMonths != null) {
        query.sinceMonths = null;
      }
      // A stated SUBJECT beats a guessed genre. "wrestling movies" reached
      // discovery as (genre Action) AND (keyword wrestling) — the guessed
      // genre starved the stated subject until the relaxation pass dropped
      // the subject itself and answered with generic action. Keep only the
      // genres the sentence actually states whenever a subject keyword is
      // present; the subject is the request.
      if ((query.keywordIds?.length ?? 0) > 0 || parseTopicTerms(text).length > 0) {
        const stated = new Set(det.genreIds);
        if (query.genreIds.length > 0) query.genreIds = query.genreIds.filter((g) => stated.has(g));
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

    // A bare PROVIDER search ("Hulu", "Acorn TV") is "what's good on that
    // service" — filter to the provider's included/free tiers so every result
    // is actually watchable there, never a rental dressed up as included.
    if (lex?.kind === 'provider' && !(query.providerIds?.length)) {
      query.providerIds = [lex.providerId];
      if (!query.monetization) query.monetization = 'flatrate|free|ads';
    }

    // Guarantee the actor filter regardless of AI: if a person is named and not
    // already resolved, look them up (fuzzy, so misspellings still match).
    if (text && (!query.castIds || query.castIds.length === 0) && !lex) {
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

    // SHARED REQUIRED-SUBJECT SEMANTICS. Ask the Judge honors a named subject as
    // a hard constraint exactly as the Forensic Search does, from the one shared
    // helper — so "a boxing movie" means the same thing on both routes and the
    // subject can never be degraded into genres here either.
    let askInterpretation: string[] = [];
    if (text) {
      const applied = await applyRequiredSubject(query, text);
      query = applied.query;
      askInterpretation = applied.interpretation;
    }

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

    // NO-FILLER SAFETY NET (shared with Forensic Search): eligibility already
    // ran inside runFinder; a subject request may never ship a title whose
    // semantic verdict did not PASS. The Judge receives only eligible titles.
    if (query.subjectLexemes && query.subjectLexemes.length > 0) {
      items = items.filter((i) => i.subjectEvidence?.satisfied === true);
    }

    // SHADOW MODE: legacy served the user above; record a safe structural
    // comparison of what Claude would have interpreted. Metadata only, never
    // awaited into the response path. No-op unless AI_DISCOVERY_MODE=shadow.
    if (aiMode === 'shadow' && text.trim()) {
      void recordShadowInterpretation({ text, route: 'ask', legacyResultCount: items.length });
    }

    return NextResponse.json(
      {
        kind: 'search',
        route: '/api/ask',
        requestId,
        appliedText: text || null,
        sha: getBuildInfo().gitSha || 'unknown',
        query,
        interpretation: askInterpretation,
        diagnostics: result.diagnostics,
        scoredFor: result.scoredFor,
        relaxed: result.relaxed,
        items: items.map((i) => ({ ...i, posterUrl: tmdbImage(i.posterPath, 'w342') })),
      },
      { headers: { 'X-WatchVerd1ct-SHA': getBuildInfo().gitSha || 'unknown' } },
    );
  } catch {
    return NextResponse.json({ error: 'The court hit a snag.' }, { status: 500 });
  }
}
