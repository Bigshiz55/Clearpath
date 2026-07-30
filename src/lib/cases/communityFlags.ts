import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Community correction data layer. `submitFlag` is what an authenticated
 * endpoint calls (no route is built in this phase — out of scope is "no
 * UI", and a request handler is not part of the "matching job, extraction
 * logic, review queue data layer, fixtures" file list — but this is the
 * function such a handler would call, using the caller's own session-scoped
 * client so RLS enforces "a user can only submit their own flag").
 *
 * `getAgreementCounts` aggregates across ALL users' flags to weight the
 * review queue ordering, which `case_match_flags`' owner-scoped RLS
 * (migration 0037) deliberately does not allow a regular user's client to
 * do — callers pass the admin client (see src/lib/supabase/admin.ts), same
 * trust boundary as `reviewQueue.ts`.
 */

export type FlagAssertion = 'same' | 'different';

function orderedPair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

/** A user asserts "same case as X" or "not the same case" for a pair of episodes. Upserts — a user can change their mind. */
export async function submitFlag(
  supabase: SupabaseClient,
  userId: string,
  episodeIdA: number,
  episodeIdB: number,
  assertion: FlagAssertion,
): Promise<void> {
  const [episode_a_id, episode_b_id] = orderedPair(episodeIdA, episodeIdB);
  const { error } = await supabase.from('case_match_flags').upsert(
    { user_id: userId, episode_a_id, episode_b_id, assertion },
    { onConflict: 'user_id,episode_a_id,episode_b_id' },
  );
  if (error) throw error;
}

/**
 * Count of concurring 'same' assertions per pair, keyed "episodeAId:episodeBId"
 * (canonically ordered). Requires a client that can see every user's flags —
 * see the module doc above.
 */
export async function getAgreementCounts(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('case_match_flags')
    .select('episode_a_id, episode_b_id')
    .eq('assertion', 'same');
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data as { episode_a_id: number; episode_b_id: number }[]) {
    const key = `${row.episode_a_id}:${row.episode_b_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
