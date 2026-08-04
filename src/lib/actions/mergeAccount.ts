'use server';

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface MergePreview {
  anonUserId: string;
  targetUserId: string;
  anonItemCount: number;
  targetItemCount: number;
  /** Rows across preference_events, recommendation_feedback, and
   *  dimension_signals for the anonymous session — Watch DNA quiz answers
   *  and FOR/AGAINST verdicts, none of which live in watchlist_items. A
   *  visitor who only did these (never saved anything) has anonItemCount
   *  0 but real signal worth preserving. */
  anonSignalCount: number;
  /** True when the target account has no existing watchlist data of its own
   *  — nothing to conflict with, so it's safe to merge without asking. */
  safeToAutoMerge: boolean;
}

async function countWatchlistItems(admin: SupabaseClient, userId: string): Promise<number> {
  const { count } = await admin.from('watchlist_items').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  return count ?? 0;
}

/** Rows across the DNA/verdict signal tables — see MergePreview.anonSignalCount. */
async function countDnaSignals(admin: SupabaseClient, userId: string): Promise<number> {
  const [pref, feedback, dims] = await Promise.all([
    admin.from('preference_events').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('recommendation_feedback').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('dimension_signals').select('user_id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  return (pref.count ?? 0) + (feedback.count ?? 0) + (dims.count ?? 0);
}

/**
 * Read-only check: is `anonUserId` a real, still-existing anonymous Supabase
 * user, distinct from the currently signed-in (target) user? Never trusts a
 * caller-supplied id at face value — re-verifies against auth.admin so an
 * arbitrary id can't be used to merge someone else's data into the caller's
 * account.
 */
export async function getMergePreview(anonUserId: string): Promise<MergePreview | null> {
  if (!anonUserId) return null;
  const supabase = createClient();
  const {
    data: { user: target },
  } = await supabase.auth.getUser();
  if (!target || target.is_anonymous || target.id === anonUserId) return null;

  const admin = createAdminClient();
  const { data: anonLookup, error } = await admin.auth.admin.getUserById(anonUserId);
  if (error || !anonLookup?.user || anonLookup.user.is_anonymous !== true) return null;

  const [anonItemCount, targetItemCount, anonSignalCount] = await Promise.all([
    countWatchlistItems(admin, anonUserId),
    countWatchlistItems(admin, target.id),
    countDnaSignals(admin, anonUserId),
  ]);

  return {
    anonUserId,
    targetUserId: target.id,
    anonItemCount,
    targetItemCount,
    anonSignalCount,
    safeToAutoMerge: targetItemCount === 0,
  };
}

/**
 * Moves every watchlist item from the anonymous user onto the target's
 * default watchlist (flattening any non-default lists the anon session may
 * have created — the common case is exactly one, the default). Items the
 * target already tracks (same tmdb_id + media_type) are left as the
 * target's own — never overwritten — since the unique constraint is scoped
 * to (watchlist_id, tmdb_id, media_type) and the target's row already
 * satisfies it.
 */
async function moveWatchlistData(admin: SupabaseClient, anonUserId: string, targetUserId: string): Promise<void> {
  let { data: targetList } = await admin
    .from('watchlists')
    .select('id')
    .eq('user_id', targetUserId)
    .eq('is_default', true)
    .maybeSingle();

  let targetListId: string | undefined = targetList?.id as string | undefined;
  if (!targetListId) {
    const { data: created, error } = await admin
      .from('watchlists')
      .insert({ user_id: targetUserId, name: 'My Watchlist', is_default: true })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    targetListId = created!.id as string;
  }

  const { data: anonItems, error: anonItemsError } = await admin
    .from('watchlist_items')
    .select('tmdb_id, media_type, title, year, poster_path, status, priority, rating, notes, added_at, watched_at')
    .eq('user_id', anonUserId);
  if (anonItemsError) throw new Error(anonItemsError.message);
  if (!anonItems || anonItems.length === 0) return;

  const { data: existing } = await admin
    .from('watchlist_items')
    .select('tmdb_id, media_type')
    .eq('watchlist_id', targetListId);
  const existingKeys = new Set((existing ?? []).map((r) => `${r.tmdb_id}:${r.media_type}`));

  const toInsert = anonItems
    .filter((item) => !existingKeys.has(`${item.tmdb_id}:${item.media_type}`))
    .map((item) => ({ ...item, watchlist_id: targetListId, user_id: targetUserId }));

  if (toInsert.length > 0) {
    const { error } = await admin.from('watchlist_items').insert(toInsert);
    if (error) throw new Error(error.message);
  }
}

/** Adopts the anonymous session's profile only if the target has none yet — never overwrites an existing profile. */
async function moveProfileIfMissing(admin: SupabaseClient, anonUserId: string, targetUserId: string): Promise<void> {
  const { data: targetProfile } = await admin.from('profiles').select('id').eq('id', targetUserId).maybeSingle();
  if (targetProfile) return;

  const { data: anonProfile } = await admin.from('profiles').select('*').eq('id', anonUserId).maybeSingle();
  if (!anonProfile) return;

  const { id: _anonId, ...rest } = anonProfile as Record<string, unknown>;
  await admin.from('profiles').insert({ id: targetUserId, ...rest });
}

/**
 * Moves the Watch DNA quiz answers and FOR/AGAINST verdicts an anonymous
 * visitor gave before signing in. These used to be silently lost: the merge
 * only ever moved watchlist_items + profile, then deleted the anonymous
 * user row, and every one of these tables has `on delete cascade` — a
 * visitor who rated titles in the quiz or gave verdicts but never saved
 * anything to a watchlist had that signal permanently destroyed on their
 * very first sign-in, with no notice.
 *
 * `preference_events` and `recommendation_feedback_events` have no per-user
 * uniqueness beyond their own generated id, so a bulk reassignment is safe.
 * `recommendation_feedback` is unique on (user_id, tmdb_id, media_type) —
 * dedupe like watchlist items: a title the target already gave feedback on
 * keeps the target's own row. `dimension_signals` is a per-(user,dimension)
 * running weighted sum, so the two sides are additive: sum them together
 * rather than picking one when both exist.
 */
async function moveDnaSignals(admin: SupabaseClient, anonUserId: string, targetUserId: string): Promise<void> {
  await admin
    .from('preference_events')
    .update({ user_id: targetUserId })
    .eq('user_id', anonUserId);

  await admin
    .from('recommendation_feedback_events')
    .update({ user_id: targetUserId })
    .eq('user_id', anonUserId);

  const [{ data: anonFeedback }, { data: targetFeedback }] = await Promise.all([
    admin.from('recommendation_feedback').select('id, tmdb_id, media_type').eq('user_id', anonUserId),
    admin.from('recommendation_feedback').select('tmdb_id, media_type').eq('user_id', targetUserId),
  ]);
  const targetKeys = new Set((targetFeedback ?? []).map((r) => `${r.tmdb_id}:${r.media_type}`));
  const movableFeedbackIds = (anonFeedback ?? [])
    .filter((r) => !targetKeys.has(`${r.tmdb_id}:${r.media_type}`))
    .map((r) => r.id as string);
  if (movableFeedbackIds.length > 0) {
    await admin.from('recommendation_feedback').update({ user_id: targetUserId }).in('id', movableFeedbackIds);
  }

  const [{ data: anonDims }, { data: targetDims }] = await Promise.all([
    admin.from('dimension_signals').select('dimension_key, w_sum, wv_sum').eq('user_id', anonUserId),
    admin.from('dimension_signals').select('dimension_key, w_sum, wv_sum').eq('user_id', targetUserId),
  ]);
  const targetDimByKey = new Map((targetDims ?? []).map((r) => [r.dimension_key as string, r]));
  for (const row of anonDims ?? []) {
    const key = row.dimension_key as string;
    const existing = targetDimByKey.get(key);
    if (existing) {
      await admin
        .from('dimension_signals')
        .update({ w_sum: (existing.w_sum as number) + (row.w_sum as number), wv_sum: (existing.wv_sum as number) + (row.wv_sum as number) })
        .eq('user_id', targetUserId)
        .eq('dimension_key', key);
    } else {
      await admin
        .from('dimension_signals')
        .update({ user_id: targetUserId })
        .eq('user_id', anonUserId)
        .eq('dimension_key', key);
    }
  }
}

async function logMergeDecision(
  admin: SupabaseClient,
  preview: MergePreview,
  decision: 'auto_merged' | 'merged' | 'discarded',
): Promise<void> {
  await admin.from('account_merges').insert({
    anon_user_id: preview.anonUserId,
    target_user_id: preview.targetUserId,
    decision,
    anon_item_count: preview.anonItemCount,
    target_item_count: preview.targetItemCount,
  });
}

/**
 * Runs the actual merge (watchlist + profile + DNA/verdict signals), logs
 * it, then deletes the anonymous auth.users row — its `on delete cascade`
 * FKs clean up only what's left: push subscriptions and anything else with
 * no cross-session meaning to preserve.
 */
export async function performMerge(anonUserId: string): Promise<{ ok: boolean; error?: string }> {
  const preview = await getMergePreview(anonUserId);
  if (!preview) return { ok: false, error: 'Nothing to merge.' };

  const admin = createAdminClient();
  try {
    await moveWatchlistData(admin, preview.anonUserId, preview.targetUserId);
    await moveProfileIfMissing(admin, preview.anonUserId, preview.targetUserId);
    await moveDnaSignals(admin, preview.anonUserId, preview.targetUserId);
    await logMergeDecision(admin, preview, preview.safeToAutoMerge ? 'auto_merged' : 'merged');
    await admin.auth.admin.deleteUser(preview.anonUserId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Merge failed.' };
  }
}

/** Discards the anonymous session's data — keeps the target account exactly as it was. */
export async function discardAnonymousData(anonUserId: string): Promise<{ ok: boolean; error?: string }> {
  const preview = await getMergePreview(anonUserId);
  if (!preview) return { ok: false, error: 'Nothing to discard.' };

  const admin = createAdminClient();
  try {
    await logMergeDecision(admin, preview, 'discarded');
    await admin.auth.admin.deleteUser(preview.anonUserId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to discard.' };
  }
}

/**
 * Called right after a magic-link exchange when an anonymous session was
 * active beforehand. Auto-merges when it's unambiguous (the target has no
 * watchlist of its own — nothing to lose either way); otherwise returns the
 * preview so the caller can send the user to a decision screen. Never
 * silently discards or silently merges when both sides have real data.
 */
export async function autoMergeIfSafe(anonUserId: string): Promise<{ status: 'merged' | 'no_anon_data' | 'needs_decision'; preview?: MergePreview }> {
  const preview = await getMergePreview(anonUserId);
  if (!preview) return { status: 'no_anon_data' };
  // Watchlist items used to be the only thing checked here — a visitor who
  // only did the Watch DNA quiz or gave FOR/AGAINST verdicts (never saved
  // anything) has anonItemCount 0 and would hit this branch, which deleted
  // the anonymous user immediately. Their quiz answers and verdicts are
  // real data too; anonSignalCount catches that case.
  if (preview.anonItemCount === 0 && preview.anonSignalCount === 0) {
    // Nothing to merge — still clean up the now-orphaned anonymous user.
    const admin = createAdminClient();
    await logMergeDecision(admin, preview, 'auto_merged');
    await admin.auth.admin.deleteUser(preview.anonUserId).catch(() => {});
    return { status: 'no_anon_data' };
  }
  if (preview.safeToAutoMerge) {
    const result = await performMerge(anonUserId);
    return result.ok ? { status: 'merged' } : { status: 'needs_decision', preview };
  }
  return { status: 'needs_decision', preview };
}
