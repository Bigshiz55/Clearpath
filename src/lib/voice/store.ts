import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InterviewState } from './interview';

/**
 * VOICE INTERVIEW — persistence for `InterviewState` (server-only).
 *
 * The engine is pure and owns the state's shape; this layer only moves that
 * state to and from the `voice_interviews` table (migration 0047). It is
 * FAIL-SAFE by construction: a read that errors (table missing pre-migration,
 * RLS, transient) returns `null` rather than throwing into a page, and a write
 * that fails is logged, not raised — a persistence hiccup can pause a session,
 * never crash the app. RLS guarantees a user can only ever touch their own rows;
 * every function additionally scopes by `userId` so a bug can't widen that.
 */

const TABLE = 'voice_interviews';
const COLS = 'id,user_id,status,state,overall_confidence,created_at,updated_at';

interface Row {
  id: string;
  user_id: string;
  status: string;
  state: unknown;
  overall_confidence: number;
  created_at: string;
  updated_at: string;
}

/** Recover a well-formed InterviewState from a row's JSON, or null if unusable. */
function rowToState(row: Row | null | undefined): InterviewState | null {
  if (!row) return null;
  const s = row.state as Partial<InterviewState> | null | undefined;
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || typeof s.userId !== 'string') {
    return null;
  }
  return s as InterviewState;
}

/** The user's most recent still-active interview, for resume. Null if none. */
export async function loadActiveInterview(
  supabase: SupabaseClient,
  userId: string,
): Promise<InterviewState | null> {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(COLS)
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return rowToState(data as Row);
  } catch {
    return null;
  }
}

/** A specific interview by id, scoped to the owner. Null if missing / not theirs. */
export async function getInterview(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<InterviewState | null> {
  if (!userId || !id) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select(COLS)
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    return rowToState(data as Row);
  } catch {
    return null;
  }
}

/**
 * Upsert the interview row, keeping the `status` and `overall_confidence`
 * columns in sync with the JSON. Keyed on the engine's own `state.id`. Never
 * throws — a failed write is logged and swallowed.
 */
export async function saveInterview(supabase: SupabaseClient, state: InterviewState): Promise<void> {
  if (!state || !state.id || !state.userId) return;
  const row = {
    id: state.id,
    user_id: state.userId,
    status: state.status,
    state,
    overall_confidence: Number.isFinite(state.overallConfidence) ? state.overallConfidence : 0,
    updated_at: new Date(state.updatedAtMs || Date.now()).toISOString(),
  };
  try {
    const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'id' });
    if (error) console.warn('[voice] saveInterview failed:', error.message);
  } catch (e) {
    console.warn('[voice] saveInterview threw:', e instanceof Error ? e.message : e);
  }
}

/** Mark an interview abandoned, scoped to the owner. Never throws. */
export async function abandonInterview(supabase: SupabaseClient, userId: string, id: string): Promise<void> {
  if (!userId || !id) return;
  try {
    const { error } = await supabase
      .from(TABLE)
      .update({ status: 'abandoned', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', id);
    if (error) console.warn('[voice] abandonInterview failed:', error.message);
  } catch (e) {
    console.warn('[voice] abandonInterview threw:', e instanceof Error ? e.message : e);
  }
}
