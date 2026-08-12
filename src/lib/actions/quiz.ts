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
  /** Defaults to the game, because that is where the overwhelming majority
   *  of these come from and a caller that forgets should not be able to
   *  masquerade as an explicit user action. */
  provenance: z
    .enum(['taste_game_rating', 'explicit_mark_seen', 'onboarding_seed'])
    .optional(),
  /**
   * Did the user actually WATCH it?
   *
   * Defaults true because a rating normally implies one. It is a parameter
   * because onboarding asks "what do you want to AVOID", and the old code ran
   * those answers through here at rating 2 — so naming a film you never want to
   * see marked it as watched. A stated dislike of something unseen is a real
   * preference and is not a viewing.
   */
  seen: z.boolean().optional(),
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

/**
 * Record a taste-quiz rating.
 *
 * THIS FUNCTION IS THE WATCHLIST CONTAMINATION. It wrote `status: 'watched'`
 * into the user's default watchlist for every rating, and `TasteGame` — which
 * tops its deck up so "the game feels endless" — calls it on every tap. A real
 * account reached ~518 watched titles this way, almost none of which the owner
 * recognised as something they had asked to save.
 *
 * The row still exists, because the RATING is real and the recommendation
 * engine has always been seeded from it. What changed is that it now says where
 * it came from, so the Watchlist can stop presenting a ratings log as a
 * collection the user curated. See `lib/watchlist/provenance.ts`.
 *
 * `provenance` is a parameter rather than a constant because the same rating
 * path is used by onboarding seeds and by explicit "I've seen it" verdicts, and
 * those are genuinely different claims.
 */
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
        status: v.seen === false ? 'possible' : 'watched',
        provenance: v.provenance ?? 'taste_game_rating',
        rating: v.rating,
        watched_at: v.seen === false ? null : new Date().toISOString(),
      },
      { onConflict: 'watchlist_id,tmdb_id,media_type' },
    );
    if (error) return { ok: false, error: error.message };

    // Snapshot a calibration training row (best-effort; never blocks the rating).
    await recordScoreSample(supabase, user.id, v.tmdbId, v.mediaType, 'US', v.rating);

    // Refresh every surface a new rating should change: the hub + watchlist, the
    // Watch Now recommendations (seeded from ratings), and the quiz counter.
    revalidatePath('/app');
    revalidatePath('/app/watch');
    revalidatePath('/app/watchlist');
    revalidatePath('/app/taste-quiz');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to save.' };
  }
}
