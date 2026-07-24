import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ALGO_VERSION, outcomeIsHit, type Confidence, type Cohort, type EvalRow, type OutcomeKind } from './accuracy';

/**
 * Server bridge for the recommendation-validation store. Cost-safe and
 * fail-open: if the tables don't exist yet (pre-migration 0024) or a write
 * hiccups, we log and move on — logging a recommendation must never break the
 * recommendation itself.
 */

export interface RecImpression {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  surface?: string;
  predicted: number;          // 0..100
  confidence: Confidence;
  reasoning?: unknown;        // factors used (jsonb)
  dnaSnapshot?: unknown;      // the DNA used (jsonb)
  genres?: string[];
  platform?: string | null;
  cohort?: Cohort;
  sessionId?: string;
}

/** Log every recommendation SHOWN (with the DNA snapshot + reasoning + version). */
export async function recordImpressions(supabase: SupabaseClient, userId: string, imps: RecImpression[]): Promise<number> {
  if (!userId || imps.length === 0) return 0;
  const rows = imps.map((i) => ({
    user_id: userId,
    tmdb_id: i.tmdbId,
    media_type: i.mediaType,
    surface: i.surface ?? null,
    algo_version: ALGO_VERSION,
    predicted: Math.round(i.predicted),
    confidence: i.confidence,
    reasoning: i.reasoning ?? null,
    dna_snapshot: i.dnaSnapshot ?? null,
    genres: i.genres ?? [],
    platform: i.platform ?? null,
    cohort: i.cohort ?? null,
    session_id: i.sessionId ?? null,
  }));
  const { error, count } = await supabase.from('recommendation_impressions').insert(rows, { count: 'exact' });
  if (error) { console.warn('[reco] recordImpressions failed:', error.message); return 0; }
  return count ?? rows.length;
}

export interface RecOutcomeInput {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  kind: OutcomeKind;
  impressionId?: number;
  predicted?: number;
  confidence?: Confidence;
  genres?: string[];
  platform?: string | null;
  cohort?: Cohort;
  sessionId?: string;
}

/** Record what the user actually did with a recommendation (self-contained for scoring). */
export async function recordOutcome(supabase: SupabaseClient, userId: string, o: RecOutcomeInput): Promise<boolean> {
  if (!userId) return false;
  const hit = outcomeIsHit(o.kind);
  const { error } = await supabase.from('recommendation_outcomes').insert({
    user_id: userId,
    tmdb_id: o.tmdbId,
    media_type: o.mediaType,
    predicted: o.predicted ?? null,
    outcome: o.kind,
    kind: o.kind,
    correct: hit,
    impression_id: o.impressionId ?? null,
    algo_version: ALGO_VERSION,
    confidence: o.confidence ?? null,
    genres: o.genres ?? [],
    platform: o.platform ?? null,
    cohort: o.cohort ?? null,
    session_id: o.sessionId ?? null,
  });
  if (error) { console.warn('[reco] recordOutcome failed:', error.message); return false; }
  return true;
}

interface OutcomeRow {
  algo_version: string | null;
  media_type: string;
  genres: string[] | null;
  platform: string | null;
  confidence: string | null;
  cohort: string | null;
  predicted: number | null;
  kind: string | null;
  outcome: string | null;
}

/**
 * Read scorable outcome rows → EvalRow[] for accuracyReport. Reads own rows (or,
 * with the service client, all users) — RLS keeps a normal user to their own.
 * Degrades to [] when the table/columns don't exist yet.
 */
export async function loadEvalRows(supabase: SupabaseClient, opts: { userId?: string; limit?: number } = {}): Promise<EvalRow[]> {
  let q = supabase
    .from('recommendation_outcomes')
    .select('algo_version,media_type,genres,platform,confidence,cohort,predicted,kind,outcome')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 5000);
  if (opts.userId) q = q.eq('user_id', opts.userId);
  const { data, error } = await q;
  if (error || !data) return []; // pre-migration / RLS / transient → degrade
  return (data as OutcomeRow[])
    .map((r): EvalRow | null => {
      const kind = (r.kind ?? r.outcome) as OutcomeKind | null;
      if (!kind) return null;
      const mt = r.media_type === 'tv' ? 'tv' : 'movie';
      return {
        algoVersion: r.algo_version ?? ALGO_VERSION,
        mediaType: mt,
        genres: r.genres ?? [],
        platform: r.platform,
        confidence: (r.confidence as Confidence) ?? 'medium',
        cohort: (r.cohort as Cohort) ?? 'new',
        predicted: r.predicted ?? 0,
        outcome: kind,
      };
    })
    .filter((x): x is EvalRow => x !== null);
}
