'use client';

/**
 * 60-SECOND VOICE DNA — the run.
 *
 * One short sentence of explanation, then fifteen one-word prompts and nothing
 * else. No acknowledgement after an answer, no "interesting", no repeating the
 * number back. Every one of those costs a second and there are only sixty.
 *
 * The loop, per item:
 *   speak the prompt (never awaited) — the label and the 0–10 row are ALREADY
 *   on screen, so the item is answerable before the audio starts
 *     → a number arrives, spoken or tapped
 *     → cancel speech mid-word, light the number, advance after one frame of
 *       confirmation
 *
 * Speech and tap are the same path: both end at `commit`, so there is exactly
 * one place where an answer becomes a fact, and the tests that drive it by
 * dispatching a transcript are exercising the real code.
 *
 * WHAT MAKES IT FEEL FAST is mostly what is missing. The prompt is not awaited.
 * The next item renders immediately. Recognition never stops. The only
 * deliberate delay in the file is `LOCK_MS`, and it exists so a mishearing is
 * visible rather than silent.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CALIBRATION_INTRO, REASK_LINE } from '@/lib/voice/calibration/items';
import {
  ACCEPT_THRESHOLD,
  combinedConfidence,
  parseRating,
} from '@/lib/voice/calibration/parseRating';
import {
  answerCurrent,
  createRun,
  currentItem,
  goBack,
  isComplete,
  orderedAnswers,
  progress,
  ratingsById,
  reaskCurrent,
  skipCurrent,
  type CalibrationRun,
  type InputMethod,
} from '@/lib/voice/calibration/machine';
import { recordCalibrationFollowup, saveCalibration } from '@/lib/actions/voiceCalibration';
import type { AmbiguityQuestion } from '@/lib/voice/calibration/ambiguity';
import { RatingScale } from './RatingScale';
import { CalibrationSummary } from './CalibrationSummary';
import { useCalibrationSpeech, type HeardEvent } from './useCalibrationSpeech';

type Phase = 'ready' | 'running' | 'followups' | 'saving' | 'summary';

/** How long the accepted number stays on screen as "8 ✓". Purely feedback. */
const FLASH_MS = 700;

/**
 * ONE UTTERANCE, ONE ANSWER. A recogniser refines a single spoken word across
 * several events, and every one of them can parse to the same number; without
 * this, saying "eight" once would answer two items. Collapsing on the
 * recogniser's own utterance identity — rather than on a time window — is what
 * lets someone answer two items "five, five" as fast as they like and still
 * have both land.
 */

/** Where an interrupted run is kept, so a reload resumes instead of restarting. */
const RESUME_KEY = 'watchverdict:calibration:v1';

export function RapidCalibration() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('ready');
  const [run, setRun] = useState<CalibrationRun>(() => createRun(0));
  const [locked, setLocked] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [reasking, setReasking] = useState(false);
  const [followups, setFollowups] = useState<AmbiguityQuestion[]>([]);
  const [followupIndex, setFollowupIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The loop reads these inside speech callbacks, which are created once. Refs
  // keep those closures looking at live values instead of the first render's.
  const runRef = useRef(run);
  runRef.current = run;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const startedAtRef = useRef<number | null>(null);
  const committedUtteranceRef = useRef<string | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const finish = useCallback(async (finished: CalibrationRun) => {
    setPhase('saving');
    const started = startedAtRef.current;
    if (started !== null) setElapsedMs(Date.now() - started);
    try {
      sessionStorage.removeItem(RESUME_KEY);
    } catch {
      /* private mode */
    }
    try {
      const result = await saveCalibration({ answers: orderedAnswers(finished) });
      if (result.ok) {
        setFollowups(result.questions ?? []);
      } else {
        setError(result.error ?? null);
      }
    } catch {
      setError('We could not save that, but your answers are on screen.');
    }
    setPhase((p) => (p === 'saving' ? 'summary' : p));
  }, []);

  /**
   * THE ONE PLACE AN ANSWER BECOMES A FACT. Voice and tap both land here, so
   * they cannot drift apart.
   *
   * NOTHING BLOCKS. The run advances synchronously — including `runRef`, which
   * the speech callback reads — so a second answer arriving in the same tick
   * sees the item it actually belongs to. An earlier version deferred the
   * advance behind a 220ms "locked" animation and dropped anything spoken
   * during it, which silently ate answers from exactly the fast, barge-in
   * users this whole design is for.
   */
  const commit = useCallback(
    (value: number, method: InputMethod, confidence?: number) => {
      if (phaseRef.current !== 'running') return;
      const current = runRef.current;
      if (isComplete(current)) return;

      cancelSpeechRef.current?.(); // barge-in: stop talking mid-word
      setLocked(value);
      setFlash(`${value}`);
      setReasking(false);

      const next = answerCurrent(current, value, Date.now(), method, confidence);
      runRef.current = next; // synchronous, so the next event is not stale
      setRun(next);

      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => {
        setFlash(null);
        setLocked(null);
      }, FLASH_MS);

      if (isComplete(next)) void finish(next);
      else speakRef.current?.(currentItem(next)?.prompt ?? '');
    },
    [finish],
  );

  /** Back and Skip: move without recording a number, and stop talking first. */
  const advanceBy = useCallback(
    (mutate: (r: CalibrationRun) => CalibrationRun) => {
      if (phaseRef.current !== 'running') return;
      cancelSpeechRef.current?.();
      setReasking(false);
      setFlash(null);
      setLocked(null);
      const next = mutate(runRef.current);
      runRef.current = next;
      setRun(next);
      if (isComplete(next)) void finish(next);
      else speakRef.current?.(currentItem(next)?.prompt ?? '');
    },
    [finish],
  );

  /** Everything heard, spoken or injected, arrives here. */
  const onHeard = useCallback(
    (e: HeardEvent) => {
      if (phaseRef.current !== 'running') return;
      // Already answered by an earlier fragment of this same utterance.
      if (e.utteranceId !== undefined && e.utteranceId === committedUtteranceRef.current) return;
      const parsed = parseRating(e.text);
      if (parsed.intent === 'back') {
        advanceBy(goBack);
        return;
      }
      if (parsed.intent === 'skip') {
        advanceBy((r) => skipCurrent(r, Date.now(), 'voice'));
        return;
      }
      if (parsed.intent === 'rating' && parsed.value !== null) {
        const confidence = combinedConfidence(parsed, e.confidence);
        if (confidence >= ACCEPT_THRESHOLD) {
          committedUtteranceRef.current = e.utteranceId ?? null;
          commit(parsed.value, 'voice', confidence);
          return;
        }
      }
      if (parsed.intent === 'none' && !parsed.value) {
        // Silence and stray words are not failures — only a heard-but-unreadable
        // utterance earns a re-ask, or we would nag at background noise.
        if (e.text.trim().length < 2) return;
      }
      const { run: after, exhausted } = reaskCurrent(runRef.current);
      runRef.current = after;
      setRun(after);
      if (!exhausted) {
        setReasking(true);
        speakRef.current?.(REASK_LINE);
      } else {
        // Stop talking at them. The buttons are right there.
        setReasking(true);
      }
    },
    [advanceBy, commit],
  );

  const { capability, speak, cancelSpeech, startListening, stopListening } = useCalibrationSpeech(onHeard);
  const speakRef = useRef(speak);
  speakRef.current = speak;
  const cancelSpeechRef = useRef(cancelSpeech);
  cancelSpeechRef.current = cancelSpeech;

  // Resume an interrupted run — a reload mid-calibration must not start over.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as CalibrationRun;
      if (saved && typeof saved.index === 'number' && saved.answers) setRun(saved);
    } catch {
      /* unreadable or private mode — start fresh */
    }
  }, []);

  useEffect(() => {
    if (phase !== 'running') return;
    try {
      sessionStorage.setItem(RESUME_KEY, JSON.stringify(run));
    } catch {
      /* private mode */
    }
  }, [run, phase]);

  const start = useCallback(() => {
    setError(null);
    setPhase('running');
    phaseRef.current = 'running';
    startedAtRef.current = Date.now();
    startListening();
    const item = currentItem(runRef.current);
    // The intro and the first prompt are one utterance so there is no gap
    // between them — and a resumed run skips the explanation entirely.
    const resumed = runRef.current.index > 0;
    speak(resumed ? (item?.prompt ?? '') : `${CALIBRATION_INTRO} ${item?.prompt ?? ''}`);
  }, [speak, startListening]);

  useEffect(() => {
    if (phase === 'summary' || phase === 'saving') stopListening();
  }, [phase, stopListening]);

  const item = currentItem(run);
  const { position, total } = progress(run);

  if (phase === 'summary' || phase === 'saving') {
    return (
      <CalibrationSummary
        ratings={ratingsById(run)}
        elapsedMs={elapsedMs}
        saving={phase === 'saving'}
        error={error}
        followups={followups}
        followupIndex={followupIndex}
        onAnswerFollowup={(question, positive) => {
          setFollowupIndex((i) => i + 1);
          // Fire-and-forget: the next screen is already up, and a failed write
          // must not hold a person on a question they have finished answering.
          void recordCalibrationFollowup({ questionId: question.id, positive });
        }}
        onShowPicks={() => router.push('/app')}
        onFineTune={() => router.push('/voice-dna/deep')}
      />
    );
  }

  if (phase === 'ready') {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center gap-6 px-5 text-center">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">60-second Voice DNA</h1>
        <p className="max-w-md text-slate-300">
          Fifteen quick ones. Rate each from 0 to 10 — say the number or tap it.
        </p>
        <button
          type="button"
          data-testid="calibration-start"
          onClick={start}
          className="btn-primary px-10 py-4 text-lg"
        >
          Start
        </button>
        {!capability.asr && (
          <p className="text-sm text-slate-400" data-testid="tap-only-notice">
            Your browser can&rsquo;t listen — tap your answers instead. It works exactly the same.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center gap-8 px-5">
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span data-testid="calibration-progress">
          {position} of {total}
        </span>
        {flash && (
          <span data-testid="heard-flash" className="font-semibold text-emerald-300">
            {flash} ✓
          </span>
        )}
      </div>

      <h2
        data-testid="calibration-item"
        data-item-id={item?.id ?? ''}
        className="text-4xl font-bold uppercase tracking-tight text-white sm:text-6xl"
      >
        {item?.label ?? ''}
      </h2>

      <RatingScale onPick={(v) => commit(v, 'tap')} locked={locked} />

      {reasking && (
        <p data-testid="reask-line" className="text-center text-sm text-amber-200">
          {REASK_LINE}
        </p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          data-testid="calibration-back"
          onClick={() => advanceBy(goBack)}
          disabled={run.index === 0}
          className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/10 disabled:opacity-30"
        >
          Back
        </button>
        <button
          type="button"
          data-testid="calibration-skip"
          onClick={() => advanceBy((r) => skipCurrent(r, Date.now(), 'tap'))}
          className="rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
