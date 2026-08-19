'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { loadPreference, recordEvents } from '@/lib/preference/store';
import { PAYOFF_TOP, measurePayoff } from '@/lib/showdown/payoffPool';
import { getCachedDimensions } from '@/lib/titleDimensions';
import { fingerprintKey } from '@/lib/taste/fingerprint';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { canonicalTitleId, mediaTypeFor } from '@/lib/showdown/mediaType';
import { resolveCatalogue } from '@/lib/showdown/catalogueResolver';
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

/**
 * What the session did to the player's REAL recommendations.
 *
 * Deliberately small: positions and titles, not the whole ranked pool. The
 * screen shows five rows and a movement figure; shipping sixty candidates to
 * the client so it can slice five is bandwidth spent on nothing.
 *
 * `measured: false` is a real, expected answer — a guest, an unavailable TMDB,
 * or a catalogue with no cached fingerprints. It is NOT the same as
 * `movement: 0`, which means we measured and the session genuinely did not
 * cross the ranker's confidence floor. The results screen says something
 * different for each, because they are different facts.
 */
export interface PayoffRow {
  id: string;
  title: string;
  year: number | null;
  was: number;
  now: number;
  moved: number;
}
export interface ShowdownPayoff {
  measured: boolean;
  /** Total absolute places moved across the whole pool. 0 = nothing changed. */
  movement: number;
  /** The top of the list as it now stands. */
  top: PayoffRow[];
  /** Titles this session lifted INTO the visible top. */
  climbed: PayoffRow[];
}

export async function recordShowdownSession(
  input: z.infer<typeof schema>,
): Promise<{
  ok: boolean;
  recorded?: number;
  error?: string;
  /** What the ranker can actually act on. See lib/showdown/dimensionCoverage.ts. */
  coverage?: WriteCoverage;
  /** What moved in the real recommendation pool. See lib/showdown/payoffPool.ts. */
  payoff?: ShowdownPayoff;
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
  /* EVIDENCE USES THE VERIFIED ID, NOT THE HAND-AUTHORED ONE.
     Fixing only the artwork would have left the damaging half of the bug in
     place: a mis-attributed poster is embarrassing for one screen, but evidence
     filed against the wrong canonical title is permanent, invisible, and
     silently teaches the engine about a film the player never saw. The same
     resolver the catalogue endpoint uses answers both, so the two can never
     disagree about which record a title is. */
  let verified: Record<string, string> = {};
  try {
    verified = (await resolveCatalogue()).canonicalIds;
  } catch {
    /* Checker unavailable — fall back to the recorded id below. That is the
       pre-existing behaviour, and it is strictly better than dropping the
       session on the floor when TMDB is down. */
  }

  const refFor = (titleId: string, at: number) => {
    const t = TITLES.find((x) => x.id === titleId);
    const canonical = verified[titleId] ?? canonicalTitleId(titleId);
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
    /* Indexed against `wanted`, which already parsed each `titleId` — the loop
       used to re-split it and hand the two halves straight into a template
       literal, so a malformed id stringified to "undefined-NaN" and missed
       silently. The typed key will not accept that. */
    events.forEach((e, idx) => {
      const w = wanted[idx]!;
      const d = dims.get(fingerprintKey({ mediaType: w.media_type, tmdbId: w.tmdb_id }));
      /* THE CLASSIFIER NO LONGER OVERWRITES THE COMPARATIVE VECTOR. It used to
         replace `dims` wholesale, which would now discard the axis-level claim
         this decision actually made and put the title's absolute fingerprint
         back in its place — undoing the crossing at the last step. The legacy
         axes it knows about fill in around the comparative claim; the
         comparative claim wins where the two overlap, because it is a statement
         about the CHOICE and the other is a statement about the film. */
      if (d) e.dims = { ...d, ...e.dims };
    });
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
  /* THE PAYOFF, AND IT RUNS AFTER THE WRITE ON PURPOSE.
     The write is the thing that matters and it has already happened; measuring
     what it did is a bonus that must never be able to lose it. Every failure
     mode below — no TMDB key, upstream down, no cached fingerprints — returns
     `measured: false` and the screen has a state for that.

     ONE READ, FOLDED TWICE. `before` is this same log with this session's rows
     removed rather than a snapshot taken before the insert, so a write landing
     from another device in between cannot be credited to this session. */
  let payoff: ShowdownPayoff | undefined;
  try {
    const { events: all, now } = await loadPreference(supabase, user.id);
    const measured = await measurePayoff({
      events: all,
      writtenIds: events.map((e) => e.id),
      now,
    });
    if (measured) {
      const row = (c: { id: string; title: string; year: number | null; was: number; now: number; moved: number }) => ({
        id: c.id,
        title: c.title,
        year: c.year,
        was: c.was,
        now: c.now,
        moved: c.moved,
      });
      payoff = {
        measured: true,
        movement: measured.movement,
        top: measured.after.slice(0, PAYOFF_TOP).map(row),
        climbed: measured.climbed.map(row),
      };
    }
  } catch {
    /* Unmeasurable is reported as unmeasurable, never as "nothing moved". */
  }

  return { ok: true, recorded: events.length, coverage, payoff };
}
