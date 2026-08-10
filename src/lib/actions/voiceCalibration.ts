'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { loadPreference, recordEvents } from '@/lib/preference/store';
import { CALIBRATION_ITEM_IDS, CALIBRATION_VERSION } from '@/lib/voice/calibration/items';
import {
  ambiguityQuestions,
  followupOutcome,
  type AmbiguityQuestion,
} from '@/lib/voice/calibration/ambiguity';
import { applyCalibrationPriors } from '@/lib/voice/calibration/priors';
import type { CalibrationAnswer } from '@/lib/voice/calibration/machine';
import { saveCalibrationRun, type StoredCalibration } from '@/lib/voice/calibrationStore';

/**
 * 60-SECOND VOICE DNA — persistence and the follow-up shortlist.
 *
 * Two jobs, both cheap. Store the run VERBATIM — every rating with its
 * timestamp, whether it was spoken or tapped, how confident the recogniser was,
 * and which version of the calibration asked — because that provenance is what
 * lets a later model weigh this evidence properly, and it cannot be recovered
 * once it is thrown away. Then hand back at most two questions worth asking.
 *
 * NOTHING IS OVERWRITTEN. The run is appended as its own row; existing Taste
 * DNA evidence is untouched, and the ratings are folded in as small-weight
 * priors (see `priors.ts`) that shift beliefs without being able to overrule an
 * explicit reaction to a title.
 *
 * No LLM: the follow-up shortlist is a deterministic rule table, so this stays
 * off the forbidden "model call in a request path" list and is testable.
 */

const answerSchema = z.object({
  itemId: z.enum(CALIBRATION_ITEM_IDS as [string, ...string[]]),
  value: z.number().int().min(0).max(10).nullable(),
  skipped: z.boolean(),
  at: z.number(),
  method: z.enum(['voice', 'tap']),
  confidence: z.number().min(0).max(1).optional(),
  version: z.string().max(40),
});

const inputSchema = z.object({
  answers: z.array(answerSchema).max(CALIBRATION_ITEM_IDS.length),
});

export interface SaveCalibrationResult {
  ok: boolean;
  error?: string;
  /** At most two, already ordered by value. */
  questions?: AmbiguityQuestion[];
}

export async function saveCalibration(input: {
  answers: CalibrationAnswer[];
}): Promise<SaveCalibrationResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Those answers did not look right.' };

  let supabase;
  let userId: string;
  try {
    supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'You need a session to save this.' };
    userId = user.id;
  } catch {
    return { ok: false, error: 'Could not verify your session.' };
  }

  const answers = parsed.data.answers as CalibrationAnswer[];
  const ratings: Record<string, number> = {};
  for (const a of answers) {
    if (!a.skipped && a.value !== null) ratings[a.itemId] = a.value;
  }

  const record: StoredCalibration = {
    kind: 'calibration',
    version: CALIBRATION_VERSION,
    userId,
    answers,
    ratings,
    completedAt: Date.now(),
  };

  // A failed write must not lose the reveal the user is already looking at —
  // the store never throws, and the summary renders from client state either way.
  const saved = await saveCalibrationRun(supabase, record);

  // The follow-ups need what we already believed. A read failure here is not
  // worth surfacing: no DNA simply means fewer questions can fire.
  let questions: AmbiguityQuestion[] = [];
  try {
    const pref = await loadPreference(supabase, userId);
    questions = ambiguityQuestions(ratings, applyCalibrationPriors(pref.dna, ratings));
  } catch {
    questions = ambiguityQuestions(ratings, null);
  }

  return saved
    ? { ok: true, questions }
    : { ok: true, questions, error: 'Saved locally — we could not reach your profile just now.' };
}

/**
 * Record an answer to one of the follow-up questions.
 *
 * These are the only DELIBERATE statements in the whole flow — the user was
 * asked a direct either/or and chose — so their dimension outcomes are written
 * as `corrections`, which the engine treats as explicit overrides rather than
 * as another piece of accumulated evidence. That is the correct weight for
 * "psychological killers: good", and it is why there are at most two of them.
 *
 * Idempotent: the event id is derived from the question and the answer, so a
 * double-tap or a retry cannot write the same statement twice.
 */
export async function recordCalibrationFollowup(input: {
  questionId: string;
  positive: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = z
    .object({ questionId: z.string().min(1).max(80), positive: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid answer.' };

  let supabase;
  let userId: string;
  try {
    supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'You need a session to save this.' };
    userId = user.id;
  } catch {
    return { ok: false, error: 'Could not verify your session.' };
  }

  // Rebuild the question from its id rather than trusting the client to send
  // back an outcome — the rule table is the authority on what an answer means.
  const outcome = followupOutcome(parsed.data.questionId, parsed.data.positive);
  if (!outcome) return { ok: true }; // unknown id: nothing to write, not an error
  if (!outcome.dims || outcome.dims.length === 0) return { ok: true };

  try {
    await recordEvents(supabase, userId, [
      {
        id: `calfollowup:${userId}:${parsed.data.questionId}:${parsed.data.positive ? 'y' : 'n'}`,
        titleId: `calibration:${parsed.data.questionId}`,
        // `skip` is the only PrimaryAction that resolves to NO signal, so this
        // row moves no beliefs of its own — it is a pure carrier and the
        // `corrections` below are its entire effect. Any other action would
        // smuggle a like or a dislike in alongside the statement.
        action: 'skip',
        corrections: outcome.dims,
        source: 'voice_calibration',
      },
    ]);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not save that answer.' };
  }
}
