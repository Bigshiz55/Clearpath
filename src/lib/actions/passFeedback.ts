'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addToWatchlist, updateWatchlistItem, removeWatchlistItem, type ActionResult } from '@/lib/actions/watchlist';
import { rateQuizTitle } from '@/lib/actions/quiz';

export type FeedbackType = 'seen' | 'not_right_now' | 'not_for_me' | 'didnt_like' | 'removed_without_reason';

const schema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().min(1).max(300),
  year: z.number().int().nullable().optional(),
  posterPath: z.string().max(300).nullable().optional(),
  feedbackType: z.enum(['seen', 'not_right_now', 'not_for_me', 'didnt_like', 'removed_without_reason']),
  rating: z.number().int().min(1).max(10).nullable().optional(),
  reasonCodes: z.array(z.string().max(40)).max(12).optional(),
  freeText: z.string().max(400).nullable().optional(),
  // Recommendation context (all optional / best-effort).
  sessionId: z.string().max(64).nullable().optional(),
  source: z.string().max(64).nullable().optional(),
  position: z.number().int().nullable().optional(),
  matchScore: z.number().int().nullable().optional(),
});

export type PassFeedbackInput = z.infer<typeof schema>;

/** True when migration 0020 hasn't been applied yet (feature stays dormant). */
function missingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42P01' || /recommendation_feedback|analytics_events/.test(err.message ?? '');
}

/** Best-effort analytics — never blocks, never carries PII beyond the user id. */
export async function recordAnalyticsEvent(name: string, props: Record<string, unknown> = {}): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from('analytics_events').insert({ user_id: user?.id ?? null, name: name.slice(0, 64), props });
  } catch {
    /* analytics are best-effort */
  }
}

async function persistFeedback(
  supabase: SupabaseClient,
  userId: string,
  v: PassFeedbackInput,
  watched: boolean,
  temporary: boolean,
): Promise<void> {
  const row = {
    user_id: userId,
    tmdb_id: v.tmdbId,
    media_type: v.mediaType,
    feedback_type: v.feedbackType,
    rating_1_to_10: v.rating ?? null,
    watched,
    temporary_signal: temporary,
    selected_reason_codes: v.reasonCodes ?? [],
    free_text_reason: v.freeText ?? null,
    recommendation_session_id: v.sessionId ?? null,
    recommendation_source: v.source ?? null,
    recommendation_position: v.position ?? null,
    match_score: v.matchScore ?? null,
    updated_at: new Date().toISOString(),
  };
  try {
    const { error } = await supabase
      .from('recommendation_feedback')
      .upsert(row, { onConflict: 'user_id,tmdb_id,media_type' });
    if (error && missingTable(error)) return; // dormant until migration applied
    // History trail (append-only) — a superseded response stays traceable.
    await supabase.from('recommendation_feedback_events').insert({
      user_id: userId,
      tmdb_id: v.tmdbId,
      media_type: v.mediaType,
      feedback_type: v.feedbackType,
      payload: { rating: v.rating ?? null, reasons: v.reasonCodes ?? [], source: v.source ?? null, position: v.position ?? null, matchScore: v.matchScore ?? null },
    });
  } catch {
    /* best-effort persistence */
  }
}

/**
 * The single entry point for a Pass / feedback submission. Persists the
 * structured record and applies the correctly-weighted Taste-DNA signal:
 *
 *  - seen           → mark watched; if rated, feed the real rating into the DNA
 *  - didnt_like     → watched + a strong negative rating (they saw it, it missed)
 *  - not_for_me     → a moderate negative (dropped + low rating) — "less like this"
 *  - removed…       → a light negative (dropped) — "just hide it"
 *  - not_right_now  → TEMPORARY: no watchlist write, no DNA change at all
 *
 * Returns whether the DNA was affected (for the toast + analytics).
 */
export async function submitPassFeedback(input: PassFeedbackInput): Promise<ActionResult & { affectedDna?: boolean }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid feedback.' };
  const v = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  let watched = false;
  let temporary = false;
  let affectedDna = false;

  const base = { tmdbId: v.tmdbId, mediaType: v.mediaType, title: v.title, year: v.year ?? null, posterPath: v.posterPath ?? null };

  try {
    switch (v.feedbackType) {
      case 'seen': {
        watched = true;
        if (v.rating != null) {
          const r = await rateQuizTitle({ ...base, rating: v.rating });
          if (!r.ok) return r;
          affectedDna = true;
        } else {
          const r = await addToWatchlist({ ...base, status: 'watched' });
          if (!r.ok) return r;
        }
        break;
      }
      case 'didnt_like': {
        watched = true;
        // They watched it and it missed — a real, strong negative rating.
        const r = await rateQuizTitle({ ...base, rating: v.rating ?? 2 });
        if (!r.ok) return r;
        affectedDna = true;
        break;
      }
      case 'not_for_me': {
        // Moderate negative — dropped so it leaves picks, low rating so the DNA
        // learns "less like this" from its fingerprint.
        const r = await addToWatchlist({ ...base, status: 'dropped' });
        if (!r.ok) return r;
        const itemId = (r.data as { itemId?: string } | undefined)?.itemId;
        if (itemId) await updateWatchlistItem({ itemId, rating: 3 });
        affectedDna = true;
        break;
      }
      case 'removed_without_reason': {
        // Light negative — just hide it from picks.
        const r = await addToWatchlist({ ...base, status: 'dropped' });
        if (!r.ok) return r;
        const itemId = (r.data as { itemId?: string } | undefined)?.itemId;
        if (itemId) await updateWatchlistItem({ itemId, rating: 4 });
        affectedDna = true;
        break;
      }
      case 'not_right_now': {
        // Temporary / contextual — deliberately NO watchlist write and NO DNA change.
        temporary = true;
        break;
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save.' };
  }

  await persistFeedback(supabase, user.id, v, watched, temporary);

  revalidatePath('/app');
  revalidatePath('/app/watch');
  return { ok: true, affectedDna };
}

/**
 * Undo a just-submitted pass: delete the feedback row and (for the non-temporary
 * types) remove the watchlist item so the title returns to the picks. Best-effort
 * and scoped to the short undo window.
 */
export async function undoPassFeedback(input: { tmdbId: number; mediaType: 'movie' | 'tv' }): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  try {
    await supabase.from('recommendation_feedback').delete().eq('user_id', user.id).eq('tmdb_id', input.tmdbId).eq('media_type', input.mediaType);
  } catch {
    /* table may be missing */
  }
  // Remove the watchlist row this pass created/updated so the card can resurface.
  const { data: item } = await supabase
    .from('watchlist_items')
    .select('id')
    .eq('user_id', user.id)
    .eq('tmdb_id', input.tmdbId)
    .eq('media_type', input.mediaType)
    .maybeSingle();
  if (item?.id) await removeWatchlistItem(item.id as string);

  revalidatePath('/app');
  revalidatePath('/app/watch');
  return { ok: true };
}
