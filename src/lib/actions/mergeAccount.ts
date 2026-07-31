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
  /** True when the target account has no existing watchlist data of its own
   *  — nothing to conflict with, so it's safe to merge without asking. */
  safeToAutoMerge: boolean;
}

async function countWatchlistItems(admin: SupabaseClient, userId: string): Promise<number> {
  const { count } = await admin.from('watchlist_items').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  return count ?? 0;
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

  const [anonItemCount, targetItemCount] = await Promise.all([
    countWatchlistItems(admin, anonUserId),
    countWatchlistItems(admin, target.id),
  ]);

  return {
    anonUserId,
    targetUserId: target.id,
    anonItemCount,
    targetItemCount,
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
 * Runs the actual merge (watchlist + profile), logs it, then deletes the
 * anonymous auth.users row — its `on delete cascade` FKs clean up whatever
 * lower-value personalization data (dimension overrides, push subscriptions,
 * taste-quiz answers, ...) wasn't explicitly moved above.
 */
export async function performMerge(anonUserId: string): Promise<{ ok: boolean; error?: string }> {
  const preview = await getMergePreview(anonUserId);
  if (!preview) return { ok: false, error: 'Nothing to merge.' };

  const admin = createAdminClient();
  try {
    await moveWatchlistData(admin, preview.anonUserId, preview.targetUserId);
    await moveProfileIfMissing(admin, preview.anonUserId, preview.targetUserId);
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
  if (preview.anonItemCount === 0) {
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
