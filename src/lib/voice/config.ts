import 'server-only';
import { serverEnv } from '@/lib/env';

/**
 * VOICE INTERVIEW — runtime gating + env accessors (server-only).
 *
 * Every value here is read at REQUEST time, never at import/build time, so
 * `next build` succeeds with no secrets set (see src/lib/env.ts for the same
 * discipline). Nothing throws when a key is absent: the whole feature is
 * designed to degrade to a keyless browser-speech fallback, and this module is
 * the one place that decides which mode we are in.
 *
 * The feature is deliberately double-gated: it needs BOTH an OpenAI key AND an
 * explicit `VOICE_INTERVIEW_ENABLED=1` opt-in before the Realtime path turns
 * on, so an incidental key on the platform can never silently start spending on
 * live voice sessions.
 */

/** A sensible current Realtime model; overridable via VOICE_INTERVIEW_MODEL. */
export const DEFAULT_REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

/** A warm default voice; overridable via VOICE_INTERVIEW_VOICE. */
export const DEFAULT_REALTIME_VOICE = 'sage';

/** The OpenAI key (shared with the rest of the app). May be undefined. */
export function openAiKey(): string | undefined {
  return serverEnv.openaiKey();
}

/** True only when the owner has explicitly opted the feature in. */
export function voiceInterviewEnabled(): boolean {
  return (process.env.VOICE_INTERVIEW_ENABLED ?? '').trim() === '1';
}

/** The Realtime model id, env-overridable, with a safe default. */
export function realtimeModel(): string {
  const v = (process.env.VOICE_INTERVIEW_MODEL ?? '').trim();
  return v || DEFAULT_REALTIME_MODEL;
}

/** The Realtime voice id, env-overridable, with a warm default. */
export function realtimeVoice(): string {
  const v = (process.env.VOICE_INTERVIEW_VOICE ?? '').trim();
  return v || DEFAULT_REALTIME_VOICE;
}

export type VoiceInterviewMode = 'realtime' | 'fallback';

/**
 * The mode the whole feature runs in this request:
 *   'realtime' — a key is present AND the feature is enabled → mint an OpenAI
 *                Realtime ephemeral session for the browser WebRTC client.
 *   'fallback' — anything else (no key, disabled) → the keyless browser-speech
 *                path. NEVER throws; absence of a key is a normal state, not an
 *                error.
 */
export function voiceInterviewMode(): VoiceInterviewMode {
  return voiceInterviewEnabled() && openAiKey() ? 'realtime' : 'fallback';
}
