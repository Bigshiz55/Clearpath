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
  /** Is a recogniser present at all? Absent means tap-only, fully supported. */
  asr: boolean;
}

/**
 * WHAT THE MICROPHONE IS ACTUALLY DOING.
 *
 * The interface previously printed "Listening…" as a constant string while the
 * recogniser had failed to start, which is the worst thing an interface can do:
 * it told the user the system was hearing them when it was not, so they waited
 * in silence and then blamed themselves. Every state below is observed, not
 * assumed, and the UI is only allowed to claim it is listening when this says
 * `listening`.
 */
export type MicState =
  | 'idle'          // not started yet
  | 'requesting'    // asking for permission
  | 'listening'     // genuinely receiving audio
  | 'denied'        // the user (or the browser) refused the microphone
  | 'unavailable'   // no recogniser, or the engine refused to start
  | 'error';        // started and then failed

export interface SpeechDiagnostics {
  micState: MicState;
  /** Last recogniser error code, verbatim. */
  lastError: string | null;
  /** Utterances the recogniser has delivered — proves audio is arriving. */
  transcriptsReceived: number;
  /** Times the engine restarted itself after going quiet. */
  restarts: number;
  permission: 'unknown' | 'granted' | 'denied';
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
  /**
   * "Listening…" must not FLICKER.
   *
   * The recogniser closes and reopens many times in a normal run — once per
   * prompt, plus whenever Chrome decides a silence has gone on long enough.
   * Rendering the instantaneous flag made the indicator blink continuously,
   * which a real user read (correctly) as "this thing is broken". This is the
   * settled view: it stays true across the short reopens, and only goes false
   * when the microphone has genuinely been shut for longer than any reopen
   * takes. It is still a fact about the session, not a decoration — a denied
   * or unavailable microphone drops it immediately, via `micState`.
   */
  const [sessionLive, setSessionLive] = useState(false);
  const [diagnostics, setDiagnostics] = useState<SpeechDiagnostics>({
    micState: 'idle',
    lastError: null,
    transcriptsReceived: 0,
    restarts: 0,
    permission: 'unknown',
  });

  const heardRef = useRef(onHeard);
  heardRef.current = onHeard;

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantListeningRef = useRef(false);
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  /**
   * WHAT WE ARE SAYING RIGHT NOW.
   *
   * Recognition never pauses while we speak — that is what makes barge-in work
   * — which means the microphone can hear the prompt itself. "Lightning round.
   * Liked it: yes…" contains `yes`, and `Knives Out?` is a question the system
   * would happily answer on the user's behalf. Anything that arrives while we
   * are talking AND is contained in what we are saying is our own voice coming
   * back, and is dropped.
   */
  const speakingRef = useRef<{ text: string; until: number } | null>(null);
  // `resultIndex` restarts whenever the engine does, so the session counter
  // keeps utterance ids unique across the restarts that `onend` performs.
  const sessionRef = useRef(0);
  const startListeningRef = useRef<(() => void) | null>(null);
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

      // ── THE ECHO GUARD ───────────────────────────────────────────────────
      //
      // Text matching CANNOT distinguish "the user said yes" from "the system
      // said yes" — the strings are identical. A first version dropped anything
      // contained in the current prompt, and promptly swallowed the user's own
      // "yes" immediately after "Liked it: yes. Didn't like it: no." That is
      // worse than the echo it was preventing: it breaks the answer.
      //
      // Worse still, the instruction CONTAINS every valid answer by
      // construction — "Liked it: yes. Didn't like it: no. Haven't seen it:
      // pass." A three-word threshold swallowed a genuine "haven't seen it",
      // because that phrase is literally in the sentence teaching it.
      //
      // So the audio layer does the real work: `getUserMedia` runs with
      // echoCancellation, which solves this before a transcript exists. What
      // remains here is a deliberately BLUNT backstop for the one thing AEC
      // misses — a long, verbatim run of our own sentence returning. Five words
      // and twenty characters is comfortably longer than any answer a person
      // gives, so a real answer can never be caught by it.
      const speaking = speakingRef.current;
      if (speaking && Date.now() < speaking.until) {
        const heard = trimmed.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        const said = speaking.text.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
        const longEnough = heard.split(/\s+/).length >= 5 && heard.length >= 20;
        if (longEnough && said.includes(heard)) return;
      }
      if (source === 'voice') {
        setDiagnostics((d) => ({ ...d, transcriptsReceived: d.transcriptsReceived + 1 }));
      }

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

  /**
   * Suspend/resume around a prompt. `suspendedRef` distinguishes "we closed the
   * microphone to speak" from "the user ended the run", so `onend` does not
   * fight the suspension by restarting mid-sentence.
   */
  const suspendedRef = useRef(false);
  const downSinceRef = useRef<number | null>(null);

  const suspendForSpeech = useCallback(() => {
    if (!wantListeningRef.current) return;
    suspendedRef.current = true;
    const rec = recRef.current;
    recRef.current = null;
    try {
      rec?.abort();
    } catch {
      /* already gone */
    }
  }, []);

  const resumeAfterSpeech = useCallback(() => {
    if (!suspendedRef.current || !wantListeningRef.current) return;
    suspendedRef.current = false;
    startListeningRef.current?.();
  }, []);

  /** Stop talking THIS INSTANT. The first half of barge-in. */
  const cancelSpeech = useCallback(() => {
    speakingRef.current = null;
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
        // ── RELIABLE TURN-TAKING, NOT WISHFUL BARGE-IN ─────────────────────
        //
        // Chrome cannot reliably run SpeechRecognition while speechSynthesis is
        // playing: the two contend for the audio device, so `speak()` ends the
        // recognition session almost immediately. With a restart-on-`onend`
        // loop that produced exactly what a real user reported — an indicator
        // blinking between listening and not, and a microphone that never
        // stayed open long enough to hear an answer.
        //
        // So recognition is SUSPENDED for the length of the prompt and resumed
        // the instant it finishes. The prompts are one to four words, so the
        // window closes for well under a second — far cheaper than a session
        // that is never really open. Taps stay live throughout, so a fast user
        // is never blocked, and this is measured rather than assumed.
        suspendForSpeech();
        // ~14 characters a second at our rate, plus a margin: long enough to
        // cover the utterance, short enough that a stuck flag cannot deafen us.
        speakingRef.current = { text, until: Date.now() + 800 + text.length * 70 };
        const u = new SpeechSynthesisUtterance(text);
        u.onend = () => {
          speakingRef.current = null;
          resumeAfterSpeech();
        };
        u.onerror = () => {
          speakingRef.current = null;
          resumeAfterSpeech();
        };
        // A browser that never fires `onend` (it happens) must not deafen the
        // run: reopen on the estimated duration as a backstop.
        window.setTimeout(resumeAfterSpeech, 400 + text.length * 70);
        if (voiceRef.current) u.voice = voiceRef.current;
        u.rate = SPEECH_RATE;
        u.pitch = SPEECH_PITCH;
        s.speak(u);
      } catch {
        /* speech is a nicety; the run continues silently */
        resumeAfterSpeech();
      }
    },
    [resumeAfterSpeech, suspendForSpeech],
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
    rec.onerror = (e) => {
      const code = e?.error ?? 'unknown';
      // `no-speech` and `aborted` are routine — the engine goes quiet and we
      // restart. `not-allowed` and `service-not-allowed` are FATAL: restarting
      // forever would leave the interface claiming to listen while permission
      // is refused, which is the exact lie this rewrite exists to remove.
      const fatal = code === 'not-allowed' || code === 'service-not-allowed';
      setDiagnostics((d) => ({
        ...d,
        lastError: code,
        ...(fatal ? { micState: 'denied' as const, permission: 'denied' as const } : {}),
      }));
      if (fatal) {
        wantListeningRef.current = false;
        setListening(false);
      }
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      if (wantListeningRef.current && !suspendedRef.current) {
        setDiagnostics((d) => ({ ...d, restarts: d.restarts + 1 }));
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
      setDiagnostics((d) => ({ ...d, micState: 'listening', permission: 'granted' }));
    } catch (e) {
      recRef.current = null;
      setListening(false);
      setDiagnostics((d) => ({
        ...d,
        micState: 'unavailable',
        lastError: e instanceof Error ? e.message : 'start failed',
      }));
    }
  }, [deliver]);

  /**
   * Ask for the microphone BEFORE claiming to listen.
   *
   * `SpeechRecognition.start()` triggers its own permission prompt, but it
   * resolves asynchronously and reports refusal through `onerror` — so the
   * interface would show "Listening…" for the whole time the prompt was on
   * screen, and keep showing it after a refusal. Asking first turns that into
   * a state we can render honestly.
   */
  const requestMic = useCallback(async (): Promise<boolean> => {
    if (!recognitionCtor()) {
      setDiagnostics((d) => ({ ...d, micState: 'unavailable' }));
      return false;
    }
    setDiagnostics((d) => ({ ...d, micState: 'requesting' }));
    try {
      const media = navigator?.mediaDevices;
      if (media?.getUserMedia) {
        // Echo cancellation is where the system-hearing-itself problem is
        // actually solved — at the audio layer, before any transcript exists.
        const stream = await media.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        // We only needed the permission; the recogniser opens its own stream.
        stream.getTracks().forEach((t) => t.stop());
      }
      setDiagnostics((d) => ({ ...d, permission: 'granted' }));
      return true;
    } catch (e) {
      setDiagnostics((d) => ({
        ...d,
        micState: 'denied',
        permission: 'denied',
        lastError: e instanceof Error ? e.name : 'permission denied',
      }));
      return false;
    }
  }, []);

  startListeningRef.current = startListening;

  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    suspendedRef.current = false;
    const rec = recRef.current;
    recRef.current = null;
    setListening(false);
    try {
      rec?.abort();
    } catch {
      /* already gone */
    }
  }, []);

  /** How long the microphone may be shut before we stop claiming to listen. */
  const REOPEN_GRACE_MS = 2500;

  useEffect(() => {
    if (listening) {
      downSinceRef.current = null;
      setSessionLive(true);
      return;
    }
    if (!wantListeningRef.current) {
      setSessionLive(false);
      return;
    }
    downSinceRef.current = downSinceRef.current ?? Date.now();
    const id = window.setTimeout(() => {
      const since = downSinceRef.current;
      if (since !== null && Date.now() - since >= REOPEN_GRACE_MS) setSessionLive(false);
    }, REOPEN_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [listening]);

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

  return {
    capability,
    /** Settled across short reopens — this is what the UI should render. */
    listening: sessionLive,
    /** The raw recogniser flag, for diagnostics. */
    recognizerOpen: listening,
    diagnostics,
    requestMic,
    speak,
    cancelSpeech,
    startListening,
    stopListening,
  };
}
