/**
 * VOICE PROVIDER BOUNDARY — provider-neutral STT/TTS interfaces.
 *
 * Speech-to-text and text-to-speech are behind these interfaces so the initial
 * vendors (Deepgram STT, ElevenLabs TTS) can be swapped without touching product
 * code. The heavy streaming runs BROWSER ↔ VENDOR directly (Vercel serverless
 * cannot hold a long-lived audio socket), so the server side's job is only to
 * mint a short-lived, scoped token — never to proxy audio. That keeps the
 * long-term secret server-only and out of the browser bundle.
 *
 * Nothing here imports a vendor SDK; concrete adapters live beside this file and
 * are the ONLY modules allowed to know a vendor's name.
 */

/** Which concrete vendor is configured (for telemetry + audition, never secrets). */
export type SttVendor = 'deepgram' | 'browser';
export type TtsVendor = 'elevenlabs' | 'browser';

/**
 * A short-lived credential the server mints for the browser to open a direct
 * vendor stream. It carries NO long-term secret — it is scoped and expiring.
 */
export interface EphemeralVoiceToken {
  vendor: SttVendor | TtsVendor;
  /** The scoped, expiring token the browser presents to the vendor. */
  token: string;
  /** Unix ms when the token expires; the client refreshes before this. */
  expiresAt: number;
  /** Vendor endpoint the browser connects to (ws/https), already region-pinned. */
  endpoint: string;
}

/** Server side: mint ephemeral tokens. Returns null when unconfigured (no key). */
export interface VoiceTokenMinter {
  readonly sttVendor: SttVendor;
  readonly ttsVendor: TtsVendor;
  mintStt(): Promise<EphemeralVoiceToken | null>;
  mintTts(): Promise<EphemeralVoiceToken | null>;
}

// ── Browser-side streaming interfaces (implemented by the client adapters) ────

/** Two INDEPENDENT signals — a moving mic meter is NOT proof of transcription. */
export interface SttStreamEvents {
  /** Mic input level 0..1, purely for the "is it hearing me" affordance. */
  onAudioLevel?: (level: number) => void;
  /** Interim (lighter-colour) transcript — may change. */
  onPartial?: (text: string) => void;
  /** Final transcript for the utterance, with a vendor confidence 0..1. */
  onFinal?: (text: string, confidence: number) => void;
  /** Voice-activity edges for barge-in / end-of-turn detection. */
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  /** Transport failure (dropped packets, socket close) — caller may reconnect. */
  onError?: (err: { code: string; message: string }) => void;
}

export interface SttStream {
  readonly vendor: SttVendor;
  /** Begin streaming mic audio. Resolves once the socket is open. */
  start(events: SttStreamEvents): Promise<void>;
  /** Stop and release the mic + socket. Idempotent. */
  stop(): Promise<void>;
  /** True while the socket is open and receiving. */
  readonly active: boolean;
}

export interface TtsPlayback {
  readonly vendor: TtsVendor;
  /** Speak text with the configured voice; resolves when playback completes. */
  speak(text: string, opts?: { voiceId?: string }): Promise<void>;
  /** Barge-in: stop playback immediately so the user can answer over the prompt. */
  cancel(): void;
  readonly speaking: boolean;
}

/** A candidate voice for the founder audition (no secret; display metadata only). */
export interface VoiceCandidate {
  vendor: TtsVendor;
  voiceId: string;
  name: string;
  /** Short human description, e.g. "Female · British · warm, relaxed". */
  description: string;
}
