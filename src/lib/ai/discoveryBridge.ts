import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runFinder, DEFAULT_RESULT_LIMIT, type FinderQuery, type FinderItem } from '@/lib/finder';
import { resolveSubjectRequirementForTerms } from '@/lib/finderSubject';
import { resolveSource } from '@/lib/nlu/mediaOntology';
import { askSimilarTo } from '@/lib/askJudge';
import { searchKeywords, searchPeople, searchTitles, getTitle, getCredits } from '@/lib/tmdb/client';
import { tmdbImage } from '@/lib/tmdb/image';
import { interpretDiscoveryRequest, continueDiscoveryConversation } from './orchestrator';
import { canonicalToQuery } from './canonicalToQuery';
import { recordShadowComparison, type AiRoute } from './telemetry';
import type { AiTurn } from './types';
import type { CanonicalDiscoveryRequest } from './schemas';

/**
 * THE DISCOVERY BRIDGE — the seam between the AI orchestrator and the existing
 * deterministic pipeline. It turns a validated CanonicalDiscoveryRequest into a
 * real result by resolving entities through the app's OWN typed tools
 * (resolveSubjectRequirementForTerms, searchPeople, resolveSource, askSimilarTo)
 * and then running the deterministic `runFinder` — so QUALIFY FIRST (subject
 * eligibility, hard filters) still happens before DNA ranking. Claude never
 * touches the catalog directly; it only produced the intent.
 *
 * This module is invoked ONLY when AI_DISCOVERY_MODE is shadow/anthropic — it is
 * dormant (never imported into a hot path) in the default legacy mode.
 */

/** A reference title's own TMDB keywords, to bias a hard-filtered discovery
 *  toward its themes without abandoning the filters (mirrors the ask route). */
async function referenceKeywordIds(referenceTitles: string[]): Promise<number[]> {
  const out = new Set<number>();
  for (const name of referenceTitles.slice(0, 2)) {
    const hit = (await searchTitles(name).catch(() => []))[0];
    if (!hit) continue;
    const detail = await getTitle(hit.mediaType, hit.id).catch(() => null);
    const kwNames = (detail?.keywords ?? []).slice(0, 6);
    if (kwNames.length === 0) continue;
    const ids = await searchKeywords(kwNames).catch(() => []);
    ids.slice(0, 8).forEach((id) => out.add(id));
  }
  return [...out].slice(0, 12);
}

export type AiDiscoveryResult =
  | { kind: 'search'; query: FinderQuery; items: FinderItem[]; scoredFor: string; relaxed: string | null; interpretation: string[]; summary: string }
  | { kind: 'clarify'; question: string; options: string[]; summary: string; interpretation: string[] }
  /** The AI layer was unavailable (no key / timeout / invalid). The caller
   *  decides how to degrade — legacy fallback or the honest "smart search
   *  temporarily unavailable" message. */
  | { kind: 'unavailable'; failureReason?: string };

/** Resolve a validated canonical request into a concrete result via the
 *  deterministic engine. Pure orchestration over existing tools + runFinder. */
export async function resolveCanonicalToResult(
  supabase: SupabaseClient,
  userId: string,
  req: CanonicalDiscoveryRequest,
  limit: number,
): Promise<AiDiscoveryResult> {
  // Exact-title, person-filmography, and live-TV requests have specialized
  // DETERMINISTIC handlers (askJudgeTitle, person search, the live path). Claude
  // is the brain for semantic discovery/similarity; it defers those intents to
  // the validators that own them, exactly as the architecture intends.
  if (req.intent === 'exact_title' || req.intent === 'person' || req.intent === 'live_tv') {
    return { kind: 'unavailable', failureReason: 'deferred_to_deterministic' };
  }

  const interpretation = [req.interpretationSummary, ...req.interpretationAssumptions];
  const { query, pendingResolution, clarify } = canonicalToQuery(req);

  if (clarify) {
    const a = req.ambiguities[0];
    return {
      kind: 'clarify',
      question: a?.question ?? 'Could you tell me a little more about what you want?',
      options: a?.options ?? [],
      summary: req.interpretationSummary,
      interpretation,
    };
  }

  const refs = pendingResolution.referenceTitles.map((r) => r.text);

  // Excluded people, resolved against the real people catalog (unresolvable = no-op).
  const excludePersonIds = (
    await Promise.all(pendingResolution.excludedPeople.map((n) => searchPeople(n).then((r) => r[0]?.id ?? null).catch(() => null)))
  ).filter((x): x is number => x != null);

  const hasHard =
    pendingResolution.requiredSubjects.length > 0 ||
    pendingResolution.excludedSubjects.length > 0 ||
    pendingResolution.requiredPeople.length > 0 ||
    pendingResolution.requiredProviders.length > 0 ||
    (query.excludeGenreIds?.length ?? 0) > 0 ||
    query.minReleaseDate != null ||
    query.maxYear != null ||
    query.maxRuntime != null ||
    query.monetization != null;

  // Pure "like X" with no hard constraints → the similarity engine, exactly as
  // the legacy ask route does.
  if (refs.length > 0 && !hasHard) {
    const similar = await askSimilarTo(
      supabase,
      userId,
      `like ${refs.join(' or ')}`,
      limit,
      query.mediaType === 'any' ? null : query.mediaType,
      excludePersonIds[0] ?? null,
    );
    if (similar) {
      return { kind: 'search', query: similar.query, items: similar.items, scoredFor: similar.scoredFor, relaxed: null, interpretation, summary: req.interpretationSummary };
    }
  }

  // Otherwise resolve every hard entity onto the finder query.
  if (pendingResolution.requiredSubjects.length > 0) {
    const sr = await resolveSubjectRequirementForTerms(pendingResolution.requiredSubjects);
    if (sr) {
      query.subjectKeywordIds = sr.keywordIds;
      query.subjectLexemes = sr.requirement.lexemes;
      query.subjectStrict = true;
      query.subjectLabel = sr.requirement.label;
      query.subjectCanonical = sr.requirement.canonical;
    }
  }
  if (pendingResolution.excludedSubjects.length > 0) {
    const ids = await searchKeywords(pendingResolution.excludedSubjects).catch(() => []);
    if (ids.length) query.excludeKeywordIds = [...new Set([...(query.excludeKeywordIds ?? []), ...ids])];
  }
  if (pendingResolution.requiredPeople.length > 0) {
    const pids = (
      await Promise.all(pendingResolution.requiredPeople.map((p) => searchPeople(p).then((r) => r[0]?.id ?? null).catch(() => null)))
    ).filter((x): x is number => x != null);
    if (pids.length) query.castIds = pids;
  }
  if (pendingResolution.requiredProviders.length > 0) {
    const ids: number[] = [];
    for (const name of pendingResolution.requiredProviders) {
      const src = resolveSource(name);
      if (src?.providerId != null) ids.push(src.providerId);
    }
    if (ids.length) query.providerIds = ids;
  }
  // Reference themes bias a hard-filtered pool toward the requested feel.
  if (refs.length > 0) {
    const refKws = await referenceKeywordIds(refs);
    if (refKws.length) query.keywordIds = [...new Set([...(query.keywordIds ?? []), ...refKws])];
  }

  const result = await runFinder(supabase, userId, query, null, limit);
  let items = result.items;

  // Excluded-person hard removal on real credit evidence.
  if (excludePersonIds.length > 0) {
    const keep = await Promise.all(
      items.map((i) =>
        getCredits(i.mediaType === 'tv' ? 'tv' : 'movie', i.id)
          .then((c) => {
            const people = new Set([...c.cast.map((p) => p.id), ...c.directors.map((p) => p.id), ...c.creators.map((p) => p.id)]);
            return !excludePersonIds.some((pid) => people.has(pid));
          })
          .catch(() => true),
      ),
    );
    items = items.filter((_, idx) => keep[idx]);
  }

  // NO-FILLER SAFETY NET (shared invariant): a named subject may never ship a
  // title whose eligibility verdict did not PASS.
  if (query.subjectLexemes && query.subjectLexemes.length > 0) {
    items = items.filter((i) => i.subjectEvidence?.satisfied === true);
  }

  return { kind: 'search', query, items, scoredFor: result.scoredFor, relaxed: result.relaxed, interpretation, summary: req.interpretationSummary };
}

/**
 * ANTHROPIC MODE entry point. Interprets the request through Claude and resolves
 * it to a result, or returns { kind: 'unavailable' } so the caller can degrade.
 * Never throws.
 */
export async function runAiDiscovery(args: {
  supabase: SupabaseClient;
  userId: string;
  text: string;
  route: AiRoute;
  limit?: number;
  history?: AiTurn[];
  now?: Date;
}): Promise<AiDiscoveryResult> {
  const outcome = args.history && args.history.length
    ? await continueDiscoveryConversation({ text: args.text, history: args.history, route: args.route, now: args.now })
    : await interpretDiscoveryRequest({ text: args.text, route: args.route, now: args.now });
  if (!outcome.request) return { kind: 'unavailable', failureReason: outcome.failureReason };
  try {
    return await resolveCanonicalToResult(args.supabase, args.userId, outcome.request, args.limit ?? DEFAULT_RESULT_LIMIT);
  } catch {
    return { kind: 'unavailable', failureReason: 'error' };
  }
}

/**
 * SHADOW MODE hook. Legacy has already served the user; this records a SAFE
 * structural comparison of what Claude would have done. Metadata only — no query
 * text, no titles. Best-effort and non-blocking on failure.
 */
export async function recordShadowInterpretation(args: {
  text: string;
  route: AiRoute;
  legacyResultCount: number;
  now?: Date;
}): Promise<void> {
  try {
    const outcome = await interpretDiscoveryRequest({ text: args.text, route: args.route, now: args.now, telemetry: false });
    const req = outcome.request;
    const hardCount = req
      ? req.hardConstraints.requiredSubjects.length +
        req.hardConstraints.excludedSubjects.length +
        req.hardConstraints.excludedGenres.length +
        req.hardConstraints.requiredPeople.length +
        req.hardConstraints.excludedPeople.length +
        req.hardConstraints.requiredProviders.length +
        (req.hardConstraints.releaseDateMin ? 1 : 0) +
        (req.hardConstraints.releaseDateMax ? 1 : 0) +
        (req.hardConstraints.runtimeMaxMinutes ? 1 : 0)
      : null;
    await recordShadowComparison({
      route: args.route,
      aiSucceeded: req != null,
      aiClarification: req?.clarificationRequired ?? false,
      aiIntent: req?.intent ?? null,
      aiHardConstraintCount: hardCount,
      aiReferenceTitleCount: req?.referenceTitles.length ?? null,
      legacyResultCount: args.legacyResultCount,
      usage: outcome.usage,
    });
  } catch {
    /* shadow telemetry can never affect a request */
  }
}
