'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { recordEvents } from '@/lib/preference/store';
import { buildProfile } from '@/lib/voicedna/profile';
import { toPreferenceEvents, unresolvedTitles } from '@/lib/voicedna/toPreference';
import { saveSession, deleteSession, type StoredSession } from '@/lib/voicedna/store';
import type { Claim } from '@/lib/voicedna/types';

/**
 * The write path for Verd1ct Voice DNA.
 *
 * The interview itself runs entirely in the browser against the pure engine, so
 * nothing is stored until the user finishes the review — that is the product
 * promise, and keeping the server out of the middle is how it is kept rather
 * than merely stated.
 *
 * `applyVoiceDna` is the only function that can move an interview into Viewer
 * DNA, and it refuses any claim the user has not confirmed.
 */

const titleRef = z.object({
  titleId: z.string().max(64).nullable(),
  text: z.string().min(1).max(200),
  needsConfirmation: z.boolean(),
});

const condition = z.object({
  text: z.string().max(400),
  attributes: z.array(z.string().max(40)).max(12),
  mode: z.enum(['suspends', 'requires']),
});

const claimSchema = z.object({
  id: z.string().min(1).max(160),
  attribute: z.string().max(40).nullable(),
  polarity: z.union([z.literal(-1), z.literal(1)]),
  strength: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  durability: z.enum(['durable', 'temporary', 'unknown']),
  scope: z.enum(['general', 'exception', 'conditional']),
  condition: condition.optional(),
  title: titleRef.optional(),
  reaction: z
    .enum(['loved', 'liked', 'mixed', 'disliked', 'hated', 'abandoned', 'avoided', 'curious'])
    .optional(),
  source: z.enum(['typed_interview', 'voice_interview', 'quiz', 'import', 'behaviour', 'manual_edit']),
  quote: z.string().max(2000),
  at: z.number().int().min(0),
  contrasts: z.array(z.string().max(160)).max(20).optional(),
  reviewed: z.boolean().optional(),
});

const sessionSchema = z.object({
  id: z.string().uuid(),
  mode: z.enum(['quick', 'full']),
  stage: z.enum(['interview', 'review', 'applied']),
  inputMode: z.enum(['typed', 'voice']),
  asked: z.array(z.string().max(200)).max(120),
  answers: z
    .array(
      z.object({
        questionId: z.string().max(200),
        value: z.string().max(4000),
        at: z.number().int().min(0),
      }),
    )
    .max(120),
  claims: z.array(claimSchema).max(400),
  startedAt: z.number().int().min(0),
  appliedAt: z.number().int().min(0).optional(),
});

export type SaveResult = { ok: boolean; error?: string; persisted: boolean };

/** Persist an in-progress interview so it survives a refresh. Never applies it. */
export async function saveVoiceSession(input: z.infer<typeof sessionSchema>): Promise<SaveResult> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid session', persisted: false };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in', persisted: false };

  // A save can never be the thing that applies an interview.
  const session: StoredSession = {
    ...parsed.data,
    stage: parsed.data.stage === 'applied' ? 'review' : parsed.data.stage,
    claims: parsed.data.claims as Claim[],
  };
  delete session.appliedAt;

  const res = await saveSession(supabase, user.id, session);
  return { ok: res.ok, persisted: res.ok, ...(res.error ? { error: res.error } : {}) };
}

export interface ApplyResult {
  ok: boolean;
  error?: string;
  /** How many preference events were written. */
  written: number;
  /** Titles we could not resolve, so the UI can say what was left out. */
  unresolved: string[];
  persisted: boolean;
}

/**
 * Apply a reviewed interview to Viewer DNA.
 *
 * Refuses when any claim still carries an unconfirmed title — the same gate the
 * pure `canApply` enforces client-side, repeated here so the server does not
 * trust the client to have run it.
 */
export async function applyVoiceDna(input: z.infer<typeof sessionSchema>): Promise<ApplyResult> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid session', written: 0, unresolved: [], persisted: false };
  }

  const claims = parsed.data.claims as Claim[];
  const unconfirmed = claims.filter((c) => c.title?.needsConfirmation === true);
  if (unconfirmed.length > 0) {
    return {
      ok: false,
      error: 'Some titles have not been confirmed yet.',
      written: 0,
      unresolved: unconfirmed.map((c) => c.title?.text ?? ''),
      persisted: false,
    };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Not signed in', written: 0, unresolved: [], persisted: false };
  }

  const now = Date.now();
  const profile = buildProfile({ claims, now });
  const events = toPreferenceEvents(profile, claims, { sessionId: parsed.data.id, now });
  const written = events.length > 0 ? await recordEvents(supabase, user.id, events) : 0;

  const stored = await saveSession(supabase, user.id, {
    ...parsed.data,
    claims,
    stage: 'applied',
    appliedAt: now,
  });

  return {
    ok: true,
    written,
    unresolved: unresolvedTitles(claims),
    persisted: stored.ok,
    ...(stored.error ? { error: stored.error } : {}),
  };
}

/** Delete an interview and everything derived from it. */
export async function deleteVoiceSession(id: string): Promise<{ ok: boolean; error?: string }> {
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: 'Invalid id' };

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const res = await deleteSession(supabase, user.id, parsed.data);
  // The preference events the interview wrote are undone alongside it, so
  // "delete" means the recommender forgets it too, not just that the transcript
  // disappears from a settings screen.
  await supabase
    .from('preference_events')
    .update({ undone_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .like('id', `voice:${parsed.data}:%`);

  return res;
}
