import type { SupabaseClient } from '@supabase/supabase-js';
import type { Provenance, Persistence } from '@/lib/graph/types';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE USER-EVIDENCE READ MODEL — Phase 3 of graph-native WatchVerd1ct.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Six stores hold user preference evidence (`preference_events`,
 * `dimension_signals`, `dimension_overrides`, `preference_rules`,
 * `watchlist_items.rating`, `recommendation_outcomes`), four parallel taste
 * models each read their own subset, and every derivation flattens
 * provenance at its boundary — `TraitBelief` is `{pref, evidence}` and which
 * event, from which surface, observed when, is unrecoverable. This module is
 * the one place the stores land in a single, provenance-carrying shape.
 *
 * RULES:
 *   - The vocabulary is the GRAPH's (`Provenance`, `Persistence` from
 *     src/lib/graph/types.ts). One provenance model in the codebase, not two.
 *   - `observedAt` is the row's own timestamp. A shaper never stamps "now" —
 *     when we learned something is a fact about the row, not the request.
 *   - Confidence appears only where the source grades itself. Behavior
 *     (reactions, ratings) does not grade itself: null, never an invented 1.
 *   - Aggregates say so. `dimension_signals` is two floats with no per-row
 *     history; its record carries `detail.aggregated: true` rather than
 *     dressing an accumulator up as an event log.
 *   - ADDITIVE. `deriveDna` and every existing consumer are untouched. This
 *     is the traceable VIEW; consumers migrate onto it in later phases.
 *
 * Pure shapers + one thin bounded loader. No model calls, no writes.
 */

export type EvidenceKind =
  | 'reaction' // a graded event from the preference_events spine
  | 'axis_signal' // the running per-axis accumulator (aggregate)
  | 'axis_override' // a pinned dial
  | 'rule' // FOR/AGAINST preference rule
  | 'rating' // a 1..10 rating on a saved title
  | 'outcome'; // a prediction outcome (did the verdict hold)

export interface EvidenceRecord {
  kind: EvidenceKind;
  /** What the evidence is about — a canonical titleId, an axis, a trait. */
  key: string;
  /** The magnitude in the source store's own units (grade weight, rating,
   *  rule weight, accumulated mass). Interpretation stays with the source. */
  weight: number;
  provenance: Provenance;
  persistence: Persistence;
  detail?: Record<string, unknown>;
}

// ── Pure shapers, one per store ────────────────────────────────────────────

export interface PreferenceEventRow {
  id: string;
  title_id: string;
  action: string;
  source: string | null;
  round_id: string | null;
  session_id: string | null;
  event_at: string;
  undone_at: string | null;
}

export function evidenceFromPreferenceEvent(row: PreferenceEventRow): EvidenceRecord | null {
  // An undone event is evidence of NOTHING — excluded, never down-weighted.
  if (row.undone_at) return null;
  return {
    kind: 'reaction',
    key: row.title_id,
    weight: 1,
    provenance: {
      source: 'user_action',
      observedAt: row.event_at,
      confidence: null,
      runId: row.round_id ?? row.session_id ?? undefined,
    },
    persistence: 'durable',
    detail: { action: row.action, surface: row.source ?? null, eventId: row.id },
  };
}

export interface DimensionSignalRow {
  dimension_key: string;
  w_sum: number;
  wv_sum: number;
  updated_at: string;
}

export function evidenceFromDimensionSignal(row: DimensionSignalRow): EvidenceRecord {
  return {
    kind: 'axis_signal',
    key: row.dimension_key,
    weight: row.w_sum,
    provenance: {
      source: 'inference',
      observedAt: row.updated_at,
      confidence: null,
    },
    persistence: 'durable',
    detail: {
      // Two floats are not an event log, and must say so: the individual
      // contributions (pass reasons, stated-case writes) are unrecoverable.
      aggregated: true,
      impliedTarget: row.w_sum > 0 ? Math.round(row.wv_sum / row.w_sum) : null,
    },
  };
}

export interface DimensionOverrideRow {
  dimension_key: string;
  pref: number;
  is_limit: boolean;
  updated_at: string;
}

export function evidenceFromOverride(row: DimensionOverrideRow): EvidenceRecord {
  return {
    kind: 'axis_override',
    key: row.dimension_key,
    weight: row.pref,
    provenance: {
      // A pinned dial is the user speaking in the product's own vocabulary.
      source: 'user_statement',
      observedAt: row.updated_at,
      confidence: 1,
    },
    persistence: 'durable',
    detail: { hardLimit: row.is_limit },
  };
}

export interface PreferenceRuleRow {
  trait: string;
  weight: number;
  label: string | null;
  created_at: string;
}

export function evidenceFromRule(row: PreferenceRuleRow): EvidenceRecord {
  return {
    kind: 'rule',
    key: row.trait,
    weight: row.weight,
    provenance: {
      source: 'user_statement',
      observedAt: row.created_at,
      confidence: 1,
    },
    persistence: 'durable',
    detail: row.label ? { label: row.label } : undefined,
  };
}

export interface RatingRow {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  rating: number | null;
  watched_at: string | null;
  added_at: string;
}

export function evidenceFromRating(row: RatingRow): EvidenceRecord | null {
  // An unrated save is a watchlist fact, not taste evidence.
  if (row.rating == null) return null;
  return {
    kind: 'rating',
    key: `${row.media_type}:${row.tmdb_id}`,
    weight: row.rating,
    provenance: {
      source: 'user_action',
      // When it was WATCHED is when the taste was observed; added_at is only
      // a fallback for legacy rows that never recorded a watch date.
      observedAt: row.watched_at ?? row.added_at,
      confidence: null,
    },
    persistence: 'durable',
  };
}

export interface OutcomeRow {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  predicted: number | null;
  correct: boolean | null;
  created_at: string;
}

export function evidenceFromOutcome(row: OutcomeRow): EvidenceRecord {
  return {
    kind: 'outcome',
    key: `${row.media_type}:${row.tmdb_id}`,
    weight: row.correct == null ? 0 : row.correct ? 1 : -1,
    provenance: {
      source: 'user_action',
      observedAt: row.created_at,
      confidence: null,
    },
    persistence: 'durable',
    detail: { predicted: row.predicted },
  };
}

// ── The thin bounded loader ────────────────────────────────────────────────

/** Bounded caps, mirroring the stores' own read discipline. */
const CAPS = { reactions: 1000, ratings: 400, outcomes: 500 } as const;

export interface UserEvidence {
  records: EvidenceRecord[];
  /** Per-store read errors, named — a store that could not be read is
   *  reported, never silently an empty contribution. */
  unreadable: string[];
}

export async function loadUserEvidence(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserEvidence> {
  if (!userId) return { records: [], unreadable: [] };
  const records: EvidenceRecord[] = [];
  const unreadable: string[] = [];

  const [events, signals, overrides, rules, ratings, outcomes] = await Promise.all([
    supabase
      .from('preference_events')
      .select('id, title_id, action, source, round_id, session_id, event_at, undone_at')
      .eq('user_id', userId)
      // Filtered at the QUERY, not just the shaper: an undone event fetched
      // and discarded in JS still consumed a cap slot, silently crowding a
      // live reaction out of the 1000-row window. (Reviewer catch on #103.)
      .is('undone_at', null)
      .order('event_at', { ascending: false })
      .limit(CAPS.reactions),
    supabase.from('dimension_signals').select('dimension_key, w_sum, wv_sum, updated_at').eq('user_id', userId),
    supabase.from('dimension_overrides').select('dimension_key, pref, is_limit, updated_at').eq('user_id', userId),
    supabase.from('preference_rules').select('trait, weight, label, created_at').eq('user_id', userId),
    supabase
      .from('watchlist_items')
      .select('tmdb_id, media_type, rating, watched_at, added_at')
      .eq('user_id', userId)
      .not('rating', 'is', null)
      .limit(CAPS.ratings),
    supabase
      .from('recommendation_outcomes')
      .select('tmdb_id, media_type, predicted, correct, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(CAPS.outcomes),
  ]);

  if (events.error) unreadable.push('preference_events');
  else for (const r of (events.data ?? []) as PreferenceEventRow[]) {
    const ev = evidenceFromPreferenceEvent(r);
    if (ev) records.push(ev);
  }
  if (signals.error) unreadable.push('dimension_signals');
  else for (const r of (signals.data ?? []) as DimensionSignalRow[]) records.push(evidenceFromDimensionSignal(r));
  if (overrides.error) unreadable.push('dimension_overrides');
  else for (const r of (overrides.data ?? []) as DimensionOverrideRow[]) records.push(evidenceFromOverride(r));
  if (rules.error) unreadable.push('preference_rules');
  else for (const r of (rules.data ?? []) as PreferenceRuleRow[]) records.push(evidenceFromRule(r));
  if (ratings.error) unreadable.push('watchlist_items');
  else for (const r of (ratings.data ?? []) as RatingRow[]) {
    const ev = evidenceFromRating(r);
    if (ev) records.push(ev);
  }
  if (outcomes.error) unreadable.push('recommendation_outcomes');
  else for (const r of (outcomes.data ?? []) as OutcomeRow[]) records.push(evidenceFromOutcome(r));

  return { records, unreadable };
}
