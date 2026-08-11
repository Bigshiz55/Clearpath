'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { recordEvents } from '@/lib/preference/store';
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import { toPreferenceEvents, type Verdict } from '@/lib/showdown/verdict';
import type { ShowdownTitle } from '@/lib/showdown/matchup';

/**
 * The ONE write path out of the Showdown, into the real engine.
 *
 * It does not get a store of its own. It builds canonical `preference_events`
 * through the pure bridge in `showdown/verdict.ts` and hands them to the same
 * `recordEvents` every other surface uses, so a Showdown answer and a Watch-DNA
 * card answer are the same kind of fact about the same single model of the user.
 *
 * Idempotent on the event id (which is derived from session + round + verdict,
 * never from a counter), so a double tap or a retried request writes once.
 * Fail-soft: a write problem never throws into the game.
 */

const dimsSchema = z.record(z.string(), z.number().min(0).max(100));

const titleSchema = z.object({
  key: z.string().regex(/^(movie|tv):\d+$/),
  title: z.string().min(1).max(300),
  year: z.number().int().nullable(),
  posterPath: z.string().max(300).nullable(),
  mediaType: z.enum(['movie', 'tv']),
  dims: dimsSchema,
});

const schema = z.object({
  sessionId: z.string().min(4).max(64),
  roundId: z.string().min(1).max(64),
  left: titleSchema,
  right: titleSchema,
  verdict: z.enum(['left', 'right', 'neither', 'unseen']),
  kind: z.enum(['pair', 'twist']),
  testing: z.array(z.string()).max(6),
  dwellMs: z.number().int().min(0).max(600_000).optional(),
  /** Founder test-session scoping, when played inside a test session. */
  testSessionId: z.string().max(64).optional(),
});

export type ShowdownAnswerInput = z.infer<typeof schema>;

/** Keep only axes the canonical model actually has. */
function cleanDims(d: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of DIMENSION_KEYS) {
    const v = d[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export async function recordShowdownVerdict(
  input: ShowdownAnswerInput,
): Promise<{ ok: boolean; written: number; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, written: 0, error: 'Invalid verdict.' };
  const a = parsed.data;

  /*
   * FAIL SOFT, ALWAYS.
   *
   * A server action that throws becomes a 500 in the browser, and this one is
   * called on every tap — so an unconfigured environment, an expired session or
   * a transient Supabase problem would turn a working game into a screen full
   * of errors. The write is the important part, but it is not more important
   * than the round in front of the player: the game continues either way, and
   * an answer that could not be persisted is reported, not thrown.
   */
  let supabase: ReturnType<typeof createClient>;
  try {
    supabase = createClient();
  } catch {
    return { ok: false, written: 0, error: 'Taste DNA is unavailable right now.' };
  }

  let userId: string | undefined;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id;
  } catch {
    return { ok: false, written: 0, error: 'Taste DNA is unavailable right now.' };
  }
  if (!userId) return { ok: false, written: 0, error: 'Not signed in.' };

  const asTitle = (t: z.infer<typeof titleSchema>): ShowdownTitle => ({ ...t, dims: cleanDims(t.dims) });

  // The rules about what each answer may mean live in the pure bridge, not
  // here — so they are testable without a database, and this function has no
  // opportunity to disagree with them.
  const drafts = toPreferenceEvents({
    left: asTitle(a.left),
    right: asTitle(a.right),
    verdict: a.verdict as Verdict,
    kind: a.kind,
    testing: a.testing,
    sessionId: a.sessionId,
    roundId: a.roundId,
    at: Date.now(),
    ...(a.dwellMs !== undefined ? { dwellMs: a.dwellMs } : {}),
  });

  // "Haven't seen it" legitimately produces nothing. That is a successful
  // answer, not a failed write.
  if (drafts.length === 0) return { ok: true, written: 0 };

  try {
    const written = await recordEvents(supabase, userId, drafts, {
      ...(a.testSessionId ? { sessionId: a.testSessionId } : {}),
    });
    return { ok: true, written };
  } catch {
    // `recordEvents` already swallows its own errors; this covers the layer
    // beneath it, so there is no path from a database problem to a 500.
    return { ok: false, written: 0, error: 'Could not save that answer.' };
  }
}
