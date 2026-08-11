'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { recordEvents } from '@/lib/preference/store';
import { getCachedDimensions } from '@/lib/titleDimensions';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { canonicalTitleId, mediaTypeFor } from '@/lib/showdown/mediaType';
import { decisionToEvents } from '@/lib/showdown/canonical';

/**
 * THE ONE WRITE PATH FROM SHOWDOWN INTO PERMANENT TASTE DNA.
 *
 * It goes through `recordEvents` — the same function the title-grid calibration
 * uses — so Showdown does not become a second answer to "what does this person
 * like". One log, one engine, one profile.
 *
 * MODE IS VALIDATED, NOT TRUSTED. The client already refuses to persist a
 * tonight run, and this refuses it again: a mode is the difference between a
 * mood and an identity, and a single client bug should not be able to overwrite
 * someone's profile with what they wanted on a Tuesday. Cheap check, permanent
 * consequence if it is missing.
 */
const decisionSchema = z.object({
  leftId: z.string().min(1).max(64),
  rightId: z.string().min(1).max(64),
  verdict: z.enum(['left', 'right', 'neither']),
  at: z.number().int().nonnegative(),
  responseMs: z.number().int().min(0).max(600_000),
  /** How cleanly the matchup isolated an axis — decides the attraction grade. */
  attribution: z.number().min(0).max(1),
});

const schema = z.object({
  /** Only `dna` may ever reach this action. */
  mode: z.literal('dna'),
  sessionId: z.string().max(64).optional(),
  decisions: z.array(decisionSchema).min(1).max(40),
});

export async function recordShowdownSession(
  input: z.infer<typeof schema>,
): Promise<{ ok: boolean; recorded?: number; error?: string }> {
  const parsed = schema.safeParse(input);
  // A `tonight` payload fails `z.literal('dna')` here and is refused with the
  // same message as malformed input — there is no branch that accepts it.
  if (!parsed.success) return { ok: false, error: 'Invalid session.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const refFor = (titleId: string) => {
    const t = TITLES.find((x) => x.id === titleId);
    const canonical = canonicalTitleId(titleId);
    if (!t || !canonical) return null;
    return { titleId: canonical, tmdbId: t.tmdbId, mediaType: mediaTypeFor(titleId) };
  };

  const events = parsed.data.decisions.flatMap((d) =>
    decisionToEvents(
      d,
      { left: refFor(d.leftId), right: refFor(d.rightId) },
      d.attribution,
    ),
  );
  if (events.length === 0) return { ok: true, recorded: 0 };

  /* Fingerprint enrichment from CACHE ONLY — one indexed query, no TMDB call
     and no AI on a user request path. A title with no cached fingerprint still
     records; the engine degrades to genre/neutral, which is the behaviour the
     title-grid path already relies on. */
  try {
    const wanted = events.map((e) => {
      const [mt, id] = e.titleId.split(':');
      return { tmdb_id: Number(id), media_type: mt as 'movie' | 'tv' };
    });
    const dims = await getCachedDimensions(wanted);
    for (const e of events) {
      const [mt, id] = e.titleId.split(':');
      const d = dims.get(`${mt}-${id}`);
      if (d) e.dims = d;
    }
  } catch {
    /* enrichment is a bonus; never block the write on it */
  }

  await recordEvents(supabase, user.id, events, { sessionId: parsed.data.sessionId });
  return { ok: true, recorded: events.length };
}
