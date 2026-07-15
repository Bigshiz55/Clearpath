'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordScoreSample } from '@/lib/scoreSamples';

const schema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().min(1).max(300),
  year: z.number().int().nullable().optional(),
  posterPath: z.string().max(300).nullable().optional(),
  rating: z.number().int().min(1).max(10),
});

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

/** Record a taste-quiz rating as a watched item (feeds recommendations). */
export async function rateQuizTitle(
  input: z.infer<typeof schema>,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid rating.' };
  const v = parsed.data;

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not signed in.' };

    const watchlistId = await getOrCreateDefaultWatchlist(supabase, user.id);
    const { error } = await supabase.from('watchlist_items').upsert(
      {
        watchlist_id: watchlistId,
        user_id: user.id,
        tmdb_id: v.tmdbId,
        media_type: v.mediaType,
        title: v.title,
        year: v.year ?? null,
        poster_path: v.posterPath ?? null,
        status: 'watched',
        rating: v.rating,
        watched_at: new Date().toISOString(),
      },
      { onConflict: 'watchlist_id,tmdb_id,media_type' },
    );
    if (error) return { ok: false, error: error.message };

    // Snapshot a calibration training row (best-effort; never blocks the rating).
    await recordScoreSample(supabase, user.id, v.tmdbId, v.mediaType, 'US', v.rating);

    revalidatePath('/app');
    revalidatePath('/app/watchlist');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to save.' };
  }
}
