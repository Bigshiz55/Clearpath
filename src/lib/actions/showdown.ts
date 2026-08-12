'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { recordEvents } from '@/lib/preference/store';
import { getCachedDimensions } from '@/lib/titleDimensions';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { canonicalTitleId, mediaTypeFor } from '@/lib/showdown/mediaType';
import { gradeForDecision } from '@/lib/showdown/canonical';
import { reasonsFor } from '@/lib/showdown/reasons';
import { pairwiseEvents } from '@/lib/taste/crossing';
import { projectTraits } from '@/lib/taste/fingerprint';
import { writeCoverage, type WriteCoverage } from '@/lib/showdown/dimensionCoverage';

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
  /* `both` IS ACCEPTED HERE OR THE WHOLE SESSION IS REJECTED. The verdict has
     existed in the engine since the ledger split; the moment a control produces
     it, a schema that omits it fails `safeParse` and discards every decision in
     the run — not the one answer it did not recognise. */
  verdict: z.enum(['left', 'right', 'neither', 'both']),
  at: z.number().int().nonnegative(),
  responseMs: z.number().int().min(0).max(600_000),
  /** How cleanly the matchup isolated an axis — decides the attraction grade. */
  attribution: z.number().min(0).max(1),
  /** Reason chip id, when the player was asked why and answered. */
  reason: z.string().max(64).optional(),
  /** Stated appetite for the winner, when asked. Outranks the inferred grade. */
  intensity: z.enum(['must', 'keen', 'relative']).optional(),
});

const schema = z.object({
  /** Only `dna` may ever reach this action. */
  mode: z.literal('dna'),
  sessionId: z.string().max(64).optional(),
  decisions: z.array(decisionSchema).min(1).max(40),
});

export async function recordShowdownSession(
  input: z.infer<typeof schema>,
): Promise<{
  ok: boolean;
  recorded?: number;
  error?: string;
  /** What the ranker can actually act on. See lib/showdown/dimensionCoverage.ts. */
  coverage?: WriteCoverage;
}> {
  const parsed = schema.safeParse(input);
  // A `tonight` payload fails `z.literal('dna')` here and is refused with the
  // same message as malformed input — there is no branch that accepts it.
  if (!parsed.success) return { ok: false, error: 'Invalid session.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  /* THE CROSSING IS AXIS-LEVEL, NOT TITLE-LEVEL — see `lib/taste/crossing.ts`.
     It used to send one positive event carrying the WINNER'S WHOLE FINGERPRINT,
     which re-asserted every axis the two films shared (the choice said nothing
     about those) and recorded nothing at all about axes only the LOSER carried.
     Measured consequence: someone who systematically avoids sentimental films
     never picks one, so `sentimentality` stayed at exactly 50 with zero evidence
     across 321 events. A comparative vector fixes both directions. */
  const refFor = (titleId: string, at: number) => {
    const t = TITLES.find((x) => x.id === titleId);
    const canonical = canonicalTitleId(titleId);
    if (!t || !canonical) return null;
    return {
      titleId: canonical,
      fingerprint: projectTraits(
        { tmdbId: t.tmdbId, mediaType: mediaTypeFor(titleId), title: t.title, year: t.year },
        t.traits,
        at,
      ),
    };
  };

  const events = parsed.data.decisions.flatMap((d) => {
    const left = refFor(d.leftId, d.at);
    const right = refFor(d.rightId, d.at);
    if (!left || !right) return [];
    /* The chip is re-derived from the recorded pair rather than trusted from the
       payload: the client sends a chip ID, and an ID that does not correspond to
       a real difference between these two titles is either a stale build or
       someone hand-editing a request. Either way it must not become a
       full-strength single-axis belief. */
    const wt = TITLES.find((x) => x.id === (d.verdict === 'left' ? d.leftId : d.rightId));
    const lt = TITLES.find((x) => x.id === (d.verdict === 'left' ? d.rightId : d.leftId));
    const chip =
      d.reason && wt && lt ? reasonsFor(wt, lt).find((c) => c.id === d.reason) : undefined;
    return pairwiseEvents({
      left,
      right,
      verdict: d.verdict,
      at: d.at,
      responseMs: d.responseMs,
      ...(chip ? { statedAxis: { key: chip.key, high: chip.high } } : {}),
      attractionGrade: gradeForDecision(d, d.attribution),
      source: 'showdown',
    });
  });
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
      /* THE CLASSIFIER NO LONGER OVERWRITES THE COMPARATIVE VECTOR. It used to
         replace `dims` wholesale, which would now discard the axis-level claim
         this decision actually made and put the title's absolute fingerprint
         back in its place — undoing the crossing at the last step. The legacy
         axes it knows about fill in around the comparative claim; the
         comparative claim wins where the two overlap, because it is a statement
         about the CHOICE and the other is a statement about the film. */
      if (d) e.dims = { ...d, ...e.dims };
    }
  } catch {
    /* enrichment is a bonus; never block the write on it */
  }

  await recordEvents(supabase, user.id, events, { sessionId: parsed.data.sessionId });

  /* REPORTED, NOT SWALLOWED. An event with no fingerprint records perfectly and
     then contributes nothing to ranking, so "recorded: 12" on its own is a
     number that can be entirely true and entirely misleading. The caller gets
     both figures and the offending titles; the server log carries it too,
     because the operator who has to run the backfill is not the person holding
     the return value. */
  const coverage = writeCoverage(events);
  if (coverage.withoutDims > 0) {
    console.warn(
      `[showdown] ${coverage.withoutDims}/${coverage.events} events have no fingerprint and cannot affect ranking. ` +
        `Run the classify backfill for: ${coverage.unfingerprinted.join(', ')}`,
    );
  }
  return { ok: true, recorded: events.length, coverage };
}
