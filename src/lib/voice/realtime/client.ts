'use client';

/**
 * THE OPENAI REALTIME WEBRTC CLIENT — browser only, React-free.
 *
 * This module owns the whole live-voice transport and NOTHING about the UI, so
 * the React layer can hold it behind the shared `VoiceClient` interface and stay
 * ignorant of SDP, ICE, data channels and analyser nodes.
 *
 * The handshake (OpenAI's documented WebRTC path):
 *   1. getUserMedia({ audio }) → add the mic track to an RTCPeerConnection.
 *   2. Open a `oai-events` data channel (JSON control + tool calls both ways).
 *   3. createOffer → setLocalDescription → POST the offer SDP to
 *      `…/v1/realtime?model=…` with the EPHEMERAL client secret (never the
 *      server key) → setRemoteDescription(answer).
 *   4. The model's audio arrives as a remote track, played through a hidden
 *      <audio autoplay>. Barge-in is server-VAD: the server stops that audio
 *      when the user speaks; the client just plays whatever it is sent.
 *
 * Everything is wrapped so a failure at ANY step calls `onError` and tears down
 * cleanly — the caller can then fall back to the keyless path without a dead
 * screen. No browser global is touched at import time, so the module is safe to
 * pull into an SSR/build graph; all access is inside the exported function.
 */
import { categoriesFor, type TasteSignal, type SignalKind, type Sentiment } from '@/lib/voice/interview';
import type { VoiceClient, VoiceClientCallbacks, SteerInput } from './types';

const REALTIME_URL = 'https://api.openai.com/v1/realtime';

/**
 * The constraint that keeps the Realtime model a VOICE, not a second
 * interviewer. Exported so the regression tests assert the real string rather
 * than a paraphrase of it.
 *
 * The failure this prevents is subtle and expensive: a model given a question
 * and its own personality will "helpfully" rewrite the category list — "crime,
 * drama, comedy" becomes "crime, drama, or maybe something funny?" — and the
 * answer parser then aligns three scores to labels the user never heard.
 */
export const SPEAK_VERBATIM_PREFIX =
  'Say the following line EXACTLY as written, word for word, and then stop. ' +
  'Do not rephrase it, expand it, add a greeting, add commentary, change the ' +
  'order of any list, or ask anything else. Speak only this line:';

/** The ephemeral secret shape the session route returns (only `.value` is used). */
export interface RealtimeClientSecret {
  value: string;
  expires_at?: number;
}

export interface ConnectRealtimeOptions extends VoiceClientCallbacks {
  clientSecret: RealtimeClientSecret;
  model: string;
}

const VALID_SENTIMENTS: readonly Sentiment[] = ['love', 'like', 'neutral', 'dislike', 'hate'];
const VALID_KINDS: readonly SignalKind[] = ['title', 'genre', 'theme', 'element', 'person', 'attribute', 'meta'];

let SIGNAL_SEQ = 0;

/**
 * Turn the model's `record_signal` tool arguments into a well-formed
 * `TasteSignal`. The tool does not ask the model for the taste AXES (that is our
 * lexicon's job, not the model's), so we resolve them here through
 * `categoriesFor` — the exact same resolver the engine and the fallback use.
 * Returns `null` for unusable arguments so a stray tool call can never crash the
 * session.
 */
export function signalFromToolArgs(args: unknown, turn = 0): TasteSignal | null {
  if (!args || typeof args !== 'object') return null;
  const a = args as Record<string, unknown>;
  const subject = typeof a.subject === 'string' ? a.subject.trim() : '';
  if (!subject) return null;
  const sentiment = VALID_SENTIMENTS.includes(a.sentiment as Sentiment) ? (a.sentiment as Sentiment) : 'neutral';
  const kind = VALID_KINDS.includes(a.kind as SignalKind) ? (a.kind as SignalKind) : 'element';
  const strengthRaw = typeof a.strength === 'number' ? a.strength : Number(a.strength);
  const strength = Number.isFinite(strengthRaw) ? Math.max(0, Math.min(1, strengthRaw)) : 0.5;
  return {
    id: `rt:${turn}:${SIGNAL_SEQ++}`,
    turn,
    kind,
    subject,
    sentiment,
    strength,
    categories: categoriesFor(subject, kind),
    ...(typeof a.reason === 'string' && a.reason ? { reason: a.reason } : {}),
    ...(typeof a.raw === 'string' && a.raw ? { raw: a.raw } : {}),
  };
}

/**
 * Connect a live Realtime session and return the transport handle. The promise
 * resolves once the peer connection + data channel are established; `onOpen`
 * fires at the same moment. Any failure rejects AND calls `onError`, after
 * tearing down whatever was half-built.
 */
export async function connectRealtime(opts: ConnectRealtimeOptions): Promise<VoiceClient> {
  const { clientSecret, model } = opts;
  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  let micStream: MediaStream | null = null;
  let audioEl: HTMLAudioElement | null = null;
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let levelRaf = 0;
  let closed = false;

  const fail = (where: string, err: unknown): Error => {
    const e = err instanceof Error ? err : new Error(`${where}: ${String(err)}`);
    try {
      opts.onError?.(e);
    } catch {
      /* a throwing handler must never mask the original failure */
    }
    return e;
  };

  const teardown = (): void => {
    if (closed) return;
    closed = true;
    if (levelRaf) cancelAnimationFrame(levelRaf);
    try {
      dc?.close();
    } catch {
      /* ignore */
    }
    try {
      pc?.getSenders().forEach((s) => s.track?.stop());
      pc?.close();
    } catch {
      /* ignore */
    }
    try {
      micStream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    try {
      void audioCtx?.close();
    } catch {
      /* ignore */
    }
    if (audioEl) {
      try {
        audioEl.srcObject = null;
        audioEl.remove();
      } catch {
        /* ignore */
      }
    }
    try {
      opts.onClose?.();
    } catch {
      /* ignore */
    }
  };

  try {
    if (typeof RTCPeerConnection === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      throw new Error('WebRTC or mic capture is not available in this browser.');
    }

    // 1) Mic.
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      throw fail('mic', err);
    }

    // Waveform: an analyser tap on the mic, published as a smoothed 0..1 level.
    try {
      const AudioCtor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtor && opts.onAudioLevel) {
        audioCtx = new AudioCtor();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        audioCtx.createMediaStreamSource(micStream).connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        let smoothed = 0;
        const tick = (): void => {
          if (closed || !analyser) return;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i]! - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);
          smoothed = smoothed * 0.8 + Math.min(1, rms * 3.2) * 0.2;
          opts.onAudioLevel?.(smoothed);
          levelRaf = requestAnimationFrame(tick);
        };
        levelRaf = requestAnimationFrame(tick);
      }
    } catch {
      // The waveform is a nicety — never let it sink the session.
    }

    // 2) Peer connection + remote audio sink.
    pc = new RTCPeerConnection();
    audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.setAttribute('aria-hidden', 'true');
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
    pc.ontrack = (ev) => {
      if (audioEl && ev.streams[0]) audioEl.srcObject = ev.streams[0];
    };
    pc.onconnectionstatechange = () => {
      const st = pc?.connectionState;
      if (st === 'failed' || st === 'disconnected' || st === 'closed') {
        if (!closed) {
          fail('connection', new Error(`peer connection ${st}`));
          teardown();
        }
      }
    };
    micStream.getTracks().forEach((t) => pc!.addTrack(t, micStream!));

    // 3) Data channel — control + tool calls both ways.
    dc = pc.createDataChannel('oai-events');
    dc.onopen = () => {
      try {
        opts.onOpen?.();
      } catch {
        /* ignore */
      }
    };
    dc.onmessage = (ev) => handleEvent(ev.data);
    dc.onerror = () => fail('datachannel', new Error('data channel error'));

    // 4) SDP offer → OpenAI → answer.
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const resp = await fetch(`${REALTIME_URL}?model=${encodeURIComponent(model)}`, {
      method: 'POST',
      body: offer.sdp ?? '',
      headers: {
        Authorization: `Bearer ${clientSecret.value}`,
        'Content-Type': 'application/sdp',
      },
    });
    if (!resp.ok) throw new Error(`realtime handshake failed (${resp.status})`);
    const answerSdp = await resp.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    teardown();
    // Surface once (mic already surfaced its own; avoid double-firing).
    if (!/^mic:|^peer connection/.test(e.message)) fail('connect', e);
    throw e;
  }

  // ---- inbound event handling -----------------------------------------------

  let interviewerLine = '';
  let speaking = false;
  const setSpeaking = (v: boolean): void => {
    if (v === speaking) return;
    speaking = v;
    try {
      opts.onSpeakingChange?.(v);
    } catch {
      /* ignore */
    }
  };

  function handleEvent(raw: unknown): void {
    let ev: Record<string, unknown>;
    try {
      ev = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
    } catch {
      return;
    }
    const type = typeof ev.type === 'string' ? ev.type : '';
    switch (type) {
      case 'response.audio_transcript.delta': {
        const delta = typeof ev.delta === 'string' ? ev.delta : '';
        if (delta) {
          interviewerLine += delta;
          setSpeaking(true);
          opts.onTranscriptDelta?.(delta);
        }
        break;
      }
      case 'response.audio_transcript.done':
      case 'response.done': {
        const line = interviewerLine.trim();
        if (line) opts.onInterviewerDone?.(line);
        interviewerLine = '';
        setSpeaking(false);
        break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const text = typeof ev.transcript === 'string' ? ev.transcript.trim() : '';
        if (text) opts.onUserTranscript?.(text);
        break;
      }
      case 'input_audio_buffer.speech_started': {
        // Barge-in: the user started talking. Server VAD stops the model audio;
        // we just reflect that the floor is theirs.
        setSpeaking(false);
        break;
      }
      case 'response.function_call_arguments.done': {
        const name = typeof ev.name === 'string' ? ev.name : '';
        if (name !== 'record_signal') break;
        const argStr = typeof ev.arguments === 'string' ? ev.arguments : '';
        let parsed: unknown = null;
        try {
          parsed = argStr ? JSON.parse(argStr) : null;
        } catch {
          break;
        }
        const signal = signalFromToolArgs(parsed);
        if (signal) opts.onSignal?.(signal);
        break;
      }
      case 'error': {
        const msg =
          (ev.error && typeof ev.error === 'object' && typeof (ev.error as { message?: unknown }).message === 'string'
            ? (ev.error as { message: string }).message
            : 'realtime error');
        fail('server', new Error(msg));
        break;
      }
      default:
        break;
    }
  }

  // ---- the handle React holds ----------------------------------------------

  const send = (payload: unknown): void => {
    try {
      if (dc && dc.readyState === 'open') dc.send(JSON.stringify(payload));
    } catch (err) {
      fail('send', err);
    }
  };

  const steer = (input: SteerInput): void => {
    if (closed) return;

    // THE DIRECTOR SPEAKS THROUGH THE MODEL, NOT WITH IT.
    //
    // This used to drop `speakLine` on the floor and only call
    // `response.create` on the opening turn. Every later question therefore
    // depended on the model deciding to answer by itself — which, with server
    // VAD's default `create_response: true`, it did: it improvised its own next
    // question the moment the user stopped talking, racing the round trip to
    // `recordScriptedTurn` and asking something the director never chose. The
    // session now sets `create_response: false`, so the model stays silent
    // until told; this is what tells it.
    //
    // Every scripted turn — kickoff and all the rest — takes the SAME path:
    // put the line in the conversation, then ask for a response whose
    // instructions pin the wording to exactly that line.
    const line = (input.speakLine ?? '').trim();

    if (input.instruction) {
      send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'system',
          content: [{ type: 'input_text', text: `[DIRECTOR] ${input.instruction}` }],
        },
      });
    }

    if (line) {
      send({
        type: 'response.create',
        response: {
          modalities: ['audio', 'text'],
          instructions: `${SPEAK_VERBATIM_PREFIX}\n\n${line}`,
        },
      });
      return;
    }

    // No line to voice. Only the opening turn may still ask the model to speak
    // on its own; otherwise silence is correct — the director has not spoken.
    if (input.kickoff) send({ type: 'response.create' });
  };

  return {
    transport: 'realtime',
    steer,
    disconnect: teardown,
  };
}
