'use server';

/**
 * SAVING A QUICK TASTE QUIZ.
 *
 * Two writes, in order of importance:
 *
 *  1. THE DNA ITSELF — the answers become claims, the claims become a profile,
 *     and the profile is written into `preference_events`, the same append-only
 *     log every other surface writes to. There is exactly one model of the user.
 *  2. THE PROVENANCE — one row per answer in `taste_quiz_answers`, recording
 *     which question, which bank version, which response, which weights and
 *     which conditions produced which claims. This is what makes a DNA line
 *     explainable and a correction possible.
 *
 * The second write is best-effort by design. `taste_quiz_answers` arrives in
 * migration 0034, and a deployment that has not applied it yet must still be
 * able to take the quiz — losing the audit trail is bad, losing the user's
 * answers entirely is worse. The result says which of the two happened, so the
 * UI never claims more than actually occurred.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { recordEvents } from '@/lib/preference/store';
import { buildProfile } from '@/lib/taste/profile';
import { toPreferenceEvents } from '@/lib/taste/toPreference';
import { answersToClaims, provenanceFor, dnaState, type QuizAnswer } from '@/lib/taste/quickQuiz';

export interface SaveResult {
  ok: boolean;
  error?: string;
  /** How many preference events were accepted. */
  events?: number;
  /** False when the provenance table is not there yet. Never blocks the save. */
  provenanceStored?: boolean;
  coverage?: number;
  confidence?: number;
  label?: string;
}

const schema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(64),
        response: z.enum(['exactly', 'mostly', 'depends', 'not_me']),
        chips: z.array(z.string().min(1).max(64)).max(8).optional(),
        at: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(200),
});

export async function saveTasteQuiz(input: unknown): Promise<SaveResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Those answers did not look right.' };
  const answers = parsed.data.answers as QuizAnswer[];

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You need to be signed in to save this.' };

  const now = Date.now();
  const claims = answersToClaims(answers);
  const profile = buildProfile({ claims, now });
  const state = dnaState(answers);

  // A quiz that moved nothing is not an error, but it must not report a save.
  const events = toPreferenceEvents(profile, claims, { sessionId: `qtq:${now}`, now });
  const written = events.length > 0 ? await recordEvents(supabase, user.id, events) : 0;

  // Provenance. Best-effort: a missing table (42P01) is not a failure.
  let provenanceStored = false;
  const rows = provenanceFor(answers).map((p) => ({
    user_id: user.id,
    question_id: p.questionId,
    bank_version: p.bankVersion,
    section: p.section,
    question_type: p.questionType,
    response: p.response,
    response_weight: p.responseWeight,
    chips: p.chips,
    conditions: p.conditions,
    attributes: p.attributes,
    hard_exclusion: p.hardExclusion,
    confidence: p.confidence,
    durability: p.durability,
    revision: p.revision,
    claim_ids: p.claimIds,
    answered_at: new Date(p.at).toISOString(),
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from('taste_quiz_answers').insert(rows);
    if (!error) provenanceStored = true;
    else if (error.code !== '42P01') {
      console.warn('[taste-quiz] provenance write failed:', error.message);
    }
  }

  revalidatePath('/app/dna');
  revalidatePath('/app');

  return {
    ok: true,
    events: written,
    provenanceStored,
    coverage: state.coverage,
    confidence: state.confidence,
    label: state.label,
  };
}
