'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { recordEvents } from '@/lib/preference/store';
import { QUICK_DNA_VERSION, TITLES_BY_ID } from '@/lib/voice/quickdna/definition';
import { replay, type QuickSignal } from '@/lib/voice/quickdna/run';
import { saveCalibrationRun } from '@/lib/voice/calibrationStore';

/**
 * QUICK DNA — persistence.
 *
 * Two writes, and the split matters.
 *
 * The RUN is stored verbatim — every answer with its timestamp, whether it was
 * spoken or tapped, the recogniser's confidence and the calibration version.
 * That provenance is the only thing that cannot be reconstructed later, and a
 * future model weighing this evidence will need to know that "8" came from a
 * noisy microphone rather than a fingertip.
 *
 * The MOVIE REACTIONS additionally become real preference events, because they
 * are exactly what that log is for: a named title and an opinion about it. They
 * go in at the ordinary strengths the engine already understands, so they sit
 * in the same evidence ladder as every other reaction rather than in a private
 * scoring universe. A PASS writes nothing — "haven't seen it" is not taste.
 *
 * Nothing is overwritten. Both writes are appends, and the event ids are stable
 * so completing twice cannot double-count.
 */

const signalSchema = z.object({
  kind: z.enum(['probe', 'title']),
  id: z.string().min(1).max(80),
  value: z.union([z.number().int().min(0).max(10), z.enum(['a', 'b', 'yes', 'no', 'pass'])]),
  strong: z.boolean().optional(),
  at: z.number(),
  method: z.enum(['voice', 'tap']),
  confidence: z.number().min(0).max(1).optional(),
  version: z.string().max(40),
});

const inputSchema = z.object({ signals: z.array(signalSchema).max(80) });

export interface SaveQuickDnaResult {
  ok: boolean;
  error?: string;
  /** How many movie reactions reached the shared preference log. */
  reactionsRecorded?: number;
}

export async function saveQuickDna(input: { signals: QuickSignal[] }): Promise<SaveQuickDnaResult> {
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

  const signals = parsed.data.signals as QuickSignal[];
  const completedAt = Date.now();
  const profile = replay(signals);

  // 1. The run, verbatim. Reuses the calibration row shape — same table, same
  //    RLS, no migration — with the version distinguishing the two designs.
  const stored = await saveCalibrationRun(supabase, {
    kind: 'calibration',
    version: QUICK_DNA_VERSION,
    userId,
    answers: signals.map((s) => ({
      itemId: s.id,
      value: typeof s.value === 'number' ? s.value : null,
      skipped: s.value === 'pass',
      at: s.at,
      method: s.method,
      ...(s.confidence === undefined ? {} : { confidence: s.confidence }),
      version: s.version,
    })),
    ratings: Object.fromEntries(
      signals.filter((s) => typeof s.value === 'number').map((s) => [s.id, s.value as number]),
    ),
    completedAt,
  });

  // 2. The movie reactions, into the shared preference log.
  const reactions = signals.filter(
    (s): s is QuickSignal & { value: 'yes' | 'no' } => s.kind === 'title' && (s.value === 'yes' || s.value === 'no'),
  );
  let recorded = 0;
  if (reactions.length > 0) {
    try {
      recorded = await recordEvents(
        supabase,
        userId,
        reactions.map((s) => {
          const title = TITLES_BY_ID.get(s.id);
          const liked = s.value === 'yes';
          return {
            id: `quickdna:${userId}:${s.id}`,
            titleId: title ? `movie:${title.tmdbId}` : `quickdna:${s.id}`,
            action: liked ? ('seen_liked' as const) : ('seen_disliked' as const),
            // "Loved it" is a stronger statement than "yes", and the engine
            // already models that difference — use it rather than inventing one.
            ...(s.strong ? { experienceGrade: (liked ? 'loved' : 'hated') as 'loved' | 'hated' } : {}),
            source: 'quick_dna',
          };
        }),
      );
    } catch {
      recorded = 0;
    }
  }

  void profile; // computed for validation; the client already renders it
  return stored
    ? { ok: true, reactionsRecorded: recorded }
    : { ok: true, reactionsRecorded: recorded, error: 'Saved partially — your profile is on screen.' };
}
