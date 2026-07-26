import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Claim } from './types';
import type { Answer, VoiceSession } from './session';
import type { InterviewMode } from './questions';

/**
 * Server bridge between `voice_dna_sessions` and the pure session machine.
 *
 * Degrades rather than throws: if the table does not exist yet (pre-migration)
 * or the read fails, the interview still runs — it just runs unsaved, and the
 * caller is told so it can say that out loud instead of pretending the answers
 * were kept.
 */

export interface StoredSession extends VoiceSession {
  inputMode: 'typed' | 'voice';
}

export interface LoadResult {
  session: StoredSession | null;
  /** False when persistence is unavailable, so the UI can be honest about it. */
  persisted: boolean;
  reason?: string;
}

interface Row {
  id: string;
  mode: string;
  stage: string;
  answers: unknown;
  claims: unknown;
  asked: unknown;
  input_mode: string;
  started_at: string;
  applied_at: string | null;
}

function rowToSession(r: Row): StoredSession {
  const session: StoredSession = {
    id: r.id,
    mode: (r.mode === 'full' ? 'full' : 'quick') as InterviewMode,
    stage: (['interview', 'review', 'applied'].includes(r.stage) ? r.stage : 'interview') as VoiceSession['stage'],
    answers: Array.isArray(r.answers) ? (r.answers as Answer[]) : [],
    claims: Array.isArray(r.claims) ? (r.claims as Claim[]) : [],
    asked: Array.isArray(r.asked) ? (r.asked as string[]) : [],
    startedAt: Date.parse(r.started_at) || Date.now(),
    inputMode: r.input_mode === 'voice' ? 'voice' : 'typed',
  };
  if (r.applied_at) session.appliedAt = Date.parse(r.applied_at);
  return session;
}

const SELECT = 'id, mode, stage, answers, claims, asked, input_mode, started_at, applied_at';

/** The user's most recent interview, or null when they have never done one. */
export async function loadLatestSession(
  supabase: SupabaseClient,
  userId: string,
): Promise<LoadResult> {
  try {
    const { data, error } = await supabase
      .from('voice_dna_sessions')
      .select(SELECT)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) return { session: null, persisted: false, reason: error.message };
    const row = (data as Row[] | null)?.[0];
    return { session: row ? rowToSession(row) : null, persisted: true };
  } catch (e) {
    return { session: null, persisted: false, reason: e instanceof Error ? e.message : 'unknown' };
  }
}

export async function loadSession(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<LoadResult> {
  try {
    const { data, error } = await supabase
      .from('voice_dna_sessions')
      .select(SELECT)
      .eq('user_id', userId)
      .eq('id', id)
      .maybeSingle();
    if (error) return { session: null, persisted: false, reason: error.message };
    return { session: data ? rowToSession(data as Row) : null, persisted: true };
  } catch (e) {
    return { session: null, persisted: false, reason: e instanceof Error ? e.message : 'unknown' };
  }
}

/**
 * Write the whole session. The transcript is small and rewriting it wholesale
 * keeps the stored row an exact mirror of the pure state — no partial-update
 * path that could leave claims and answers disagreeing.
 */
export async function saveSession(
  supabase: SupabaseClient,
  userId: string,
  session: StoredSession,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const payload = {
    id: session.id,
    user_id: userId,
    mode: session.mode,
    stage: session.stage,
    answers: session.answers,
    claims: session.claims,
    asked: session.asked,
    input_mode: session.inputMode,
    started_at: new Date(session.startedAt).toISOString(),
    updated_at: new Date().toISOString(),
    applied_at: session.appliedAt ? new Date(session.appliedAt).toISOString() : null,
  };
  try {
    const { error } = await supabase.from('voice_dna_sessions').upsert(payload, { onConflict: 'id' });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: session.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

/** Delete an interview outright. Deletion means deletion, not a soft flag. */
export async function deleteSession(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('voice_dna_sessions')
      .delete()
      .eq('user_id', userId)
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}
