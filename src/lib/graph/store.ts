import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DecisionRun } from './types';

/**
 * PERSIST A DECISION RUN — fire-and-forget, never in the user's way.
 *
 * The run is debugging truth, not the product: a failure to record it must
 * never block, slow, or fail the response it describes. Same contract as
 * the analytics_events writes — a missing table (pre-migration deploys) or
 * an RLS refusal degrades to silence. The one thing this module will not do
 * is lie: it returns whether the write happened, so callers that WANT to
 * assert persistence (tests, the founder inspector) can.
 */
export async function persistDecisionRun(
  supabase: SupabaseClient,
  userId: string,
  run: DecisionRun,
): Promise<boolean> {
  try {
    const { error } = await supabase.from('decision_runs').insert({
      id: run.id,
      user_id: userId,
      entry_point: run.entryPoint,
      raw_text: run.rawText,
      intent_kind: run.intent.kind,
      persistence: run.intent.persistence,
      edges: run.edges,
      created_at: run.createdAt,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Read one of the CURRENT USER's runs back (RLS scopes it). */
export async function readDecisionRun(
  supabase: SupabaseClient,
  runId: string,
): Promise<DecisionRun | null> {
  try {
    const { data } = await supabase
      .from('decision_runs')
      .select('id, entry_point, raw_text, intent_kind, persistence, edges, created_at')
      .eq('id', runId)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id as string,
      entryPoint: data.entry_point as DecisionRun['entryPoint'],
      rawText: data.raw_text as string,
      intent: { kind: data.intent_kind as string, persistence: data.persistence as DecisionRun['intent']['persistence'] },
      edges: (data.edges ?? []) as DecisionRun['edges'],
      createdAt: data.created_at as string,
    };
  } catch {
    return null;
  }
}

/** The current user's most recent runs, newest first. */
export async function listDecisionRuns(
  supabase: SupabaseClient,
  limit = 30,
): Promise<Array<Pick<DecisionRun, 'id' | 'entryPoint' | 'rawText' | 'intent' | 'createdAt'>>> {
  try {
    const { data } = await supabase
      .from('decision_runs')
      .select('id, entry_point, raw_text, intent_kind, persistence, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data ?? []).map((d) => ({
      id: d.id as string,
      entryPoint: d.entry_point as DecisionRun['entryPoint'],
      rawText: d.raw_text as string,
      intent: { kind: d.intent_kind as string, persistence: d.persistence as DecisionRun['intent']['persistence'] },
      createdAt: d.created_at as string,
    }));
  } catch {
    return [];
  }
}
