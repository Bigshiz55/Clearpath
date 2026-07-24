import 'server-only';
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DnaState, PreferenceEvent } from './types';
import { deriveDna, deriveCorrections, emptyDna } from './engine';

/**
 * Server bridge between the Supabase `preference_events` log and the pure
 * preference engine. Cost-safe by construction: ONE indexed query per user per
 * request (bounded row cap), no per-title AI or API calls, and a graceful empty
 * fallback when the table doesn't exist yet (pre-migration) or the read fails —
 * so ranking degrades to the deterministic path, never throws.
 */

/** Cap on events folded per user (newest first). Bounds cost + query size. */
export const EVENT_CAP = 1000;

export interface LoadedPreference {
  events: PreferenceEvent[];
  dna: DnaState;
  corrections: Record<string, number>;
  /** Wall-clock used for mood decay (passed so the fold is deterministic). */
  now: number;
}

interface Row {
  id: string;
  title_id: string;
  tmdb_id: number | null;
  media_type: string | null;
  action: string;
  experience_grade: string | null;
  attraction_grade: string | null;
  discovery_grade: string | null;
  reasons: string[] | null;
  corrections: unknown;
  dims: Record<string, number> | null;
  genres: string[] | null;
  people: string[] | null;
  dwell_ms: number | null;
  familiarity: number | null;
  source: string | null;
  round_id: string | null;
  event_at: string;
}

function rowToEvent(r: Row): PreferenceEvent {
  return {
    id: r.id,
    at: Date.parse(r.event_at),
    titleId: r.title_id,
    dims: r.dims ?? undefined,
    genres: r.genres ?? undefined,
    people: r.people ?? undefined,
    action: r.action as PreferenceEvent['action'],
    experienceGrade: (r.experience_grade as PreferenceEvent['experienceGrade']) ?? undefined,
    attractionGrade: (r.attraction_grade as PreferenceEvent['attractionGrade']) ?? undefined,
    discoveryGrade: (r.discovery_grade as PreferenceEvent['discoveryGrade']) ?? undefined,
    reasons: (r.reasons as PreferenceEvent['reasons']) ?? undefined,
    corrections: Array.isArray(r.corrections) ? (r.corrections as PreferenceEvent['corrections']) : undefined,
    dwellMs: r.dwell_ms ?? undefined,
    familiarity: r.familiarity ?? undefined,
    source: r.source ?? undefined,
    roundId: r.round_id ?? undefined,
  };
}

/** Read a user's live (non-undone) events, newest-capped. One indexed query. */
async function fetchEvents(supabase: SupabaseClient, userId: string): Promise<PreferenceEvent[]> {
  const { data, error } = await supabase
    .from('preference_events')
    .select('id,title_id,tmdb_id,media_type,action,experience_grade,attraction_grade,discovery_grade,reasons,corrections,dims,genres,people,dwell_ms,familiarity,source,round_id,event_at')
    .eq('user_id', userId)
    .is('undone_at', null)
    .order('event_at', { ascending: false })
    .limit(EVENT_CAP);
  if (error || !data) return []; // table missing / RLS / transient → degrade
  return (data as Row[]).map(rowToEvent);
}

/**
 * Load and derive a user's preference DNA. `now` defaults to the current time,
 * but callers in a request should pass a fixed timestamp for determinism. Cached
 * per (user, event count) for 5 min so repeated shelves in one render reuse it.
 */
export async function loadPreference(
  supabase: SupabaseClient,
  userId: string,
  now: number = Date.now(),
): Promise<LoadedPreference> {
  if (!userId) return { events: [], dna: emptyDna(), corrections: {}, now };
  const events = await fetchEvents(supabase, userId).catch(() => []);
  return {
    events,
    dna: deriveDna(events, now),
    corrections: deriveCorrections(events),
    now,
  };
}

/**
 * Batch-persist events (dedup by client id via upsert-ignore). Returns the number
 * of rows the DB accepted. Never throws to the caller — logs and returns 0 on
 * failure so a write hiccup can't break the round UX.
 */
export async function recordEvents(
  supabase: SupabaseClient,
  userId: string,
  events: Array<Partial<PreferenceEvent> & { id: string; titleId: string; action: PreferenceEvent['action'] }>,
): Promise<number> {
  if (!userId || events.length === 0) return 0;
  const rows = events.map((e) => ({
    id: e.id,
    user_id: userId,
    title_id: e.titleId,
    tmdb_id: tmdbFromTitleId(e.titleId),
    media_type: mediaFromTitleId(e.titleId),
    action: e.action,
    experience_grade: e.experienceGrade ?? null,
    attraction_grade: e.attractionGrade ?? null,
    discovery_grade: e.discoveryGrade ?? null,
    reasons: e.reasons ?? [],
    corrections: e.corrections ?? [],
    dims: e.dims ?? null,
    genres: e.genres ?? [],
    people: e.people ?? [],
    dwell_ms: e.dwellMs ?? null,
    familiarity: e.familiarity ?? null,
    source: e.source ?? null,
    round_id: e.roundId ?? null,
    event_at: new Date(e.at ?? Date.now()).toISOString(),
  }));
  const { error, count } = await supabase
    .from('preference_events')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true, count: 'exact' });
  if (error) {
    console.warn('[preference] recordEvents failed:', error.message);
    return 0;
  }
  return count ?? rows.length;
}

/** Soft-undo: mark an event undone (audit trail preserved). */
export async function undoEvent(supabase: SupabaseClient, userId: string, eventId: string): Promise<boolean> {
  const { error } = await supabase
    .from('preference_events')
    .update({ undone_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', eventId);
  return !error;
}

/** Record a recommendation outcome (feeds calibration / prediction accuracy). */
export async function recordOutcome(
  supabase: SupabaseClient,
  userId: string,
  o: { tmdbId: number; mediaType: 'movie' | 'tv'; predicted?: number; outcome?: string; correct?: boolean; sessionId?: string },
): Promise<boolean> {
  const { error } = await supabase.from('recommendation_outcomes').insert({
    user_id: userId,
    tmdb_id: o.tmdbId,
    media_type: o.mediaType,
    predicted: o.predicted ?? null,
    outcome: o.outcome ?? null,
    correct: o.correct ?? null,
    session_id: o.sessionId ?? null,
  });
  return !error;
}

// Extract "movie:603" → 603 / 'movie'. Best-effort.
function tmdbFromTitleId(titleId: string): number | null {
  const n = Number(titleId.split(':')[1]);
  return Number.isFinite(n) ? n : null;
}
function mediaFromTitleId(titleId: string): 'movie' | 'tv' | null {
  const p = titleId.split(':')[0];
  return p === 'movie' || p === 'tv' ? p : null;
}

/** Cached wrapper for hot paths — reuses the derived DNA within a short window. */
export function loadPreferenceCached(supabase: SupabaseClient, userId: string, now: number): Promise<LoadedPreference> {
  if (!userId) return Promise.resolve({ events: [], dna: emptyDna(), corrections: {}, now });
  return unstable_cache(
    async () => loadPreference(supabase, userId, now),
    ['pref-dna', userId],
    { revalidate: 300, tags: [`pref-dna:${userId}`] },
  )();
}
