'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { recordEvents } from '@/lib/preference/store';
import { getCachedDimensions } from '@/lib/titleDimensions';
import { fingerprintKey } from '@/lib/taste/fingerprint';
import { resolveAnswer, type AnswerKey } from '@/lib/import/rapidFire';
import type { ExperienceGrade, PreferenceEvent } from '@/lib/preference/types';

/**
 * PERSIST ONE RAPID-FIRE ANSWER — through the canonical Taste DNA event log,
 * with the EXISTING semantics only.
 *
 * `resolveAnswer` (the pure module the demo already uses) decides what an
 * answer MEANS; this action only lands that meaning:
 *
 *   loved/liked/fine/disliked → an ordinary post-watch EXPERIENCE event, the
 *                               same grades the taste quiz writes.
 *   bailed                    → experienceGrade 'dnf' — the engine's own
 *                               did-not-finish grade (strength 1.3, heavier
 *                               than a thumbs-up, exactly as signals.ts
 *                               prices it). Not a new signal — the one that
 *                               was already there.
 *   interrupted               → NO taste write. "Life got in the way" is a
 *                               fact about their week, not the title; the
 *                               only record is the asked-marker below.
 *   dont_remember             → NO taste write. Forgetting is not a verdict.
 *   not_me                    → deletes the history row (someone else's
 *                               viewing is not evidence about this person)
 *                               and writes NO taste event.
 *
 * EVERY kept answer also lands an ASKED-MARKER: the no-taste answers write a
 * `skip` action event (zero DNA by the engine's own definition), so the
 * queue can exclude already-asked titles across sittings without ever
 * inventing an opinion for them.
 */
const schema = z.object({
  eventId: z.string().min(6).max(64),
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  title: z.string().min(1).max(300),
  answer: z.enum(['loved', 'liked', 'fine', 'disliked', 'bailed', 'interrupted', 'not_me', 'dont_remember']),
  sessionId: z.string().max(64).optional(),
});

const EXPERIENCE_FOR: Partial<Record<AnswerKey, ExperienceGrade>> = {
  loved: 'loved',
  liked: 'liked',
  fine: 'okay',
  disliked: 'disliked',
  bailed: 'dnf',
};

export async function recordRapidFireAnswer(
  input: z.infer<typeof schema>,
): Promise<{ ok: boolean; taught: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, taught: false, error: 'Invalid answer.' };
  const a = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, taught: false, error: 'Not signed in.' };

  const resolution = resolveAnswer(a.answer);

  if (resolution.dropsObservation) {
    // "Wasn't me": the row was never evidence about this person. Delete it —
    // scoped to exactly this user's history rows for this title.
    await supabase
      .from('watchlist_items')
      .delete()
      .eq('user_id', user.id)
      .eq('tmdb_id', a.tmdbId)
      .eq('media_type', a.mediaType)
      .in('status', ['watched', 'dropped']);
    return { ok: true, taught: false };
  }

  const titleId = `${a.mediaType}:${a.tmdbId}`;
  const grade = EXPERIENCE_FOR[a.answer];

  let event: PreferenceEvent;
  if (grade) {
    // Best-effort fingerprint enrichment from cache — same as the quiz path.
    let dims: Record<string, number> | undefined;
    try {
      const map = await getCachedDimensions([{ tmdb_id: a.tmdbId, media_type: a.mediaType }]);
      dims = map.get(fingerprintKey(a)) ?? undefined;
    } catch {
      dims = undefined;
    }
    event = {
      id: a.eventId,
      at: Date.now(),
      titleId,
      dims,
      action: grade === 'disliked' || grade === 'dnf' ? 'seen_disliked' : 'seen_liked',
      experienceGrade: grade,
      source: 'rapid-fire',
      familiarity: 1,
    };
  } else {
    // interrupted / dont_remember: asked, no opinion. `skip` is the engine's
    // own zero-DNA action — a marker, never a fabricated preference.
    event = {
      id: a.eventId,
      at: Date.now(),
      titleId,
      action: 'skip',
      source: 'rapid-fire',
    };
  }

  await recordEvents(supabase, user.id, [event], { sessionId: a.sessionId });
  return { ok: true, taught: Boolean(grade) };
}
