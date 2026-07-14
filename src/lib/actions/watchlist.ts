'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ActionResult {
  ok: boolean;
  error?: string;
  data?: unknown;
}

async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('You need to be signed in.');
  return user;
}

async function getOrCreateDefaultWatchlist(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from('watchlists')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .maybeSingle();
  if (existing) return existing.id as string;

  const { data: created, error } = await supabase
    .from('watchlists')
    .insert({ user_id: userId, name: 'My Watchlist', is_default: true })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return created!.id as string;
}

const addSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().min(1).max(300),
  year: z.number().int().nullable().optional(),
  posterPath: z.string().max(300).nullable().optional(),
  status: z.enum(['strict', 'possible', 'watching', 'watched', 'paused', 'dropped']),
});

export async function addToWatchlist(input: z.infer<typeof addSchema>): Promise<ActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid item.' };
  const v = parsed.data;

  try {
    const supabase = createClient();
    const user = await requireUser(supabase);
    const watchlistId = await getOrCreateDefaultWatchlist(supabase, user.id);

    const { data, error } = await supabase
      .from('watchlist_items')
      .upsert(
        {
          watchlist_id: watchlistId,
          user_id: user.id,
          tmdb_id: v.tmdbId,
          media_type: v.mediaType,
          title: v.title,
          year: v.year ?? null,
          poster_path: v.posterPath ?? null,
          status: v.status,
          watched_at: v.status === 'watched' ? new Date().toISOString() : null,
        },
        { onConflict: 'watchlist_id,tmdb_id,media_type' },
      )
      .select('id')
      .single();
    if (error) return { ok: false, error: error.message };

    revalidatePath('/app/watchlist');
    revalidatePath('/app');
    return { ok: true, data: { itemId: data!.id as string } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to add.' };
  }
}

const updateSchema = z.object({
  itemId: z.string().uuid(),
  status: z.enum(['strict', 'possible', 'watching', 'watched', 'paused', 'dropped']).optional(),
  rating: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  priority: z.number().int().min(0).max(5).optional(),
});

export async function updateWatchlistItem(input: z.infer<typeof updateSchema>): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid update.' };
  const v = parsed.data;

  try {
    const supabase = createClient();
    await requireUser(supabase);
    const patch: Record<string, unknown> = {};
    if (v.status !== undefined) {
      patch.status = v.status;
      if (v.status === 'watched') patch.watched_at = new Date().toISOString();
    }
    if (v.rating !== undefined) patch.rating = v.rating;
    if (v.notes !== undefined) patch.notes = v.notes;
    if (v.priority !== undefined) patch.priority = v.priority;

    const { error } = await supabase.from('watchlist_items').update(patch).eq('id', v.itemId);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/app/watchlist');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to update.' };
  }
}

export async function removeWatchlistItem(itemId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(itemId).success) return { ok: false, error: 'Invalid item.' };
  try {
    const supabase = createClient();
    await requireUser(supabase);
    const { error } = await supabase.from('watchlist_items').delete().eq('id', itemId);
    if (error) return { ok: false, error: error.message };
    revalidatePath('/app/watchlist');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to remove.' };
  }
}
