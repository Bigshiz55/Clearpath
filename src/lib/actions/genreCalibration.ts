'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { recordEvents } from '@/lib/preference/store';
import {
  CALIBRATION_GENRE_SLUGS,
  genreAnswerToEvent,
} from '@/lib/preference/genreCalibration';

/**
 * The ONE write path from the genre-calibration step into the real engine.
 * Mirrors `recordQuizAnswer`'s contract: zod-validated, auth-required,
 * idempotent on eventId (a duplicate tap writes once — a CHANGED answer
 * carries a new eventId and appends, which is exactly how an append-only
 * evidence log absorbs a person changing their mind). Fail-soft: the write
 * never throws to the UI.
 */
const schema = z.object({
  eventId: z.string().min(6).max(64),
  slug: z.enum(CALIBRATION_GENRE_SLUGS as [string, ...string[]]),
  rating: z.number().int().min(1).max(10).optional(),
  notForMe: z.boolean().optional(),
  /** Founder test-session scoping, when answered from within a test session. */
  sessionId: z.string().max(64).optional(),
}).refine((v) => v.notForMe === true || v.rating != null, {
  message: 'An answer is a rating or a rule-out.',
});

export async function recordGenreAnswer(
  input: z.infer<typeof schema>,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid answer.' };
  const a = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const event = genreAnswerToEvent(
    { slug: a.slug, rating: a.rating, notForMe: a.notForMe },
    Date.now(),
    a.eventId,
  );
  await recordEvents(supabase, user.id, [event], { sessionId: a.sessionId });
  return { ok: true };
}
