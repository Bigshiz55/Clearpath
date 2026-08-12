'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { addToWatchlist, updateWatchlistItem, type ActionResult } from '@/lib/actions/watchlist';
import { recordOutcome } from '@/lib/reco/store';
import { gradeCall, reactionOption, type CallGrade } from '@/lib/verdict/postWatch';

const schema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().min(1).max(300),
  year: z.number().int().nullable().optional(),
  posterPath: z.string().max(300).nullable().optional(),
  reaction: z.enum(['loved', 'liked', 'okay', 'not_for_me']),
  /** The score we showed when they made the decision. Null = nothing to grade. */
  predicted: z.number().min(0).max(100).nullable().optional(),
  genres: z.array(z.string().max(60)).max(12).optional(),
});

export interface PostWatchResult extends ActionResult {
  grade?: CallGrade;
}

/**
 * "DID WE GET IT RIGHT?" — record one post-watch reaction.
 *
 * The reaction does two jobs, and it is important that they are the same write.
 *
 *   IT TEACHES. The rating lands on `watchlist_items.rating`, which is the field
 *   Taste-DNA already learns from. So answering this makes the next set of picks
 *   better, not just the accuracy dashboard prettier. It is also our DEDUPE KEY:
 *   once a rating exists we never ask about that title again.
 *
 *   IT GRADES US. The reaction is compared against the band our score actually
 *   put the title in, and the result is returned so the user sees us marking our
 *   own homework in the same breath. It is also logged to the validation store
 *   for the aggregate hit rate — FAIL-OPEN, because a logging table that isn't
 *   migrated yet must never cost a user their rating.
 *
 * We grade against the score the caller passes (the one that was on screen),
 * never a freshly recomputed one — otherwise we would be marking ourselves
 * against a moving target.
 */
export async function recordPostWatch(input: z.infer<typeof schema>): Promise<PostWatchResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid feedback.' };
  const v = parsed.data;
  const opt = reactionOption(v.reaction);

  const added = await addToWatchlist({
    tmdbId: v.tmdbId,
    mediaType: v.mediaType,
    title: v.title,
    year: v.year ?? null,
    posterPath: v.posterPath ?? null,
    status: 'watched',
    provenance: 'explicit_mark_seen',
  });
  if (!added.ok) return added;

  const itemId = (added.data as { itemId?: string } | undefined)?.itemId;
  if (itemId) {
    const rated = await updateWatchlistItem({ itemId, rating: opt.rating });
    if (!rated.ok) return rated;
  }

  // Validation logging is best-effort by design (see `recordOutcome`, which
  // already swallows a missing table). Nothing below can fail the user's rating.
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await recordOutcome(supabase, user.id, {
        tmdbId: v.tmdbId,
        mediaType: v.mediaType,
        kind: opt.outcome,
        predicted: v.predicted ?? undefined,
        genres: v.genres ?? [],
      });
    }
  } catch {
    // Logging only. The rating is already saved.
  }

  return { ok: true, grade: gradeCall(v.predicted ?? null, v.reaction) };
}
