'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { recordEvents, undoEvent } from '@/lib/preference/store';
import { getCachedDimensions } from '@/lib/titleDimensions';
import { quizAnswerToEvent, legacyRatingFor, type QuizAnswer } from '@/lib/preference/quizMap';
import { rateQuizTitle } from '@/lib/actions/quiz';

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
  /**
   * DEPRECATED and inert. The quiz no longer has a Save action, so nothing
   * sends this. Kept in the schema (rather than removed) so an old client still
   * in a browser tab cannot fail validation mid-session — but it is ignored, so
   * a stale client can no longer create watchlist rows from a quiz tap.
   */
  watchlist: z.boolean().optional(),
  dnf: z.boolean().optional(),
  reasons: z.array(z.string().max(40)).max(6).optional(),
  dwellMs: z.number().int().min(0).max(600000).optional(),
  /** Which surface produced this answer: 'calibration' (onboarding, counts toward
   *  Quiz Progress), 'pack:<key>' (optional booster), or 'quiz' (default). */
  source: z.string().max(40).optional(),
  /** Founder test session id (isolates the event to a named session). */
  sessionId: z.string().max(80).optional(),
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
    source: a.source ?? 'quiz',
  };

  // 1) The real engine (idempotent on eventId → duplicate taps write once).
  await recordEvents(supabase, user.id, [quizAnswerToEvent(answer)], a.sessionId ? { sessionId: a.sessionId } : {});

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

  // 3) The quiz used to write a watchlist row for its Save action. That branch
  //    is GONE, not disabled: saving is a decision about what to watch, and the
  //    quiz is about who you are. `a.watchlist` is accepted by the schema so a
  //    stale client mid-session still validates, but it is read by nothing —
  //    which is what stops an old tab creating watchlist rows from quiz taps.

  return { ok: true };
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
