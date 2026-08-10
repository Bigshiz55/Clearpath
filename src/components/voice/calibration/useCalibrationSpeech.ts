'use client';

/**
 * THE MOUTH AND EARS, built for interruption.
 *
 * Everything here exists to make one thing true: the moment a number is
 * recognised, the prompt stops mid-word and the run moves on. That is barge-in,
 * and it is the whole difference between an interface that feels faster than
 * the person and one that makes them wait for a sentence they already answered.
 *
 * Which means recognition NEVER pauses while we speak. The naive design
 * (speak → then listen) costs a full prompt of latency per item and makes
 * answering early impossible; the cost of always listening is that the
 * microphone sometimes hears our own voice, which is harmless because "Crime?"
 * contains no number and simply parses to nothing.
 *
 * The other job is not trusting the recogniser. It re-delivers the same final
 * result, fires interim results that later change, and stops itself after a
 * few seconds of silence. So: results are de-duplicated by (text, recency), and
 * `onend` restarts the engine for as long as the run is live.
 *
 * No browser global is touched at module scope — this file is safe in the
 * server build graph, and every capability is probed at call time.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { SPEECH_PITCH, SPEECH_RATE, pickCalibrationVoice } from '@/lib/voice/calibration/voicePick';

export interface HeardEvent {
  text: string;
  /** The recogniser's own 0..1 confidence, when it reports one. */
  confidence?: number;
  /**
   * Which UTTERANCE this text belongs to. A recogniser refines one utterance
   * across several events — "eig" then "eight" then "eight out of ten" — and
   * they must together produce one answer, not three. Time cannot tell that
   * apart from someone answering two items with the same number, but identity
   * can, so the caller collapses on this rather than on a stopwatch.
   */
  utteranceId?: string;
  source: 'voice' | 'injected';
}

export interface SpeechCapability {
  /** Can we speak? */
  tts: boolean;
  /** Can we listen? False means the run is tap-only, which is fully supported. */
  asr: boolean;
}

interface RecognitionAlternative {
  transcript: string;
  confidence?: number;
}
interface RecognitionResult {
  isFinal: boolean;
  0: RecognitionAlternative;
  length: number;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.speechSynthesis ?? null;
  } catch {
    return null;
  }
}

/**
 * Backstop for engines that re-deliver an identical transcript with no usable
 * utterance identity. Only consulted when `utteranceId` is absent.
 */
const DEDUPE_MS = 1200;

/**
 * A test (or an accessibility tool) can inject a transcript by dispatching
 *   window.dispatchEvent(new CustomEvent('voicedna:heard', { detail: { text: '8' } }))
 * Passing the same `utteranceId` twice models one utterance being refined;
 * omitting it means "this is a separate answer".
 * It travels the identical path a spoken answer does — same parser, same
 * thresholds — so a passing test is evidence about the real code, not about a
 * mock. It carries no privilege: it can only answer the user's own calibration.
 */
export const INJECT_EVENT = 'voicedna:heard';

export function useCalibrationSpeech(onHeard: (e: HeardEvent) => void) {
  const [capability, setCapability] = useState<SpeechCapability>({ tts: false, asr: false });
  const [listening, setListening] = useState(false);

  const heardRef = useRef(onHeard);
  heardRef.current = onHeard;

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  // `resultIndex` restarts whenever the engine does, so the session counter
  // keeps utterance ids unique across the restarts that `onend` performs.
  const sessionRef = useRef(0);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const deliver = useCallback(
    (
      text: string,
      confidence: number | undefined,
      source: HeardEvent['source'],
      utteranceId?: string,
    ) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (utteranceId === undefined && source === 'voice') {
        // A microphone with no usable utterance identity — fall back to "same
        // words, just now". Injected answers are deliberate, never noisy, so
        // they are exempt: two of them mean two answers, however fast.
        const now = Date.now();
        const last = lastRef.current;
        if (last.text === trimmed.toLowerCase() && now - last.at < DEDUPE_MS) return;
        lastRef.current = { text: trimmed.toLowerCase(), at: now };
      }
      heardRef.current({
        text: trimmed,
        ...(confidence === undefined ? {} : { confidence }),
        ...(utteranceId === undefined ? {} : { utteranceId }),
        source,
      });
    },
    [],
  );

  // ── Capabilities + voice inventory ────────────────────────────────────────
  useEffect(() => {
    const s = synth();
    setCapability({ tts: Boolean(s), asr: Boolean(recognitionCtor()) });
    if (!s) return;
    const load = () => {
      try {
        voiceRef.current = pickCalibrationVoice(s.getVoices() ?? []);
      } catch {
        voiceRef.current = null;
      }
    };
    load(); // Chrome reports an empty list first and fills it in asynchronously.
    s.addEventListener?.('voiceschanged', load);
    return () => s.removeEventListener?.('voiceschanged', load);
  }, []);

  // ── The injection channel ─────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { text?: string; confidence?: number; utteranceId?: string }
        | undefined;
      if (detail?.text) deliver(detail.text, detail.confidence, 'injected', detail.utteranceId);
    };
    window.addEventListener(INJECT_EVENT, handler);
    return () => window.removeEventListener(INJECT_EVENT, handler);
  }, [deliver]);

  /** Stop talking THIS INSTANT. The first half of barge-in. */
  const cancelSpeech = useCallback(() => {
    try {
      synth()?.cancel();
    } catch {
      /* a browser that cannot cancel simply finishes the word */
    }
  }, []);

  /**
   * Speak a line. Never awaited by the run loop — the next question is already
   * on screen and the buttons are already live, so waiting on audio would add
   * exactly the dead air this design exists to remove.
   */
  const speak = useCallback(
    (text: string) => {
      const s = synth();
      if (!s || !text) return;
      try {
        s.cancel(); // never queue: a stale prompt is worse than none
        const u = new SpeechSynthesisUtterance(text);
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = SPEECH_RATE;
        u.pitch = SPEECH_PITCH;
        s.speak(u);
      } catch {
        /* speech is a nicety; the run continues silently */
      }
    },
    [],
  );

  const startListening = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    wantListeningRef.current = true;
    if (recRef.current) return;

    sessionRef.current += 1;
    let rec: SpeechRecognitionLike;
    try {
      rec = new Ctor();
    } catch {
      return;
    }
    rec.lang = 'en-US';
    rec.continuous = true;
    // Interim results are what make an answer land in well under half a second;
    // the parser refuses anything it cannot pin down, so a half-formed interim
    // costs nothing.
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const alt = result?.[0];
        if (!alt?.transcript) continue;
        deliver(alt.transcript, alt.confidence, 'voice', `s${sessionRef.current}:${i}`);
      }
    };
    rec.onerror = () => {
      // `no-speech` / `aborted` are routine; onend restarts us.
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      if (wantListeningRef.current) {
        // Chrome ends the session after a few seconds of quiet. Restart on the
        // next tick, or the user's next answer falls into a dead microphone.
        setTimeout(() => {
          if (wantListeningRef.current) startListening();
        }, 80);
      }
    };

    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      recRef.current = null;
      setListening(false);
    }
  }, [deliver]);

  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    const rec = recRef.current;
    recRef.current = null;
    setListening(false);
    try {
      rec?.abort();
    } catch {
      /* already gone */
    }
  }, []);

  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      try {
        recRef.current?.abort();
      } catch {
        /* already gone */
      }
      try {
        synth()?.cancel();
      } catch {
        /* nothing to cancel */
      }
    };
  }, []);

  return { capability, listening, speak, cancelSpeech, startListening, stopListening };
}
