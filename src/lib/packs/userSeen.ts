import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserSeenSubjectType } from './types';

/** Mark a programme or a Case seen. Marking a Case seen implies all its programmes are seen. */
export async function markSeen(
  supabase: SupabaseClient,
  userId: string,
  subjectType: UserSeenSubjectType,
  subjectId: string,
): Promise<void> {
  const { error } = await supabase
    .from('user_seen')
    .upsert(
      { user_id: userId, subject_type: subjectType, subject_id: subjectId },
      { onConflict: 'user_id,subject_type,subject_id' },
    );
  if (error) throw error;
}

export async function unmarkSeen(
  supabase: SupabaseClient,
  userId: string,
  subjectType: UserSeenSubjectType,
  subjectId: string,
): Promise<void> {
  const { error } = await supabase
    .from('user_seen')
    .delete()
    .eq('user_id', userId)
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId);
  if (error) throw error;
}

/**
 * True if a programme is seen — directly, or because a Case it belongs to is
 * seen. Reads `user_seen_programmes`, which already encodes that direction.
 */
export async function isProgrammeSeen(supabase: SupabaseClient, userId: string, programmeId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('user_seen_programmes')
    .select('programme_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('programme_id', programmeId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * True only if the Case itself was directly marked seen. Marking a programme
 * seen never implies the Case is seen, so this checks `user_seen` directly
 * rather than deriving from programme membership.
 */
export async function isCaseSeen(supabase: SupabaseClient, userId: string, caseId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('user_seen')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('subject_type', 'case')
    .eq('subject_id', caseId);
  if (error) throw error;
  return (count ?? 0) > 0;
}
