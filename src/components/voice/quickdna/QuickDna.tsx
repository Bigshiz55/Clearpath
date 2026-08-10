'use client';

/**
 * QUICK DNA — the front door.
 *
 * Press START once. After that the person's hands are down: WatchVerd1ct
 * speaks, they answer, and the next question begins immediately. Every tap
 * control on screen is a fallback, and the happy path uses none of them.
 *
 * WHAT MAKES IT FEEL LIKE A CONVERSATION rather than a form:
 *
 *   • The prompt is never awaited. The question is on screen and answerable
 *     before the audio starts, so answering early is normal rather than an edge
 *     case.
 *   • Recognition never stops — not while speaking, not between turns, not at
 *     the seam between probes and the lightning round. Barge-in falls out of
 *     that: a number arriving mid-sentence cancels the sentence.
 *   • There is no confirm step and no second start button. An accepted answer
 *     flashes for feedback while the next question is ALREADY being asked.
 *
 * All sequencing lives in the pure run (`run.ts`) and all interpretation in the
 * pure parser, so this file is only wiring: microphone in, question out. That
 * is deliberate — the loop needs predictable latency, so nothing here waits on
 * a model.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LIGHTNING_INTRO, QUICK_DNA_INTRO } from '@/lib/voice/quickdna/definition';
import {
  isAcceptable,
  parseAbAnswer,
  parseScaleAnswer,
  parseTitleAnswer,
} from '@/lib/voice/quickdna/parseAnswer';
import {
  answerAb,
  answerScale,
  answerTitle,
  createRun,
  elapsedMs,
  goBack,
  remainingMs,
  signalCount,
  skipCurrent,
  start as startRun,
  type QuickRun,
} from '@/lib/voice/quickdna/run';
import type { TraitProfile } from '@/lib/voice/quickdna/traits';
import { saveQuickDna } from '@/lib/actions/quickDna';
import { useCalibrationSpeech, type HeardEvent } from '../calibration/useCalibrationSpeech';
import { QuickDnaSummary } from './QuickDnaSummary';

type Screen = 'ready' | 'running' | 'saving' | 'summary';

/** How long an accepted answer stays on screen. Feedback only — never blocking. */
const FLASH_MS = 650;

/** Where an interrupted run lives, so a reload resumes instead of restarting. */
const RESUME_KEY = 'watchverdict:quickdna:v1';

const SCALE = Array.from({ length: 11 }, (_, i) => i);

export function QuickDna({ seedProfile = {} }: { seedProfile?: TraitProfile }) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('ready');
  const [run, setRun] = useState<QuickRun>(() => createRun(0, seedProfile));
  const [flash, setFlash] = useState<string | null>(null);
  const [repair, setRepair] = useState(false);
  const [now, setNow] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  const runRef = useRef(run);
  runRef.current = run;
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const flashTimer = useRef<number | null>(null);
  const lastUtterance = useRef<string | null>(null);
  const phaseRef = useRef(run.phase);

  const speakRef = useRef<((t: string) => void) | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  /** Ask whatever the run says is next, including the one seam sentence. */
  const askCurrent = useCallback((next: QuickRun) => {
    const seam = phaseRef.current !== 'lightning' && next.phase === 'lightning';
    phaseRef.current = next.phase;
    if (!next.current) return;
    const prompt =
      next.current.kind === 'probe' ? next.current.probe.prompt : `${next.current.title.title}?`;
    speakRef.current?.(seam ? `${LIGHTNING_INTRO} ${prompt}` : prompt);
  }, []);

  const finish = useCallback(async (finished: QuickRun) => {
    setScreen('saving');
    try {
      sessionStorage.removeItem(RESUME_KEY);
    } catch {
      /* private mode */
    }
    try {
      const result = await saveQuickDna({ signals: finished.signals });
      if (!result.ok) setSaveError(result.error ?? null);
    } catch {
      setSaveError('We could not save that, but your DNA is on screen.');
    }
    setScreen('summary');
  }, []);

  /** Apply a transition, then immediately ask what comes next. One place. */
  const applyRun = useCallback(
    (next: QuickRun) => {
      runRef.current = next; // synchronous: the next event must not read stale state
      setRun(next);
      setRepair(false);
      if (!next.current) void finish(next);
      else askCurrent(next);
    },
    [askCurrent, finish],
  );

  const showFlash = useCallback((text: string) => {
    setFlash(text);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS);
  }, []);

  /** Answer the question on the table, from voice or from a tap. */
  const commit = useCallback(
    (
      answer:
        | { kind: 'scale'; value: number }
        | { kind: 'ab'; option: 'a' | 'b' }
        | { kind: 'title'; reaction: 'yes' | 'no' | 'pass'; strong: boolean },
      method: 'voice' | 'tap',
      confidence?: number,
    ) => {
      const current = runRef.current;
      if (screenRef.current !== 'running' || !current.current) return;
      cancelRef.current?.(); // barge-in
      const at = Date.now();

      if (answer.kind === 'scale' && current.current.kind === 'probe') {
        showFlash(`${answer.value} ✓`);
        applyRun(answerScale(current, answer.value, at, method, confidence));
      } else if (answer.kind === 'ab' && current.current.kind === 'probe') {
        const probe = current.current.probe;
        const label = answer.option === 'a' ? probe.optionA?.label : probe.optionB?.label;
        showFlash(`${label ?? ''} ✓`);
        applyRun(answerAb(current, answer.option, at, method, confidence));
      } else if (answer.kind === 'title' && current.current.kind === 'title') {
        showFlash(`${answer.reaction.toUpperCase()} ✓`);
        applyRun(answerTitle(current, answer.reaction, answer.strong, at, method, confidence));
      }
    },
    [applyRun, showFlash],
  );

  /** Everything heard arrives here and is read against the CURRENT question. */
  const onHeard = useCallback(
    (e: HeardEvent) => {
      if (screenRef.current !== 'running') return;
      if (e.utteranceId !== undefined && e.utteranceId === lastUtterance.current) return;
      const current = runRef.current;
      const asking = current.current;
      if (!asking) return;

      const parsed =
        asking.kind === 'title'
          ? parseTitleAnswer(e.text, e.confidence)
          : asking.probe.kind === 'ab'
            ? parseAbAnswer(
                e.text,
                asking.probe.optionA?.spoken ?? [],
                asking.probe.optionB?.spoken ?? [],
                e.confidence,
              )
            : parseScaleAnswer(e.text, e.confidence);

      if (parsed.kind === 'back') {
        applyRun(goBack(current, seedProfile, Date.now()));
        return;
      }
      if (parsed.kind === 'skip') {
        applyRun(skipCurrent(current, Date.now()));
        return;
      }
      if (parsed.kind !== 'none' && isAcceptable(parsed)) {
        lastUtterance.current = e.utteranceId ?? null;
        if (parsed.kind === 'scale') commit({ kind: 'scale', value: parsed.value }, 'voice', parsed.confidence);
        else if (parsed.kind === 'ab') commit({ kind: 'ab', option: parsed.option }, 'voice', parsed.confidence);
        else commit({ kind: 'title', reaction: parsed.reaction, strong: parsed.strong }, 'voice', parsed.confidence);
        return;
      }
      // Heard something, could not use it. The shortest possible repair — not
      // an explanation of recognition confidence.
      if (e.text.trim().length >= 2) {
        setRepair(true);
        speakRef.current?.(asking.kind === 'title' ? 'Again?' : 'Number?');
      }
    },
    [applyRun, commit, seedProfile],
  );

  const { capability, speak, cancelSpeech, startListening, stopListening } = useCalibrationSpeech(onHeard);
  speakRef.current = speak;
  cancelRef.current = cancelSpeech;

  // Resume an interrupted run rather than starting over.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as QuickRun;
      if (saved && Array.isArray(saved.signals)) setRun(saved);
    } catch {
      /* unreadable — start fresh */
    }
  }, []);

  useEffect(() => {
    if (screen !== 'running') return;
    try {
      sessionStorage.setItem(RESUME_KEY, JSON.stringify(run));
    } catch {
      /* private mode */
    }
  }, [run, screen]);

  // A one-second tick drives the "seconds left" readout. Nothing else depends
  // on it, so it can never stall the loop.
  useEffect(() => {
    if (screen !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [screen]);

  const begin = useCallback(() => {
    setSaveError(null);
    setScreen('running');
    screenRef.current = 'running';
    startListening();
    const at = Date.now();
    setNow(at);
    const started = startRun(runRef.current, at);
    runRef.current = started;
    setRun(started);
    phaseRef.current = started.phase;
    // Intro and first question in ONE utterance, so there is no gap between
    // "here we go" and the first thing to answer.
    const first = started.current;
    const prompt = first ? (first.kind === 'probe' ? first.probe.prompt : `${first.title.title}?`) : '';
    const resumed = started.signals.length > 0;
    speak(resumed ? prompt : `${QUICK_DNA_INTRO} ${prompt}`);
  }, [speak, startListening]);

  useEffect(() => {
    if (screen === 'saving' || screen === 'summary') stopListening();
  }, [screen, stopListening]);

  if (screen === 'saving' || screen === 'summary') {
    return (
      <QuickDnaSummary
        profile={run.profile}
        signals={run.signals}
        elapsedMs={elapsedMs(run, now)}
        saving={screen === 'saving'}
        error={saveError}
        onShowPicks={() => router.push('/app')}
        onDeepDna={() => router.push('/voice-dna/deep')}
      />
    );
  }

  if (screen === 'ready') {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center gap-6 px-5 text-center">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Quick DNA</h1>
        <p className="max-w-sm text-slate-300">
          About a minute. I ask, you answer, hands down.
        </p>
        <button type="button" data-testid="quickdna-start" onClick={begin} className="btn-primary px-12 py-4 text-lg">
          Start
        </button>
        {!capability.asr && (
          <p className="text-sm text-slate-400" data-testid="tap-only-notice">
            Your browser can&rsquo;t listen — tap your answers instead. Everything else is the same.
          </p>
        )}
      </div>
    );
  }

  const asking = run.current;
  const secondsLeft = Math.ceil(remainingMs(run, now) / 1000);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center gap-7 px-5">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span data-testid="quickdna-progress">
          {signalCount(run)} signals · ~{secondsLeft}s left
        </span>
        <span data-testid="quickdna-listening" className="text-emerald-300/80">
          {flash ? <span data-testid="quickdna-flash">{flash}</span> : 'Listening…'}
        </span>
      </div>

      {asking?.kind === 'probe' && asking.probe.kind === 'scale' && (
        <>
          <h2
            data-testid="quickdna-question"
            data-question-id={asking.probe.id}
            data-question-kind="scale"
            className="text-4xl font-bold uppercase tracking-tight text-white sm:text-5xl"
          >
            {asking.probe.label}
          </h2>
          <div className="grid grid-cols-11 gap-1 sm:gap-2" role="group" aria-label="Rate 0 to 10">
            {SCALE.map((n) => (
              <button
                key={n}
                type="button"
                data-testid={`rate-${n}`}
                aria-label={`Rate ${n}`}
                onClick={() => commit({ kind: 'scale', value: n }, 'tap')}
                className="flex aspect-square items-center justify-center rounded-lg bg-white/10 text-lg font-bold tabular-nums text-white hover:bg-white/20 active:bg-white/30 sm:text-2xl"
              >
                {n}
              </button>
            ))}
          </div>
        </>
      )}

      {asking?.kind === 'probe' && asking.probe.kind === 'ab' && (
        <>
          <h2
            data-testid="quickdna-question"
            data-question-id={asking.probe.id}
            data-question-kind="ab"
            className="text-3xl font-bold text-white sm:text-4xl"
          >
            {asking.probe.label}
          </h2>
          <div className="flex gap-3">
            <button
              type="button"
              data-testid="ab-a"
              onClick={() => commit({ kind: 'ab', option: 'a' }, 'tap')}
              className="btn-primary grow py-5 text-lg"
            >
              {asking.probe.optionA?.label}
            </button>
            <button
              type="button"
              data-testid="ab-b"
              onClick={() => commit({ kind: 'ab', option: 'b' }, 'tap')}
              className="grow rounded-lg bg-white/10 py-5 text-lg font-semibold text-white hover:bg-white/20"
            >
              {asking.probe.optionB?.label}
            </button>
          </div>
        </>
      )}

      {asking?.kind === 'title' && (
        <>
          <p className="text-sm uppercase tracking-widest text-slate-400">Lightning round</p>
          <h2
            data-testid="quickdna-question"
            data-question-id={asking.title.id}
            data-question-kind="title"
            className="text-4xl font-bold text-white sm:text-5xl"
          >
            {asking.title.title}
          </h2>
          <div className="flex gap-2">
            <button type="button" data-testid="title-yes" onClick={() => commit({ kind: 'title', reaction: 'yes', strong: false }, 'tap')} className="btn-primary grow py-5 text-lg">
              Yes
            </button>
            <button type="button" data-testid="title-no" onClick={() => commit({ kind: 'title', reaction: 'no', strong: false }, 'tap')} className="grow rounded-lg bg-white/10 py-5 text-lg font-semibold text-white hover:bg-white/20">
              No
            </button>
            <button type="button" data-testid="title-pass" onClick={() => commit({ kind: 'title', reaction: 'pass', strong: false }, 'tap')} className="grow rounded-lg bg-white/5 py-5 text-sm font-semibold text-slate-300 hover:bg-white/10">
              Haven&rsquo;t seen
            </button>
          </div>
        </>
      )}

      {repair && (
        <p data-testid="quickdna-repair" className="text-center text-sm text-amber-200">
          {asking?.kind === 'title' ? 'Again?' : 'Number?'}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="quickdna-back"
          onClick={() => applyRun(goBack(run, seedProfile, Date.now()))}
          disabled={run.signals.length === 0}
          className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-30"
        >
          Back
        </button>
        <button
          type="button"
          data-testid="quickdna-skip"
          onClick={() => applyRun(skipCurrent(run, Date.now()))}
          className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
