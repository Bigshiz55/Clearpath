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
 * THE KEY IS THE SWITCH. This used to demand BOTH a key and an explicit
 * `VOICE_INTERVIEW_ENABLED=1`, on the theory that an incidental platform key
 * should not start spending on live voice. Under the current architecture the
 * spoken interview IS the product, so requiring a second opt-in only produced a
 * deployment that had every ingredient for real speech and silently served the
 * degraded browser-speech path instead. A configured `OPENAI_API_KEY` now means
 * Realtime, full stop.
 *
 * `VOICE_INTERVIEW_ENABLED` survives ONLY as an explicit OFF switch (`0` /
 * `false` / `off`), so voice can still be killed on a deployment without pulling
 * the key that the rest of the app shares.
 */

/** A sensible current Realtime model; overridable via VOICE_INTERVIEW_MODEL. */
export const DEFAULT_REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

/** A warm default voice; overridable via VOICE_INTERVIEW_VOICE. */
export const DEFAULT_REALTIME_VOICE = 'sage';

/** The OpenAI key (shared with the rest of the app). May be undefined. */
export function openAiKey(): string | undefined {
  return serverEnv.openaiKey();
}

/**
 * True unless the owner has explicitly switched voice OFF. Absent means ON —
 * the key alone decides whether Realtime is possible.
 */
export function voiceInterviewEnabled(): boolean {
  const raw = (process.env.VOICE_INTERVIEW_ENABLED ?? '').trim().toLowerCase();
  if (raw === '') return true;
  return !(raw === '0' || raw === 'false' || raw === 'off' || raw === 'no');
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
 *   'realtime' — a key is present and voice has not been switched off → mint an
 *                OpenAI Realtime ephemeral session for the browser WebRTC client.
 *   'fallback' — no key, or explicitly disabled → the keyless browser-speech
 *                path. NEVER throws; absence of a key is a normal state, not an
 *                error.
 */
export function voiceInterviewMode(): VoiceInterviewMode {
  return openAiKey() && voiceInterviewEnabled() ? 'realtime' : 'fallback';
}
