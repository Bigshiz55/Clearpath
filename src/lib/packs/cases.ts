import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaseRecord, CaseAlias, CaseSubject, CaseSubjectRole, CaseTimelineEvent, CaseTimelineEventType, FactConfidence } from './types';
import { CURATED_CASE_FACTS, type CuratedCaseFact } from './curatedCaseFacts';

interface CaseRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  location: string | null;
  incident_date: string | null;
  status_summary: string | null;
  created_at: string;
  updated_at: string;
}

function toCase(row: CaseRow): CaseRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    location: row.location,
    incidentDate: row.incident_date,
    statusSummary: row.status_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCaseBySlug(supabase: SupabaseClient, slug: string): Promise<CaseRecord | null> {
  const { data, error } = await supabase.from('cases').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data ? toCase(data as CaseRow) : null;
}

/** Programme ids linked to a Case, across any number of networks. */
export async function listProgrammesForCase(supabase: SupabaseClient, caseId: string): Promise<string[]> {
  const { data, error } = await supabase.from('case_programmes').select('programme_id').eq('case_id', caseId);
  if (error) throw error;
  return (data as { programme_id: string }[]).map((row) => row.programme_id);
}

/**
 * The Case(s) a programme is linked to. A retitled airing resolves to the
 * same Case with no extra lookup here: tv_programmes identity is stable
 * across a retitle (see migration 0036), so this is the same
 * case_programmes join regardless of which title the programme aired under.
 */
export async function resolveCasesForProgramme(supabase: SupabaseClient, programmeId: string): Promise<CaseRecord[]> {
  const { data: links, error: linkError } = await supabase
    .from('case_programmes')
    .select('case_id')
    .eq('programme_id', programmeId);
  if (linkError) throw linkError;
  const caseIds = (links as { case_id: string }[]).map((row) => row.case_id);
  if (caseIds.length === 0) return [];

  const { data, error } = await supabase.from('cases').select('*').in('id', caseIds);
  if (error) throw error;
  return (data as CaseRow[]).map(toCase);
}

interface CaseAliasRow {
  id: string;
  programme_id: string;
  alias_title: string;
  created_at: string;
}

/** Alternate titles a programme has aired under. */
export async function listAliasesForProgramme(supabase: SupabaseClient, programmeId: string): Promise<CaseAlias[]> {
  const { data, error } = await supabase.from('case_aliases').select('*').eq('programme_id', programmeId);
  if (error) throw error;
  return (data as CaseAliasRow[]).map((row) => ({
    id: row.id,
    programmeId: row.programme_id,
    aliasTitle: row.alias_title,
    createdAt: row.created_at,
  }));
}

/** Create a Case if `slug` doesn't already exist, otherwise return the existing one. */
export async function upsertCase(
  supabase: SupabaseClient,
  slug: string,
  title: string,
  description: string | null = null,
): Promise<CaseRecord> {
  const existing = await getCaseBySlug(supabase, slug);
  if (existing) return existing;
  const { data, error } = await supabase
    .from('cases')
    .insert({ slug, title, description })
    .select('*')
    .single();
  if (error) throw error;
  return toCase(data as CaseRow);
}

/** Link a programme to a Case (idempotent — a retitled airing is still one programme row, see migration 0036). */
export async function linkProgrammeToCase(supabase: SupabaseClient, caseId: string, programmeId: string): Promise<void> {
  const { error } = await supabase
    .from('case_programmes')
    .upsert({ case_id: caseId, programme_id: programmeId }, { onConflict: 'case_id,programme_id' });
  if (error) throw error;
}

interface CaseSubjectRow {
  id: string;
  case_id: string;
  full_name: string;
  role: string;
  outcome: string | null;
  source_url: string | null;
  confidence: string;
  sort_order: number;
}

function toSubject(row: CaseSubjectRow): CaseSubject {
  return {
    id: row.id,
    caseId: row.case_id,
    fullName: row.full_name,
    role: row.role as CaseSubjectRole,
    outcome: row.outcome,
    sourceUrl: row.source_url,
    confidence: row.confidence as FactConfidence,
    sortOrder: row.sort_order,
  };
}

/** Sourced people connected to a Case (migration 0039). Empty until curated — never inferred. */
export async function listCaseSubjects(supabase: SupabaseClient, caseId: string): Promise<CaseSubject[]> {
  const { data, error } = await supabase
    .from('case_subjects')
    .select('*')
    .eq('case_id', caseId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as CaseSubjectRow[]).map(toSubject);
}

interface CaseTimelineRow {
  id: string;
  case_id: string;
  event_type: string;
  event_date: string | null;
  headline: string;
  detail: string | null;
  source_url: string | null;
  confidence: string;
  disputed: boolean;
  sort_order: number;
}

function toTimelineEvent(row: CaseTimelineRow): CaseTimelineEvent {
  return {
    id: row.id,
    caseId: row.case_id,
    eventType: row.event_type as CaseTimelineEventType,
    eventDate: row.event_date,
    headline: row.headline,
    detail: row.detail,
    sourceUrl: row.source_url,
    confidence: row.confidence as FactConfidence,
    disputed: row.disputed,
    sortOrder: row.sort_order,
  };
}

/** A Case's sourced timeline (migration 0039), oldest-relevant first. Empty until curated. */
export async function listCaseTimeline(supabase: SupabaseClient, caseId: string): Promise<CaseTimelineEvent[]> {
  const { data, error } = await supabase
    .from('case_timeline_events')
    .select('*')
    .eq('case_id', caseId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data as CaseTimelineRow[]).map(toTimelineEvent);
}

/**
 * "Where have I seen this?" — a natural-language-ish search over what's
 * actually stored: Case title/description and programme titles. Plain
 * ILIKE, not a fabricated semantic search; returns Cases whose title,
 * description, or a linked programme's title contains the query.
 */
export async function searchCases(supabase: SupabaseClient, query: string, limit = 20): Promise<CaseRecord[]> {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q}%`;

  const [byCase, byProgramme] = await Promise.all([
    supabase.from('cases').select('*').or(`title.ilike.${like},description.ilike.${like},location.ilike.${like}`).limit(limit),
    supabase
      .from('tv_programmes')
      .select('id, case_programmes!inner(case_id)')
      .ilike('title', like)
      .limit(limit),
  ]);
  if (byCase.error) throw byCase.error;

  const caseIdsFromProgrammes = new Set<string>();
  if (!byProgramme.error && byProgramme.data) {
    for (const row of byProgramme.data as { case_programmes: { case_id: string }[] }[]) {
      for (const link of row.case_programmes) caseIdsFromProgrammes.add(link.case_id);
    }
  }

  const directResults = (byCase.data as CaseRow[]).map(toCase);
  const alreadyHave = new Set(directResults.map((c) => c.id));
  const extraIds = [...caseIdsFromProgrammes].filter((id) => !alreadyHave.has(id));

  let extraResults: CaseRecord[] = [];
  if (extraIds.length > 0) {
    const { data, error } = await supabase.from('cases').select('*').in('id', extraIds).limit(limit);
    if (error) throw error;
    extraResults = (data as CaseRow[]).map(toCase);
  }

  return [...directResults, ...extraResults].slice(0, limit);
}

export interface CuratedFactResult {
  titleMatches: string[];
  matchedCaseId: string | null;
  matchedCaseTitle: string | null;
  subjectsWritten: number;
  timelineWritten: number;
}

/**
 * Attaches one hand-curated fact bundle to whichever EXISTING `cases` row (if
 * any) matches its title candidates — never creates a new case. This is the
 * only safe way to apply curated content without a live view into which real
 * cases the extraction pipeline has actually produced: a bundle that matches
 * nothing simply writes nothing, rather than inventing a case for a title
 * that was never really ingested from a real programme.
 *
 * Idempotent: skips subjects/timeline that already exist for the matched
 * case (by full_name/headline), so re-running is safe.
 */
async function applyCuratedFact(supabase: SupabaseClient, fact: CuratedCaseFact): Promise<CuratedFactResult> {
  const result: CuratedFactResult = {
    titleMatches: fact.titleMatches,
    matchedCaseId: null,
    matchedCaseTitle: null,
    subjectsWritten: 0,
    timelineWritten: 0,
  };

  let matched: CaseRow | null = null;
  for (const candidate of fact.titleMatches) {
    const { data, error } = await supabase.from('cases').select('*').ilike('title', `%${candidate}%`).limit(1).maybeSingle();
    if (error) throw error;
    if (data) {
      matched = data as CaseRow;
      break;
    }
  }
  if (!matched) return result;

  result.matchedCaseId = matched.id;
  result.matchedCaseTitle = matched.title;

  // Only fill in location/incident date/status summary when the pipeline
  // hasn't already set them — curated facts supplement real ingested data,
  // never overwrite it.
  const patch: Record<string, string> = {};
  if (!matched.location && fact.location) patch.location = fact.location;
  if (!matched.incident_date && fact.incidentDate) patch.incident_date = fact.incidentDate;
  if (!matched.status_summary && fact.statusSummary) patch.status_summary = fact.statusSummary;
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from('cases').update(patch).eq('id', matched.id);
    if (error) throw error;
  }

  const [existingSubjects, existingTimeline] = await Promise.all([
    supabase.from('case_subjects').select('full_name').eq('case_id', matched.id),
    supabase.from('case_timeline_events').select('headline').eq('case_id', matched.id),
  ]);
  const haveSubject = new Set(((existingSubjects.data ?? []) as { full_name: string }[]).map((r) => r.full_name));
  const haveEvent = new Set(((existingTimeline.data ?? []) as { headline: string }[]).map((r) => r.headline));

  const newSubjects = fact.subjects.filter((s) => !haveSubject.has(s.fullName));
  if (newSubjects.length > 0) {
    const { error } = await supabase.from('case_subjects').insert(
      newSubjects.map((s, i) => ({
        case_id: matched!.id,
        full_name: s.fullName,
        role: s.role,
        outcome: s.outcome,
        source_url: s.sourceUrl,
        confidence: s.confidence,
        sort_order: i,
      })),
    );
    if (error) throw error;
    result.subjectsWritten = newSubjects.length;
  }

  const newEvents = fact.timeline.filter((e) => !haveEvent.has(e.headline));
  if (newEvents.length > 0) {
    const { error } = await supabase.from('case_timeline_events').insert(
      newEvents.map((e, i) => ({
        case_id: matched!.id,
        event_type: e.eventType,
        event_date: e.eventDate,
        headline: e.headline,
        detail: e.detail,
        source_url: e.sourceUrl,
        confidence: e.confidence,
        disputed: e.disputed,
        sort_order: i,
      })),
    );
    if (error) throw error;
    result.timelineWritten = newEvents.length;
  }

  return result;
}

/** Applies every bundle in the curated dataset. See `applyCuratedFact`. */
export async function applyCuratedCaseFacts(supabase: SupabaseClient): Promise<CuratedFactResult[]> {
  const results: CuratedFactResult[] = [];
  for (const fact of CURATED_CASE_FACTS) {
    results.push(await applyCuratedFact(supabase, fact));
  }
  return results;
}

export interface BeforeYouWatchResult {
  /** True when the user has already seen another programme covering this same Case. */
  seenBefore: boolean;
  case: CaseRecord | null;
  /** The other programme(s) already seen for this Case, most recent first. */
  otherSeenTitles: { title: string; seenAt: string }[];
}

/**
 * "Before You Watch" for a Crime programme: does the room already know this
 * Case, and has the user already seen a different programme covering it?
 * Uses only `case_programmes` — real ingested programmes curated onto a
 * Case by hand (see `linkProgrammeToCase` above), never a speculative match
 * — so this never over-claims. `src/lib/cases/reviewQueue.ts` is a separate
 * pipeline (fixture-episode matching, feeding `case_match_episodes` for
 * offline evaluation) and does not write here; see its own module doc for
 * why that's kept a deliberately separate table. Non-blocking: the caller
 * decides how to show it, this never prevents anyone from watching.
 */
export async function beforeYouWatch(
  supabase: SupabaseClient,
  programmeId: string,
  userId: string | null,
): Promise<BeforeYouWatchResult> {
  const none: BeforeYouWatchResult = { seenBefore: false, case: null, otherSeenTitles: [] };
  const cases = await resolveCasesForProgramme(supabase, programmeId);
  const linkedCase = cases[0];
  if (!linkedCase || !userId) return { ...none, case: linkedCase ?? null };

  const otherProgrammeIds = await listProgrammesForCase(supabase, linkedCase.id);
  const others = otherProgrammeIds.filter((id) => id !== programmeId);
  if (others.length === 0) return { ...none, case: linkedCase };

  const { data: seenRows, error } = await supabase
    .from('user_seen')
    .select('subject_id, seen_at')
    .eq('user_id', userId)
    .eq('subject_type', 'programme')
    .in('subject_id', others);
  if (error) throw error;
  const seen = (seenRows ?? []) as { subject_id: string; seen_at: string }[];
  if (seen.length === 0) return { ...none, case: linkedCase };

  const { data: programmeRows } = await supabase
    .from('tv_programmes')
    .select('id, title')
    .in('id', seen.map((s) => s.subject_id));
  const titleById = new Map(((programmeRows ?? []) as { id: string; title: string }[]).map((r) => [r.id, r.title]));

  const otherSeenTitles = seen
    .map((s) => ({ title: titleById.get(s.subject_id) ?? 'Another program', seenAt: s.seen_at }))
    .sort((a, b) => (a.seenAt < b.seenAt ? 1 : -1));

  return { seenBefore: true, case: linkedCase, otherSeenTitles };
}
