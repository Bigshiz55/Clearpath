'use server';

import { z } from 'zod';
import { addToWatchlist, updateWatchlistItem, type ActionResult } from '@/lib/actions/watchlist';

const schema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().min(1).max(300),
  year: z.number().int().nullable().optional(),
  posterPath: z.string().max(300).nullable().optional(),
  verdict: z.enum(['seen', 'not_interested', 'disliked']),
});

// Each flag becomes a real signal the Taste-DNA learns from (it reads
// watchlist ratings). "Didn't like it" is a strong negative; "not interested"
// a milder one; "seen it" is neutral — just marks it watched so it stops
// getting recommended, without skewing the model.
const MAP: Record<z.infer<typeof schema>['verdict'], { status: 'watched' | 'dropped'; rating: number | null }> = {
  disliked: { status: 'dropped', rating: 2 },
  not_interested: { status: 'dropped', rating: 3 },
  seen: { status: 'watched', rating: null },
};

/**
 * Record a "not for me" flag on a title. Feeds the WatchVrdikt DNA Score: the
 * negative flags pull your Taste-DNA away from similar titles, so the next set
 * of picks improves. Reuses the validated watchlist actions.
 */
export async function recordTasteFeedback(input: z.infer<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid feedback.' };
  const v = parsed.data;
  const m = MAP[v.verdict];

  const res = await addToWatchlist({
    tmdbId: v.tmdbId,
    mediaType: v.mediaType,
    title: v.title,
    year: v.year ?? null,
    posterPath: v.posterPath ?? null,
    status: m.status,
  });
  if (!res.ok) return res;

  if (m.rating != null) {
    const itemId = (res.data as { itemId?: string } | undefined)?.itemId;
    if (itemId) await updateWatchlistItem({ itemId, rating: m.rating });
  }
  return { ok: true };
}
