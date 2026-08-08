'use server';

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
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
 * PUBLIC: the interview is open to everyone. A SIGNED-IN user gets the full
 * persisted experience — `supabase.auth.getUser()` gives the `userId`, and the
 * PURE engine's state is loaded/saved through the fail-safe, RLS-scoped store so
 * one user's interview can never leak into another's. An ANONYMOUS visitor gets
 * an ephemeral, client-carried interview: the same PURE engine runs, but the
 * state travels with the client (`clientState`) and NOTHING is persisted. The
 * engine sanitizes its own input, so even garbage can never throw here. Nothing
 * throws to the client — failures come back as `{ ok: false, error }`.
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
// For anonymous visitors the client carries the interview state between turns
// (nothing is persisted). It is untrusted input, so it is only accepted as
// `unknown` here and the garbage-safe engine is what actually reads it.
const turnSchema = z.object({
  interviewId: interviewIdSchema,
  signals: z.array(signalSchema).max(MAX_SIGNALS),
  clientState: z.unknown().optional(),
});
const idOnlySchema = z.object({
  interviewId: interviewIdSchema,
  clientState: z.unknown().optional(),
});

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
  | { mode: 'user'; supabase: SupabaseClient; userId: string }
  | { mode: 'anon' };

/**
 * Identity resolution, run at the top of every action. Never throws and never
 * rejects: a signed-in user gets the persisted `user` mode; everyone else
 * (signed out, or auth unavailable) gets the ephemeral `anon` mode.
 */
async function gate(): Promise<Gate> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return { mode: 'user', supabase, userId: user.id };
  } catch {
    // fall through to anonymous
  }
  return { mode: 'anon' };
}

/** Coerce untrusted client-carried state to InterviewState. The engine is
 * garbage-safe, so this only narrows the type; a null means "nothing to run". */
function asClientState(v: unknown): InterviewState | null {
  return v && typeof v === 'object' ? (v as InterviewState) : null;
}

/**
 * Load the user's active interview or mint a fresh one, persist it, and return
 * the opening directive plus the mode the client should run in (realtime vs the
 * keyless fallback). Resuming is automatic: if an active row exists, we pick it
 * up exactly where it left off.
 */
export async function startOrResumeInterview(): Promise<StartResult> {
  const g = await gate();
  const mode = voiceInterviewMode();

  if (g.mode === 'user') {
    let state = await loadActiveInterview(g.supabase, g.userId);
    if (!state) {
      state = createInterview(g.userId, Date.now());
      await saveInterview(g.supabase, state);
    }
    return { ok: true, state, directive: decide(state), mode };
  }

  // Anonymous: an ephemeral interview carried by the client, never persisted.
  const state = createInterview('anon', Date.now());
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
  clientState?: InterviewState;
}): Promise<TurnResult> {
  const parsed = turnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid turn.' };

  const g = await gate();
  // Loosely-typed at the boundary; `advance` coerces each into a valid signal.
  const incoming = parsed.data.signals as unknown as TasteSignal[];

  if (g.mode === 'user') {
    const state = await getInterview(g.supabase, g.userId, parsed.data.interviewId);
    if (!state) return { ok: false, error: 'Interview not found.' };
    const next = advance(state, incoming, Date.now());
    await saveInterview(g.supabase, next);
    const directive = decide(next);
    return { ok: true, state: next, directive, done: directive.done };
  }

  // Anonymous: advance the client-carried state; nothing is persisted. The
  // engine is garbage-safe, but wrap it so a hostile state can never throw.
  const prior = asClientState(parsed.data.clientState);
  if (!prior) return { ok: false, error: 'Interview not found.' };
  try {
    const next = advance(prior, incoming, Date.now());
    const directive = decide(next);
    return { ok: true, state: next, directive, done: directive.done };
  } catch {
    return { ok: false, error: 'Could not process that turn.' };
  }
}

/**
 * Finish the interview: build the DNA reveal and write the named-title reactions
 * into the SAME append-only `preference_events` log the quiz writes (source
 * `voice_interview`), so there stays exactly one model of the user. Idempotent —
 * event ids are stable and `recordEvents` upserts ignore-duplicates, so
 * completing twice never double-writes, and the row is only re-marked complete
 * once.
 */
export async function completeInterview(input: {
  interviewId: string;
  clientState?: InterviewState;
}): Promise<CompleteResult> {
  const parsed = idOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };

  const g = await gate();

  if (g.mode === 'user') {
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

  // Anonymous: build the reveal from the client-carried state; no persistence.
  const prior = asClientState(parsed.data.clientState);
  if (!prior) return { ok: false, error: 'Interview not found.' };
  try {
    return { ok: true, reveal: buildDnaReveal(prior) };
  } catch {
    return { ok: false, error: 'Could not assemble your DNA.' };
  }
}

/** Abandon the interview (scoped to the owner). A no-op for anonymous visitors,
 * whose interviews were never persisted. */
export async function abandonInterview(input: { interviewId: string }): Promise<AbandonResult> {
  const parsed = idOnlySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };

  const g = await gate();
  if (g.mode === 'user') {
    await abandonInterviewRow(g.supabase, g.userId, parsed.data.interviewId);
  }
  return { ok: true };
}
