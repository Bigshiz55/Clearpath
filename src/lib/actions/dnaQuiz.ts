'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { recordEvents, undoEvent } from '@/lib/preference/store';
import { persistDnaSnapshot } from '@/lib/preference/snapshotStore';
import { getCachedDimensions } from '@/lib/titleDimensions';
import { quizAnswerToEvent, legacyRatingFor, savesToWatchlist, type QuizAnswer } from '@/lib/preference/quizMap';
import { rateQuizTitle } from '@/lib/actions/quiz';
import { addToWatchlist } from '@/lib/actions/watchlist';

/**
 * The ONE write path from the Watch DNA card into the real engine. Each intent
 * feeds the correct channel (pre-watch ATTRACTION vs post-watch EXPERIENCE), and
 * "Watchlist" additionally saves the title. Idempotent on eventId (duplicate taps
 * write once). Fail-soft: the DNA write never throws to the UI.
 */
const schema = z.object({
  eventId: z.string().min(6).max(64),
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().min(1).max(300),
  year: z.number().int().nullable().optional(),
  posterPath: z.string().max(300).nullable().optional(),
  intent: z.enum(['looks_good', 'watchlist', 'not_interested', 'seen']),
  rating: z.enum(['loved', 'liked', 'okay', 'disliked']).optional(),
  dwellMs: z.number().int().min(0).max(600000).optional(),
  /** Tags the event by originating surface (e.g. 'calibration' for the
   *  cold-start title grid). Defaults to 'quiz' — the card flow's own answers. */
  source: z.string().max(40).optional(),
  /** Founder test-session scoping, when answered from within a test session. */
  sessionId: z.string().max(64).optional(),
});

export async function recordQuizAnswer(input: z.infer<typeof schema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid answer.' };
  const a = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const titleId = `${a.mediaType}:${a.tmdbId}`;

  // Best-effort fingerprint enrichment from cache — one indexed query, no TMDB,
  // no AI. Missing dims are fine (the engine degrades to genre/neutral).
  let dims: Record<string, number> | undefined;
  try {
    const map = await getCachedDimensions([{ tmdb_id: a.tmdbId, media_type: a.mediaType }]);
    dims = map.get(`${a.mediaType}-${a.tmdbId}`) ?? undefined;
  } catch {
    dims = undefined;
  }

  const answer: QuizAnswer = {
    eventId: a.eventId,
    titleId,
    at: Date.now(),
    intent: a.intent,
    rating: a.rating,
    dims,
    dwellMs: a.dwellMs,
    source: a.source ?? 'quiz',
  };

  // 1) The real engine (idempotent on eventId → duplicate taps write once).
  await recordEvents(supabase, user.id, [quizAnswerToEvent(answer)], { sessionId: a.sessionId });

  // 1b) Append a derived-state snapshot (temporal taste memory) — best-effort,
  //     off the search path, history appended not overwritten. Never a no-op
  //     source of truth: the event log stays authoritative and re-derivable.
  void persistDnaSnapshot(supabase, user.id, undefined, a.sessionId).catch(() => {});

  // 2) "Watchlist" saves the title (status: possible = wants to watch). Only the
  //    Watchlist intent writes here — "Looks good" is a taste signal only.
  if (savesToWatchlist(answer)) {
    await addToWatchlist({
      tmdbId: a.tmdbId,
      mediaType: a.mediaType,
      title: a.title,
      year: a.year ?? null,
      posterPath: a.posterPath ?? null,
      status: 'possible',
    }).catch(() => {});
  }

  // 3) Legacy watchlist mirror for SEEN ratings (keeps existing recs seeded).
  const legacy = legacyRatingFor(answer);
  if (legacy != null) {
    await rateQuizTitle({
      tmdbId: a.tmdbId,
      mediaType: a.mediaType,
      title: a.title,
      year: a.year ?? null,
      posterPath: a.posterPath ?? null,
      rating: legacy,
    }).catch(() => {});
  }

  return { ok: true };
}

/**
 * Undo the most recent quiz answer (soft-delete the DNA event, audit trail kept).
 * If it was a "Watchlist" save, also remove the item so Undo fully reverses the
 * action.
 */
export async function undoQuizAnswer(
  eventId: string,
  watchlistItem?: { tmdbId: number; mediaType: 'movie' | 'tv' },
): Promise<{ ok: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const ok = await undoEvent(supabase, user.id, eventId);

  if (watchlistItem) {
    await supabase
      .from('watchlist_items')
      .delete()
      .eq('user_id', user.id)
      .eq('tmdb_id', watchlistItem.tmdbId)
      .eq('media_type', watchlistItem.mediaType)
      .then(() => undefined, () => undefined);
  }

  return { ok };
}
