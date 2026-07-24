import 'server-only';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FounderKey } from './access';
import {
  type FounderSession,
  makeSessionId,
  sortSessions,
  activeSession,
} from './sessionModel';

/**
 * Server bridge to `founder_test_sessions`. Fail-open by construction: if the
 * table doesn't exist yet (pre-migration) or a read/write fails, we degrade to
 * an empty/no-op result rather than throwing — the founder route must still
 * render. RLS keys every row to the founder's own user_id, so a founder can only
 * ever see and mutate their own sessions.
 */

interface Row {
  id: string;
  user_id: string;
  founder: string;
  name: string;
  status: string;
  algo_version: string | null;
  quiz_position: number | null;
  is_test: boolean | null;
  created_at: string;
  last_active_at: string;
}

function rowToSession(r: Row): FounderSession {
  return {
    id: r.id,
    userId: r.user_id,
    founder: r.founder as FounderKey,
    name: r.name,
    status: r.status === 'archived' ? 'archived' : 'active',
    algoVersion: r.algo_version,
    quizPosition: r.quiz_position ?? 0,
    isTest: r.is_test ?? true,
    createdAt: Date.parse(r.created_at) || 0,
    lastActiveAt: Date.parse(r.last_active_at) || 0,
  };
}

/** Is the founder_test_sessions table live in this environment? Head probe. */
export async function sessionsAvailable(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from('founder_test_sessions').select('id', { head: true, count: 'exact' }).limit(1);
  return !error;
}

/** All of a founder's sessions (active + archived), sorted. Fail-open → []. */
export async function listSessions(
  supabase: SupabaseClient,
  userId: string,
  founder: FounderKey,
): Promise<FounderSession[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('founder_test_sessions')
    .select('id,user_id,founder,name,status,algo_version,quiz_position,is_test,created_at,last_active_at')
    .eq('user_id', userId)
    .eq('founder', founder)
    .order('last_active_at', { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return sortSessions((data as Row[]).map(rowToSession));
}

/** Create a fresh named session for a founder. Returns it, or null on failure. */
export async function createSession(
  supabase: SupabaseClient,
  userId: string,
  founder: FounderKey,
  name: string,
  algoVersion?: string,
): Promise<FounderSession | null> {
  if (!userId) return null;
  const id = makeSessionId(founder, randomUUID());
  const nowIso = new Date().toISOString();
  const row = {
    id,
    user_id: userId,
    founder,
    name,
    status: 'active',
    algo_version: algoVersion ?? null,
    quiz_position: 0,
    is_test: true,
    created_at: nowIso,
    last_active_at: nowIso,
  };
  const { data, error } = await supabase.from('founder_test_sessions').insert(row).select().single();
  if (error || !data) return null;
  return rowToSession(data as Row);
}

/**
 * "Refresh": archive every currently-active session for this founder and start a
 * clean one — a fresh Watch-DNA slate, with the old sessions preserved for
 * before/after comparison. Returns the new session (or null on failure).
 */
export async function refreshSession(
  supabase: SupabaseClient,
  userId: string,
  founder: FounderKey,
  newName: string,
  algoVersion?: string,
): Promise<FounderSession | null> {
  if (!userId) return null;
  await supabase
    .from('founder_test_sessions')
    .update({ status: 'archived' })
    .eq('user_id', userId)
    .eq('founder', founder)
    .eq('status', 'active');
  return createSession(supabase, userId, founder, newName, algoVersion);
}

/** Archive one session (soft; row preserved). Own-rows only via RLS. */
export async function archiveSession(supabase: SupabaseClient, userId: string, id: string): Promise<boolean> {
  if (!userId || !id) return false;
  const { error } = await supabase
    .from('founder_test_sessions')
    .update({ status: 'archived' })
    .eq('user_id', userId)
    .eq('id', id);
  return !error;
}

/** Rename a session. */
export async function renameSession(supabase: SupabaseClient, userId: string, id: string, name: string): Promise<boolean> {
  if (!userId || !id) return false;
  const { error } = await supabase
    .from('founder_test_sessions')
    .update({ name })
    .eq('user_id', userId)
    .eq('id', id);
  return !error;
}

/** Bump last_active_at so ordering reflects real use. Best-effort. */
export async function touchSession(supabase: SupabaseClient, userId: string, id: string): Promise<void> {
  if (!userId || !id) return;
  await supabase
    .from('founder_test_sessions')
    .update({ last_active_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', id);
}

/** Reopen an archived session (archived → active), bumping it to current. */
export async function reopenSession(supabase: SupabaseClient, userId: string, id: string): Promise<boolean> {
  if (!userId || !id) return false;
  const { error } = await supabase
    .from('founder_test_sessions')
    .update({ status: 'active', last_active_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', id);
  return !error;
}

/**
 * Make a session the CURRENT one to switch into it — it becomes the most-recently
 * active (which `activeSession` selects). Reopens it if archived. Own-rows only.
 */
export async function makeCurrentSession(supabase: SupabaseClient, userId: string, id: string): Promise<boolean> {
  if (!userId || !id) return false;
  const { error } = await supabase
    .from('founder_test_sessions')
    .update({ status: 'active', last_active_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', id);
  return !error;
}

/**
 * Ensure the founder has at least one active session, creating a first one if
 * none exists. Returns {sessions, active}. Fail-open: on any error returns
 * whatever we could read (possibly empty) so the page still renders.
 */
export async function ensureSession(
  supabase: SupabaseClient,
  userId: string,
  founder: FounderKey,
  firstName: string,
): Promise<{ sessions: FounderSession[]; active: FounderSession | null }> {
  let sessions = await listSessions(supabase, userId, founder);
  let active = activeSession(sessions);
  if (!active && userId) {
    const created = await createSession(supabase, userId, founder, firstName);
    if (created) {
      sessions = [created, ...sessions];
      active = created;
    }
  }
  return { sessions, active };
}
