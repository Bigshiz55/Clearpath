'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { recordEvents, undoEvent } from '@/lib/preference/store';
import { getCachedDimensions } from '@/lib/titleDimensions';
import { quizAnswerToEvent, legacyRatingFor, type QuizAnswer } from '@/lib/preference/quizMap';
import { rateQuizTitle } from '@/lib/actions/quiz';
import { addToWatchlist } from '@/lib/actions/watchlist';

/**
 * The ONE write path from the redesigned two-step quiz into the real Watch DNA
 * engine. A "Seen it" rating persists a rich `preference_events` row (Loved ≠
 * Liked ≠ DNF, etc.) AND mirrors a legacy 1–10 watchlist rating so existing
 * recommendation seeds keep working. "Haven't seen"/"Not sure" persist as
 * zero-DNA exposure so we don't re-ask. No parallel scoring engine.
 */
const schema = z.object({
  eventId: z.string().min(6).max(64),
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().min(1).max(300),
  year: z.number().int().nullable().optional(),
  posterPath: z.string().max(300).nullable().optional(),
  recognition: z.enum(['seen', 'unseen', 'unsure']),
  rating: z.enum(['loved', 'liked', 'okay', 'disliked', 'hated']).optional(),
  /** Pre-watch intent for unseen titles (Looks Good / Add to Watchlist / Not Interested). */
  attraction: z.enum(['must_watch', 'interested', 'maybe_interested', 'not_interested', 'absolutely_not']).optional(),
  /** Strong intent: also save the title to the high-intent watchlist. */
  watchlist: z.boolean().optional(),
  dnf: z.boolean().optional(),
  reasons: z.array(z.string().max(40)).max(6).optional(),
  dwellMs: z.number().int().min(0).max(600000).optional(),
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
    recognition: a.recognition,
    rating: a.rating,
    attraction: a.attraction,
    dnf: a.dnf,
    reasons: a.reasons as QuizAnswer['reasons'],
    dims,
    dwellMs: a.dwellMs,
    source: 'quiz',
  };

  // 1) The real engine (idempotent on eventId → duplicate taps write once).
  await recordEvents(supabase, user.id, [quizAnswerToEvent(answer)]);

  // 2) Legacy watchlist mirror for SEEN ratings (keeps existing recs seeded).
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

  // 3) Strong intent ("Add to Watchlist") ALSO saves to the high-intent list.
  //    "Looks Good" never does — the watchlist stays a deliberate list.
  if (a.watchlist) {
    await addToWatchlist({
      tmdbId: a.tmdbId,
      mediaType: a.mediaType,
      title: a.title,
      year: a.year ?? null,
      posterPath: a.posterPath ?? null,
      status: 'strict',
    }).catch(() => {});
  }

  return { ok: true };
}

/**
 * Watchlist-only save for the non-blocking "Looks good → Add to Watchlist" chip.
 * It upgrades intent to a real save WITHOUT recording a second DNA event (the
 * "Looks Good" attraction signal was already logged), so we never double-count.
 */
const watchlistSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().min(1).max(300),
  year: z.number().int().nullable().optional(),
  posterPath: z.string().max(300).nullable().optional(),
});

export async function addQuizToWatchlist(input: z.infer<typeof watchlistSchema>): Promise<{ ok: boolean }> {
  const parsed = watchlistSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const v = parsed.data;
  const res = await addToWatchlist({
    tmdbId: v.tmdbId,
    mediaType: v.mediaType,
    title: v.title,
    year: v.year ?? null,
    posterPath: v.posterPath ?? null,
    status: 'strict',
  }).catch(() => ({ ok: false as const }));
  return { ok: res.ok };
}

/** Undo the most recent quiz answer (soft-delete, audit trail preserved). */
export async function undoQuizAnswer(eventId: string): Promise<{ ok: boolean }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const ok = await undoEvent(supabase, user.id, eventId);
  return { ok };
}
