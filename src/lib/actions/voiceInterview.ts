'use server';

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isFounderOrAdminEmail } from '@/lib/admin';
import { recordEvents } from '@/lib/preference/store';
import {
  advance,
  decide,
  createInterview,
  buildDnaReveal,
  signalsToPreferenceEvents,
  type InterviewState,
  type Directive,
  type DnaReveal,
  type TasteSignal,
} from '@/lib/voice/interview';
import {
  loadActiveInterview,
  saveInterview,
  getInterview,
  abandonInterview as abandonInterviewRow,
} from '@/lib/voice/store';
import { voiceInterviewMode, type VoiceInterviewMode } from '@/lib/voice/config';

/**
 * VOICE INTERVIEW — server actions (the SERVER + PERSISTENCE surface).
 *
 * Every action re-verifies identity with `supabase.auth.getUser()` and the
 * founder gate (this is founder-only for now), then drives the PURE engine
 * (`decide` / `advance` / `buildDnaReveal`) and persists through the fail-safe
 * store. The engine sanitizes its own input, so even garbage a live model emits
 * can never throw here; RLS plus an explicit `userId` scope on every read/write
 * means one user's interview can never leak into another's. Nothing throws to
 * the client — failures come back as `{ ok: false, error }`.
 */

// A single signal, loosely validated at the boundary. The engine's `advance`
// re-sanitizes every field (coerces kind/sentiment, clamps strength, drops
// junk), so this only bounds sizes and array length to keep a hostile client
// from sending something enormous — it does not need to be exhaustive.
const MAX_SIGNALS = 24;
const signalSchema = z
  .object({
    id: z.string().max(200).optional(),
    turn: z.number().optional(),
    kind: z.string().max(40).optional(),
    subject: z.string().max(400).optional(),
    sentiment: z.string().max(20).optional(),
    strength: z.number().optional(),
    categories: z.array(z.string().max(60)).max(64).optional(),
    reason: z.string().max(2000).optional(),
    raw: z.string().max(4000).optional(),
  })
  .passthrough();

const interviewIdSchema = z.string().min(1).max(200);
const turnSchema = z.object({
  interviewId: interviewIdSchema,
  signals: z.array(signalSchema).max(MAX_SIGNALS),
});
const idOnlySchema = z.object({ interviewId: interviewIdSchema });

export interface StartResult {
  ok: boolean;
  error?: string;
  state?: InterviewState;
  directive?: Directive;
  mode?: VoiceInterviewMode;
}
export interface TurnResult {
  ok: boolean;
  error?: string;
  state?: InterviewState;
  directive?: Directive;
  done?: boolean;
}
export interface CompleteResult {
  ok: boolean;
  error?: string;
  reveal?: DnaReveal;
}
export interface AbandonResult {
  ok: boolean;
  error?: string;
}

type Gate =
  | { ok: true; supabase: SupabaseClient; userId: string }
  | { ok: false; error: string };

/** Auth + founder gate, run at the top of every action. Never throws. */
async function gate(): Promise<Gate> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'You need to be signed in.' };
    if (!isFounderOrAdminEmail(user.email)) return { ok: false, error: 'This feature is not available yet.' };
    return { ok: true, supabase, userId: user.id };
  } catch {
    return { ok: false, error: 'Could not verify your session.' };
  }
}

/**
 * Load the user's active interview or mint a fresh one, persist it, and return
 * the opening directive plus the mode the client should run in (realtime vs the
 * keyless fallback). Resuming is automatic: if an active row exists, we pick it
 * up exactly where it left off.
 */
export async function startOrResumeInterview(): Promise<StartResult> {
  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };

  const mode = voiceInterviewMode();
  let state = await loadActiveInterview(g.supabase, g.userId);
  if (!state) {
    state = createInterview(g.userId, Date.now());
    await saveInterview(g.supabase, state);
  }
  return { ok: true, state, directive: decide(state), mode };
}

/**
 * The per-turn reducer the client calls after each user utterance: fold the
 * turn's signals into the state, persist, and return the next directive plus
 * whether the interview is done. The signals originate from the Realtime model's
 * `record_signal` tool (or the fallback interpreter); the engine sanitizes them.
 */
export async function recordInterviewTurn(input: {
  interviewId: string;
  signals: TasteSignal[];
}): Promise<TurnResult> {
  const parsed = turnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid turn.' };

  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };

  const state = await getInterview(g.supabase, g.userId, parsed.data.interviewId);
  if (!state) return { ok: false, error: 'Interview not found.' };

  // Loosely-typed at the boundary; `advance` coerces each into a valid signal.
  const incoming = parsed.data.signals as unknown as TasteSignal[];
  const next = advance(state, incoming, Date.now());
  await saveInterview(g.supabase, next);

  const directive = decide(next);
  return { ok: true, state: next, directive, done: directive.done };
}

/**
 * Finish the interview: build the DNA reveal and write the named-title reactions
 * into the SAME append-only `preference_events` log the quiz writes (source
 * `voice_interview`), so there stays exactly one model of the user. Idempotent —
 * event ids are stable and `recordEvents` upserts ignore-duplicates, so
 * completing twice never double-writes, and the row is only re-marked complete
 * once.
 */
export async function completeInterview(input: { interviewId: string }): Promise<CompleteResult> {
  const parsed = idOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };

  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };

  const state = await getInterview(g.supabase, g.userId, parsed.data.interviewId);
  if (!state) return { ok: false, error: 'Interview not found.' };

  const reveal = buildDnaReveal(state);

  // Persist the taste into the shared preference log. Dedup is by stable event
  // id at the DB layer, so this is safe to run again on a re-complete.
  const drafts = signalsToPreferenceEvents(state.signals);
  if (drafts.length > 0) {
    await recordEvents(g.supabase, g.userId, drafts);
  }

  if (state.status !== 'complete') {
    await saveInterview(g.supabase, {
      ...state,
      status: 'complete',
      phase: 'complete',
      updatedAtMs: Date.now(),
    });
  }

  return { ok: true, reveal };
}

/** Abandon the interview (scoped to the owner). */
export async function abandonInterview(input: { interviewId: string }): Promise<AbandonResult> {
  const parsed = idOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };

  const g = await gate();
  if (!g.ok) return { ok: false, error: g.error };

  await abandonInterviewRow(g.supabase, g.userId, parsed.data.interviewId);
  return { ok: true };
}
