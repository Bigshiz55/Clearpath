import 'server-only';
import type { SttVendor, TtsVendor, VoiceCandidate } from './providers/types';

/**
 * VOICE DNA INTERVIEW — server-only configuration & gating.
 *
 * Reads the interview's secrets and flag at REQUEST time (never at import/build
 * time, so `next build` works without keys), mirroring `src/lib/env.ts`. Secrets
 * are server-only and are never returned to the browser — only ephemeral,
 * scoped tokens are (see providers/types.ts). Presence is reported as a boolean,
 * never a value.
 *
 * Owner env vars (documented in docs/VOICE_DNA_INTERVIEW.md):
 *   DEEPGRAM_API_KEY          — streaming STT (server-only)
 *   ELEVENLABS_API_KEY        — streaming TTS (server-only)
 *   ELEVENLABS_VOICE_ID       — the chosen voice after the founder audition
 *   DNA_VOICE_INTERVIEW_ENABLED — "true" to enable globally (founders always on)
 */

const read = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

export const deepgramKey = (): string | undefined => read('DEEPGRAM_API_KEY');
export const elevenLabsKey = (): string | undefined => read('ELEVENLABS_API_KEY');
export const elevenLabsVoiceId = (): string | undefined => read('ELEVENLABS_VOICE_ID');

/** True when BOTH production speech vendors have keys (interview can run for real). */
export const hasVoiceKeys = (): boolean => Boolean(deepgramKey() && elevenLabsKey());

/** The configured STT vendor — Deepgram when keyed, else the local browser fallback. */
export const sttVendor = (): SttVendor => (deepgramKey() ? 'deepgram' : 'browser');
/** The configured TTS vendor — ElevenLabs when keyed, else the local browser fallback. */
export const ttsVendor = (): TtsVendor => (elevenLabsKey() ? 'elevenlabs' : 'browser');

const envFlagOn = (): boolean => (read('DNA_VOICE_INTERVIEW_ENABLED') ?? '').toLowerCase() === 'true';

/**
 * The interview is available when the env flag is on (global rollout) OR the
 * viewer is a founder (founder-first), mirroring the trailer rollout idiom. It
 * still degrades to the quick-tap fallback when no keys are configured, so
 * enabling the flag never dead-ends a user.
 */
export function dnaVoiceInterviewEnabled(opts: { isFounder?: boolean } = {}): boolean {
  return envFlagOn() || Boolean(opts.isFounder);
}

/**
 * The founder audition shortlist: the three strongest natural, female,
 * British/Australian-ish candidates to compare before committing a VOICE_ID.
 * The `voiceId` is intentionally read from env slots (empty until the audition
 * confirms the real vendor id) — we never hardcode an unverified vendor asset.
 * The audition page lists the vendor's real voice library at runtime with a key.
 */
export function auditionCandidates(): VoiceCandidate[] {
  return [
    {
      vendor: 'elevenlabs',
      voiceId: read('VOICE_AUDITION_ID_1') ?? '',
      name: 'Alice',
      description: 'Female · British · warm, confident, relaxed',
    },
    {
      vendor: 'elevenlabs',
      voiceId: read('VOICE_AUDITION_ID_2') ?? '',
      name: 'Matilda',
      description: 'Female · Australian-leaning · natural, modern',
    },
    {
      vendor: 'elevenlabs',
      voiceId: read('VOICE_AUDITION_ID_3') ?? '',
      name: 'Jessica',
      description: 'Female · British/international · cool, easy to understand',
    },
  ];
}

/** Health snapshot for founder diagnostics — booleans + vendor names, no secrets. */
export function voiceHealth() {
  return {
    sttVendor: sttVendor(),
    ttsVendor: ttsVendor(),
    deepgramConfigured: Boolean(deepgramKey()),
    elevenLabsConfigured: Boolean(elevenLabsKey()),
    voiceIdConfigured: Boolean(elevenLabsVoiceId()),
    enabledGlobally: envFlagOn(),
  };
}
