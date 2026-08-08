'use client';

/**
 * THE KEYLESS FALLBACK TRANSPORT — Web Speech API, no OpenAI key required.
 *
 * When there is no Realtime session, the interview still runs entirely in the
 * browser: `speechSynthesis` gives the interviewer a voice (a British/Australian
 * one when the platform offers it, to match the written persona) and
 * `SpeechRecognition` is its ears. Recognised speech is turned into a
 * `TasteSignal` by the pure `deriveSignal` interpreter, so the same confidence
 * axes move as they would under the model.
 *
 * It implements the identical `VoiceClient` interface as the Realtime client, so
 * `VoiceInterview.tsx` drives either one through the same callbacks and the same
 * `steer()` — the only visible difference is that here `steer()` SPEAKS the
 * `speakLine` out loud rather than instructing a remote model.
 *
 * Degrades again: a browser without `SpeechRecognition` still gets a fully usable
 * interview via `submitText()` (the typed fallback), with the interviewer's lines
 * spoken aloud when synthesis exists and shown as captions regardless.
 *
 * No browser global is touched at import time — all access is inside the exported
 * function — so the module is safe in an SSR/build graph.
 */
import { deriveSignal } from './deriveSignal';
import type { VoiceClient, VoiceClientCallbacks, SteerInput } from './types';

export type FallbackCapability = 'speech' | 'typed';

export interface ConnectFallbackOptions extends VoiceClientCallbacks {
  /** Reports whether live speech recognition is available or we are typed-only. */
  onCapability?: (cap: FallbackCapability) => void;
}

// Minimal structural types for the two vendor-prefixed Web Speech interfaces.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Prefer a British/Australian English voice to fit the interviewer's persona. */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const byLang = (re: RegExp): SpeechSynthesisVoice | undefined => voices.find((v) => re.test(v.lang));
  const byName = (re: RegExp): SpeechSynthesisVoice | undefined => voices.find((v) => re.test(v.name));
  return (
    byName(/en[-_ ]?(GB|AU)|british|australian|Daniel|Serena|Karen|Arthur|Sonia/i) ??
    byLang(/en[-_](GB|AU)/i) ??
    byLang(/^en/i) ??
    voices[0] ??
    null
  );
}

/**
 * Start the fallback transport. Resolves immediately (there is no network
 * handshake); `onOpen` fires on the next tick so the caller can wire up before
 * the greeting is steered in.
 */
export async function connectFallback(opts: ConnectFallbackOptions): Promise<VoiceClient> {
  let turn = 0;
  let closed = false;
  let recognition: SpeechRecognitionLike | null = null;
  let chosenVoice: SpeechSynthesisVoice | null = null;

  const hasSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const RecognitionCtor = getRecognitionCtor();
  const capability: FallbackCapability = RecognitionCtor ? 'speech' : 'typed';

  const fail = (err: unknown): void => {
    try {
      opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    } catch {
      /* ignore */
    }
  };

  // Resolve the interviewer voice (voices can load asynchronously).
  if (hasSynthesis) {
    const load = (): void => {
      chosenVoice = pickVoice(window.speechSynthesis.getVoices());
    };
    load();
    try {
      window.speechSynthesis.onvoiceschanged = load;
    } catch {
      /* ignore */
    }
  }

  const speak = (text: string): void => {
    if (!hasSynthesis || !text) {
      // No voice — the caption still carries the line; mark it "done" at once.
      opts.onInterviewerDone?.(text);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (chosenVoice) u.voice = chosenVoice;
      u.rate = 1.0;
      u.pitch = 1.0;
      u.onstart = () => {
        opts.onTranscriptDelta?.(text);
        opts.onSpeakingChange?.(true);
      };
      u.onend = () => {
        opts.onSpeakingChange?.(false);
        opts.onInterviewerDone?.(text);
      };
      u.onerror = () => {
        opts.onSpeakingChange?.(false);
        opts.onInterviewerDone?.(text);
      };
      window.speechSynthesis.speak(u);
    } catch (err) {
      fail(err);
      opts.onInterviewerDone?.(text);
    }
  };

  const ingest = (text: string): void => {
    const clean = text.trim();
    if (!clean) return;
    turn += 1;
    opts.onUserTranscript?.(clean);
    const signal = deriveSignal(clean, turn);
    if (signal) opts.onSignal?.(signal);
  };

  // Continuous recognition: emit a signal per FINAL result, keep listening.
  const startRecognition = (): void => {
    if (!RecognitionCtor || closed) return;
    try {
      const rec = new RecognitionCtor();
      rec.lang = 'en-GB';
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r?.isFinal) ingest(r[0]?.transcript ?? '');
        }
      };
      rec.onerror = (e) => {
        // "no-speech"/"aborted" are benign; anything else surfaces.
        if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') fail(new Error(`recognition: ${e.error}`));
      };
      rec.onend = () => {
        // Auto-restart so a natural pause doesn't end the interview.
        if (!closed) {
          try {
            rec.start();
          } catch {
            /* a restart race is harmless */
          }
        }
      };
      recognition = rec;
      rec.start();
    } catch (err) {
      fail(err);
    }
  };

  // Fire open + capability on the next tick so the caller's handlers are set.
  setTimeout(() => {
    if (closed) return;
    opts.onCapability?.(capability);
    startRecognition();
    try {
      opts.onOpen?.();
    } catch {
      /* ignore */
    }
  }, 0);

  const disconnect = (): void => {
    if (closed) return;
    closed = true;
    try {
      recognition?.abort();
    } catch {
      /* ignore */
    }
    try {
      if (hasSynthesis) window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    try {
      opts.onClose?.();
    } catch {
      /* ignore */
    }
  };

  const steer = (input: SteerInput): void => {
    if (closed) return;
    // The fallback's "steering" is simply voicing the human line for this turn.
    if (input.speakLine) speak(input.speakLine);
  };

  return {
    transport: capability === 'typed' ? 'text' : 'fallback',
    steer,
    submitText: ingest,
    disconnect,
  };
}
