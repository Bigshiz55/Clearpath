import 'server-only';
import { searchTitles, searchPeople, searchKeywords, getTitle } from '@/lib/tmdb/client';
import { resolveSubjectRequirementForTerms } from '@/lib/finderSubject';
import { resolveSource } from '@/lib/nlu/mediaOntology';
import { recordAnalyticsEvent } from '@/lib/actions/passFeedback';

/**
 * THE APPROVED AI TOOL BOUNDARY (§13).
 *
 * Claude never queries the database. Claude never sees a SQL string, a
 * service-role key, or an arbitrary Supabase client. When the orchestrator needs
 * a FACT — does this title exist, who is this person, what keyword ids describe a
 * subject, which provider is "Hulu" — it goes through ONE of these named, typed,
 * bounded, server-side tools. Each:
 *   • takes a strict, size-capped input,
 *   • returns a strict, size-capped output of VERIFIED data (or null/[]),
 *   • records a telemetry counter (tool name only — never the query text),
 *   • degrades to null/[] on any failure, never throws.
 *
 * These are thin wrappers over the app's existing verified-data functions, so the
 * factual truth still comes from TMDB / the WatchVerd1ct catalog / the ontology —
 * the boundary just makes the surface auditable and impossible to widen from a
 * prompt. Adding a tool is a deliberate code change here, not something the model
 * can conjure.
 */

/** Fire-and-forget tool-call counter. Metadata only — no query text is logged. */
function countToolCall(tool: string): void {
  void recordAnalyticsEvent('ai_tool_call', { tool }).catch(() => {});
}

// ---- Bounds (asserted by tests) ---------------------------------------------
export const TOOL_LIMITS = {
  maxSubjectTerms: 12,
  maxReferenceTitles: 3,
  maxKeywordIds: 24,
} as const;

export interface ResolvedTitleRef {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
}

/** resolveTitle — does a named title exist, and which is the best match?
 *  Returns null when nothing resolves (never a guessed id). */
export async function resolveTitle(
  text: string,
  wantType: 'movie' | 'tv' | null = null,
): Promise<ResolvedTitleRef | null> {
  countToolCall('resolveTitle');
  const clean = (text ?? '').trim().slice(0, 200);
  if (clean.length < 2) return null;
  const hits = await searchTitles(clean).catch(() => []);
  const pick = wantType ? hits.find((h) => h.mediaType === wantType) ?? hits[0] : hits[0];
  if (!pick) return null;
  return { id: pick.id, mediaType: pick.mediaType, title: pick.title, year: pick.year };
}

/** resolvePerson — resolve a name to a real catalog person id, or null. */
export async function resolvePerson(name: string): Promise<{ id: number; name: string } | null> {
  countToolCall('resolvePerson');
  const clean = (name ?? '').trim().slice(0, 120);
  if (clean.length < 2) return null;
  const hit = (await searchPeople(clean).catch(() => []))[0];
  return hit ? { id: hit.id, name: hit.name } : null;
}

/** resolveProvider — normalize a platform name to its canonical provider id via
 *  the ontology (never a guess). Returns null for a network without a streaming
 *  provider id (e.g. a linear-only channel). */
export async function resolveProvider(
  name: string,
): Promise<{ providerId: number; canonicalName: string } | null> {
  countToolCall('resolveProvider');
  const src = resolveSource((name ?? '').trim().slice(0, 80));
  if (src?.providerId == null) return null;
  return { providerId: src.providerId, canonicalName: src.canonicalName };
}

export interface SubjectRequirementResult {
  keywordIds: number[];
  lexemes: string[];
  canonical: string;
  label: string;
}

/** searchBySubject — resolve stated subject terms ("boxing") into the required
 *  keyword ids + eligibility lexemes. This is the HARD-constraint vocabulary, not
 *  a soft genre. Returns null when nothing resolves. */
export async function searchBySubject(terms: string[]): Promise<SubjectRequirementResult | null> {
  countToolCall('searchBySubject');
  const bounded = (terms ?? []).slice(0, TOOL_LIMITS.maxSubjectTerms).map((t) => String(t).slice(0, 80));
  const sr = await resolveSubjectRequirementForTerms(bounded);
  if (!sr) return null;
  return {
    keywordIds: sr.keywordIds.slice(0, TOOL_LIMITS.maxKeywordIds),
    lexemes: sr.requirement.lexemes,
    canonical: sr.requirement.canonical,
    label: sr.requirement.label,
  };
}

/** resolveKeywordIds — map free subject/trope terms to TMDB keyword ids (used for
 *  excluded-subject `without_keywords`). Bounded, best-effort, [] on miss. */
export async function resolveKeywordIds(terms: string[]): Promise<number[]> {
  countToolCall('resolveKeywordIds');
  const bounded = (terms ?? []).slice(0, TOOL_LIMITS.maxSubjectTerms).map((t) => String(t).slice(0, 80));
  if (bounded.length === 0) return [];
  const ids = await searchKeywords(bounded).catch(() => []);
  return ids.slice(0, TOOL_LIMITS.maxKeywordIds);
}

/** referenceThemeKeywords — a reference title's own theme keyword ids, to bias a
 *  hard-filtered discovery toward its feel without abandoning the filters. Reads
 *  verified TMDB metadata only. Bounded; [] on miss. */
export async function referenceThemeKeywords(referenceTitles: string[]): Promise<number[]> {
  countToolCall('referenceThemeKeywords');
  const out = new Set<number>();
  for (const name of (referenceTitles ?? []).slice(0, TOOL_LIMITS.maxReferenceTitles)) {
    const hit = (await searchTitles(String(name).slice(0, 200)).catch(() => []))[0];
    if (!hit) continue;
    const detail = await getTitle(hit.mediaType, hit.id).catch(() => null);
    const kwNames = (detail?.keywords ?? []).slice(0, 6);
    if (kwNames.length === 0) continue;
    const ids = await searchKeywords(kwNames).catch(() => []);
    ids.slice(0, 8).forEach((id) => out.add(id));
  }
  return [...out].slice(0, TOOL_LIMITS.maxKeywordIds);
}

/**
 * The named registry — a manifest of the tools Claude's orchestration is allowed
 * to reach. Nothing outside this list is callable on the model's behalf, and the
 * list is code, not prompt. (Availability tools — getLinearAirings /
 * getStreamingAvailability — read verified stored rows and belong here too; they
 * are added when the canonical linear/offer tables are consumed by production,
 * per docs/AI_DATA_ARCHITECTURE.md §6.)
 */
export const AI_TOOLS = {
  resolveTitle,
  resolvePerson,
  resolveProvider,
  searchBySubject,
  resolveKeywordIds,
  referenceThemeKeywords,
} as const;

export type AiToolName = keyof typeof AI_TOOLS;
