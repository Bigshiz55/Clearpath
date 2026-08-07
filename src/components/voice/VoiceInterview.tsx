'use client';

/**
 * THE VOICE INTERVIEW — orchestration.
 *
 * The one stateful component. It owns the interview lifecycle and holds whichever
 * transport (Realtime WebRTC or the keyless Web-Speech fallback) is live behind
 * the single `VoiceClient` interface, so all the conversation logic here is
 * transport-agnostic.
 *
 * The loop, once running:
 *   user speaks → transport extracts a `TasteSignal`
 *     → recordInterviewTurn() folds it into the server state and returns the next
 *       Directive
 *     → we steer the transport toward that Directive (Realtime: inject the
 *       per-turn instruction; fallback: voice the suggested line)
 *     → the live confidence dial + DNA constellation update
 *   …until the Directive says `done`, when we completeInterview() and reveal.
 *
 * It never dead-ends: a Realtime failure or network drop falls back to browser
 * speech; a browser without recognition falls back again to a typed box; and a
 * resumed interview replays its transcript and picks up exactly where it left off.
 *
 * Transport callbacks read live values through REFS, not React state, so the
 * closures captured when a transport connects always see the freshest interview
 * id, directive and streaming buffer. That is why the handlers can be plain
 * (hoisted) functions with no dependency arrays.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  startOrResumeInterview,
  recordInterviewTurn,
  completeInterview,
  abandonInterview,
} from '@/lib/actions/voiceInterview';
import {
  buildTurnInstruction,
  type InterviewState,
  type Directive,
  type TasteSignal,
  type DnaReveal as DnaRevealPayload,
  type TranscriptEntry,
} from '@/lib/voice/interview';
import type { VoiceClient, VoiceClientCallbacks, VoiceTransport } from '@/lib/voice/realtime/types';
import { Waveform } from './Waveform';
import { LiveCaptions, type CaptionLine } from './LiveCaptions';
import { ConfidenceMeter } from './ConfidenceMeter';
import { DnaConstellation, constellationNodes } from './DnaConstellation';
import { InterestingBeat } from './InterestingBeat';
import { DnaReveal } from './DnaReveal';

type Status = 'loading' | 'idle' | 'connecting' | 'live' | 'reconnecting' | 'completing' | 'complete' | 'error';
type Beat = NonNullable<TranscriptEntry['beat']>;

interface SessionResponse {
  mode: 'realtime' | 'fallback';
  model?: string;
  client_secret?: { value: string; expires_at?: number };
  error?: string;
}

const BEAT_FOR_ACTION: Partial<Record<Directive['action'], Beat>> = {
  challenge: 'challenge',
  confirm: 'theory',
  wrap: 'wrap',
};

let CAPTION_SEQ = 0;
const captionId = (): string => `cap-${CAPTION_SEQ++}`;

function transcriptToCaptions(transcript: TranscriptEntry[]): CaptionLine[] {
  return transcript.filter((t) => t.text).map((t) => ({ id: captionId(), role: t.role, text: t.text }));
}

export function VoiceInterview() {
  const [status, setStatus] = useState<Status>('loading');
  const [engineState, setEngineState] = useState<InterviewState | null>(null);
  const [reveal, setReveal] = useState<DnaRevealPayload | null>(null);
  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const [streaming, setStreaming] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [transport, setTransport] = useState<VoiceTransport | null>(null);
  const [typedMode, setTypedMode] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [beat, setBeat] = useState<Beat | null>(null);
  const [beatNonce, setBeatNonce] = useState(0);
  const [typedValue, setTypedValue] = useState('');
  const [resumed, setResumed] = useState(false);

  const clientRef = useRef<VoiceClient | null>(null);
  const interviewIdRef = useRef<string | null>(null);
  const directiveRef = useRef<Directive | null>(null);
  const turnChain = useRef<Promise<void>>(Promise.resolve());
  const streamingRef = useRef('');
  const triedFallbackRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const finishingRef = useRef(false);
  const mountedRef = useRef(true);
  const startingRef = useRef(false);

  // ---- load or resume on mount ---------------------------------------------
  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      const res = await startOrResumeInterview();
      if (!mountedRef.current) return;
      if (!res.ok || !res.state || !res.directive) {
        setError(res.error ?? 'Could not start the interview.');
        setStatus('error');
        return;
      }
      interviewIdRef.current = res.state.id;
      directiveRef.current = res.directive;
      setEngineState(res.state);
      if (res.state.transcript.length > 0) {
        setCaptions(transcriptToCaptions(res.state.transcript));
        setResumed(true);
      }
      setStatus('idle');
    })();
    return () => {
      mountedRef.current = false;
      intentionalCloseRef.current = true;
      clientRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- the per-turn reducer, serialized ------------------------------------
  async function finish(): Promise<void> {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const id = interviewIdRef.current;
    if (!id) return;
    setStatus('completing');
    setBeat('wrap');
    setBeatNonce((n) => n + 1);
    const res = await completeInterview({ interviewId: id });
    intentionalCloseRef.current = true;
    clientRef.current?.disconnect();
    if (!mountedRef.current) return;
    if (res.ok && res.reveal) {
      setReveal(res.reveal);
      setStatus('complete');
    } else {
      setError(res.error ?? 'Could not assemble your DNA.');
      setStatus('error');
    }
  }

  async function processSignal(signal: TasteSignal): Promise<void> {
    const id = interviewIdRef.current;
    if (!id) return;
    const res = await recordInterviewTurn({ interviewId: id, signals: [signal] });
    if (!mountedRef.current || !res.ok || !res.state || !res.directive) return;

    setEngineState(res.state);
    directiveRef.current = res.directive;

    // A strong reaction earns an "Interesting…"; the engine's own tagged beats
    // (challenge/theory/wrap) take precedence.
    const actionBeat = BEAT_FOR_ACTION[res.directive.action];
    const nextBeat: Beat | null = actionBeat ?? (signal.strength >= 0.8 ? 'insight' : null);
    if (nextBeat) {
      setBeat(nextBeat);
      setBeatNonce((n) => n + 1);
    }

    clientRef.current?.steer({
      instruction: buildTurnInstruction(res.directive),
      speakLine: res.directive.suggestedLine,
      done: res.directive.done,
    });

    if (res.directive.done) await finish();
  }

  // Serialize turns: `recordInterviewTurn` reads-then-writes the server state, so
  // two overlapping turns would race the turn counter. Chain them.
  function enqueueSignal(signal: TasteSignal): void {
    turnChain.current = turnChain.current.then(() => processSignal(signal)).catch(() => undefined);
  }

  // ---- transport callbacks (shared by both transports) ---------------------
  function buildCallbacks(kind: VoiceTransport): VoiceClientCallbacks {
    return {
      onOpen: () => {
        if (!mountedRef.current) return;
        setStatus('live');
        setNotice(null);
        // Steer toward the current directive (greet on a fresh run, the in-flight
        // question on resume/reconnect). `kickoff` only matters to Realtime — it
        // asks the model to speak first.
        const d = directiveRef.current;
        if (d) {
          clientRef.current?.steer({
            instruction: buildTurnInstruction(d),
            speakLine: d.suggestedLine,
            kickoff: true,
          });
        }
      },
      onClose: () => {
        if (intentionalCloseRef.current || !mountedRef.current) return;
        handleTransportFailure(kind);
      },
      onError: () => {
        if (!mountedRef.current) return;
        handleTransportFailure(kind);
      },
      onTranscriptDelta: (delta) => {
        streamingRef.current += delta;
        setStreaming(streamingRef.current);
      },
      onInterviewerDone: (text) => {
        streamingRef.current = '';
        setStreaming('');
        if (text) setCaptions((c) => [...c, { id: captionId(), role: 'interviewer', text }]);
      },
      onUserTranscript: (text) => {
        if (text) setCaptions((c) => [...c, { id: captionId(), role: 'user', text }]);
      },
      onSignal: (signal) => enqueueSignal(signal),
      onAudioLevel: (lvl) => setLevel(lvl),
      onSpeakingChange: (v) => setSpeaking(v),
    };
  }

  // ---- recovery: realtime → fallback → typed -------------------------------
  async function startFallback(): Promise<void> {
    intentionalCloseRef.current = false;
    const { connectFallback } = await import('@/lib/voice/realtime/fallback');
    const client = await connectFallback({
      ...buildCallbacks('fallback'),
      onCapability: (cap) => {
        if (cap === 'typed') {
          setTypedMode(true);
          setNotice('Your browser can’t hear you, so type your answers — the interview works exactly the same.');
        }
      },
    });
    clientRef.current = client;
    setTransport(client.transport);
  }

  function handleTransportFailure(kind: VoiceTransport): void {
    // Realtime failed and we haven't fallen back yet → keyless browser speech.
    if (kind === 'realtime' && !triedFallbackRef.current) {
      triedFallbackRef.current = true;
      setStatus('reconnecting');
      setNotice('Live voice dropped — switching to on-device speech. Your progress is safe.');
      intentionalCloseRef.current = true;
      clientRef.current?.disconnect();
      intentionalCloseRef.current = false;
      void startFallback().catch(() => {
        setTypedMode(true);
        setStatus('live');
        setNotice('Voice is unavailable right now — you can continue by typing.');
      });
      return;
    }
    // Already on the fallback → never dead-end: drop to the typed box.
    setTypedMode(true);
    setStatus('live');
    setNotice('Voice hit a snag — you can keep going by typing.');
  }

  // ---- start (requires a user gesture for mic + audio) ---------------------
  async function start(): Promise<void> {
    if (startingRef.current) return;
    startingRef.current = true;
    setStatus('connecting');
    setError(null);
    setNotice(null);
    intentionalCloseRef.current = false;
    try {
      let session: SessionResponse = { mode: 'fallback' };
      try {
        const resp = await fetch('/api/voice/session', { method: 'POST' });
        session = (await resp.json()) as SessionResponse;
      } catch {
        session = { mode: 'fallback' };
      }

      if (session.mode === 'realtime' && session.client_secret && session.model) {
        try {
          const { connectRealtime } = await import('@/lib/voice/realtime/client');
          const client = await connectRealtime({
            clientSecret: session.client_secret,
            model: session.model,
            ...buildCallbacks('realtime'),
          });
          clientRef.current = client;
          setTransport('realtime');
          return;
        } catch {
          // Handshake failed at the gate — degrade before going live.
          triedFallbackRef.current = true;
          setNotice('Live voice isn’t available — using on-device speech instead.');
        }
      }
      await startFallback();
    } catch {
      setTypedMode(true);
      setStatus('live');
      setNotice('Continue by typing your answers below.');
    } finally {
      startingRef.current = false;
    }
  }

  function submitTyped(e: FormEvent): void {
    e.preventDefault();
    const text = typedValue.trim();
    if (!text) return;
    setTypedValue('');
    clientRef.current?.submitText?.(text);
  }

  function endInterview(): void {
    intentionalCloseRef.current = true;
    clientRef.current?.disconnect();
    setStatus('idle');
  }

  async function restart(): Promise<void> {
    const id = interviewIdRef.current;
    if (id) await abandonInterview({ interviewId: id });
    if (typeof window !== 'undefined') window.location.reload();
  }

  // ---- derived --------------------------------------------------------------
  const overall = engineState?.overallConfidence ?? directiveRef.current?.overallConfidence ?? 0;
  const nodes = engineState ? constellationNodes(engineState) : [];

  // ==== render ===============================================================
  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-400" data-testid="voice-loading">
        <span className="animate-pulse">Preparing your interview…</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 text-center" data-testid="voice-error">
        <p className="text-slate-300">{error}</p>
        <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (status === 'complete' && reveal) {
    return (
      <div className="px-4 py-8">
        <DnaReveal reveal={reveal} onRestart={restart} />
      </div>
    );
  }

  if (status === 'idle') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-6 px-4 text-center" data-testid="voice-idle">
        <div className="space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-300">Voice DNA</span>
          <h1 className="text-3xl font-black text-white sm:text-4xl">
            {resumed ? 'Pick up where you left off' : 'Let’s find out what you actually love'}
          </h1>
          <p className="text-slate-400">
            {resumed
              ? 'Your interview is still going. Tap to continue — everything you’ve said is remembered.'
              : 'A short, spoken conversation. Talk about a film or show you loved, and I’ll read your taste as we go.'}
          </p>
        </div>
        {resumed && captions.length > 0 ? (
          <div className="w-full text-left" data-testid="voice-resume-transcript">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">So far</div>
            <LiveCaptions lines={captions} />
          </div>
        ) : null}
        <button type="button" className="btn-watchverdict" onClick={() => void start()} data-testid="voice-start" autoFocus>
          {resumed ? 'Resume interview' : 'Tap to start'}
        </button>
        <p className="text-xs text-slate-600">Uses your microphone. Nothing is recorded — only your taste is kept.</p>
      </div>
    );
  }

  // connecting / live / reconnecting / completing
  const busyLabel =
    status === 'connecting'
      ? 'Connecting…'
      : status === 'reconnecting'
        ? 'Reconnecting…'
        : status === 'completing'
          ? 'Reading your verdict…'
          : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6" data-testid="voice-live">
      <div className="flex items-start justify-between gap-4">
        <div className="min-h-[1.75rem]">{beat ? <InterestingBeat beat={beat} nonce={beatNonce} /> : null}</div>
        <button type="button" className="btn-ghost text-xs" onClick={endInterview} data-testid="voice-end">
          End
        </button>
      </div>

      {notice ? (
        <p
          className="rounded-xl border border-gold-400/30 bg-gold-500/10 px-3 py-2 text-sm text-gold-100"
          role="status"
          data-testid="voice-notice"
        >
          {notice}
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ConfidenceMeter value={overall} />
        <div className="w-full flex-1">
          <Waveform level={level} active={status === 'live' && !speaking} />
          {busyLabel ? (
            <p className="mt-1 text-center text-xs text-slate-500" aria-live="polite">
              {busyLabel}
            </p>
          ) : null}
        </div>
      </div>

      <DnaConstellation nodes={nodes} />

      <div className="card p-4">
        <LiveCaptions lines={captions} streaming={streaming} speaking={speaking} />
      </div>

      {typedMode ? (
        <form onSubmit={submitTyped} className="flex gap-2" data-testid="voice-typed-form">
          <label htmlFor="voice-typed-input" className="sr-only">
            Type your answer
          </label>
          <input
            id="voice-typed-input"
            className="min-h-[44px] flex-1 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder:text-slate-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/40"
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            placeholder="Tell me about a film or show you loved…"
            autoComplete="off"
          />
          <button type="submit" className="btn-primary" disabled={!typedValue.trim()}>
            Send
          </button>
        </form>
      ) : null}

      <p className="text-center text-[11px] text-slate-600">
        {transport === 'realtime'
          ? 'Live voice · speak naturally, interrupt any time'
          : transport === 'fallback'
            ? 'On-device speech · speak after the question'
            : 'Type your answers below'}
      </p>
    </div>
  );
}
