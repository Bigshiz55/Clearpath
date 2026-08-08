/**
 * VOICE INTERVIEW — the client transport contract.
 *
 * The two browser transports (the OpenAI Realtime WebRTC client and the keyless
 * Web-Speech fallback) speak to the React layer through EXACTLY this one
 * interface, so `VoiceInterview.tsx` never branches on which one it is holding:
 * it wires the same callbacks and calls the same `steer()` / `disconnect()` on
 * either. Pure types — no browser globals — so this module is safe to import
 * anywhere, including SSR and tests.
 */
import type { TasteSignal } from '@/lib/voice/interview';

/** How the interviewer's audio is being produced this session. */
export type VoiceTransport = 'realtime' | 'fallback' | 'text';

/**
 * The events a transport pushes up to React. Every field is optional so a
 * transport can implement only what it can honestly deliver (the fallback has
 * no streaming token deltas, for instance).
 */
export interface VoiceClientCallbacks {
  /** Streaming interviewer caption — accumulate these into the current line. */
  onTranscriptDelta?: (delta: string) => void;
  /** The interviewer finished a line; `text` is the whole line. */
  onInterviewerDone?: (text: string) => void;
  /** The user's completed utterance, transcribed. */
  onUserTranscript?: (text: string) => void;
  /** A structured taste observation the interviewer extracted. */
  onSignal?: (signal: TasteSignal) => void;
  /** Mic input level, 0..1, for the waveform. */
  onAudioLevel?: (level: number) => void;
  /** True while the interviewer is speaking (for the "speaking" state). */
  onSpeakingChange?: (speaking: boolean) => void;
  /** A non-fatal or fatal error — the caller decides whether to fall back. */
  onError?: (error: Error) => void;
  /** The transport is live and ready to be steered. */
  onOpen?: () => void;
  /** The transport closed (network drop, remote hang-up, or `disconnect()`). */
  onClose?: () => void;
}

/**
 * One turn's steering, compiled from the engine's `Directive` by the caller.
 * `instruction` is the model-facing per-turn directive (`buildTurnInstruction`);
 * `speakLine` is the human line the keyless fallback voices out loud. A
 * transport uses whichever it can honour and ignores the rest.
 */
export interface SteerInput {
  /** The compiled per-turn instruction for the Realtime model. */
  instruction: string;
  /** A ready-to-voice line (the fallback speaks this; realtime rephrases). */
  speakLine?: string;
  /** True when this is the opening turn and the interviewer should speak first. */
  kickoff?: boolean;
  /** True when the interview is complete — the transport should stop soliciting. */
  done?: boolean;
}

/** The handle every transport returns. React only ever holds this. */
export interface VoiceClient {
  readonly transport: VoiceTransport;
  /** Steer the interviewer toward the next directive. Never throws. */
  steer(input: SteerInput): void;
  /** In the typed fallback, submit a line the user typed. No-op elsewhere. */
  submitText?(text: string): void;
  /** Tear down mic, peer connection / recognition, and audio. Idempotent. */
  disconnect(): void;
}
