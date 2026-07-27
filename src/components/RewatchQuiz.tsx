'use client';

/**
 * THE REWATCH QUIZ, ON SCREEN.
 *
 * The Quick Taste Quiz's interaction rules, deliberately reused rather than
 * reinvented — same four answers, same append-only log, same Back that genuinely
 * reverses, same one-card-on-a-phone. What changes is the subject.
 *
 * Two lessons the taste quiz paid for and this one inherits:
 *   • The question list is chosen ONCE. Re-deriving it per render reshuffles the
 *     quiz under the user's hands and re-runs the restore effect.
 *   • The log is the state. Back drops the last answer and everything derived is
 *     rebuilt from scratch, so undo actually undoes.
 */
import Link from 'next/link';
import { useState } from 'react';
import {
  REWATCH_SESSION_LENGTH,
  answersToRewatchProfile,
  describeRewatchProfile,
  selectRewatchQuestions,
  type RewatchAnswer,
} from '@/lib/reverdict/rewatchQuiz';
import { RESPONSE_ORDER, RESPONSE_VALUES, type ResponseKey } from '@/lib/taste/quickQuiz';
import { getRewatchAnswers, saveRewatchAnswers } from '@/lib/rewatchProfileStore';

/** Same tones as the taste quiz, so the four answers read identically. */
const RESPONSE_STYLE: Record<ResponseKey, string> = {
  exactly: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100',
  mostly: 'border-brand-400/50 bg-brand-500/15 text-brand-100',
  depends: 'border-amber-400/50 bg-amber-500/15 text-amber-100',
  not_me: 'border-rose-400/50 bg-rose-500/15 text-rose-100',
};

export function RewatchQuiz() {
  // Chosen ONCE — see the header note.
  const [questions] = useState(() => selectRewatchQuestions({ asked: getRewatchAnswers().map((a) => a.questionId) }));
  const [answers, setAnswers] = useState<RewatchAnswer[]>([]);
  const [done, setDone] = useState(false);

  const current = answers.length;
  const question = questions[current];
  const profile = answersToRewatchProfile(answers);

  function answer(response: ResponseKey) {
    if (!question) return;
    setAnswers((prev) => [...prev, { questionId: question.id, response, at: Date.now() }]);
  }

  function back() {
    setAnswers((prev) => prev.slice(0, -1));
  }

  function finish() {
    // Merge with anything answered in an earlier sitting — the bank never
    // re-asks an answered id, so these cannot collide.
    saveRewatchAnswers([...getRewatchAnswers(), ...answers]);
    setDone(true);
  }

  if (questions.length === 0) {
    return (
      <div className="card p-6 text-center" data-testid="rewatch-quiz-exhausted">
        <div className="text-3xl">✅</div>
        <h2 className="mt-2 text-xl font-bold text-white">You have answered the whole bank</h2>
        <p className="mt-1 text-sm text-slate-400">{describeRewatchProfile(answersToRewatchProfile(getRewatchAnswers()))}</p>
        <Link href="/app/reverdict" className="btn-primary mt-4 inline-flex">Back to the re-Verd1ct →</Link>
      </div>
    );
  }

  if (done || !question) {
    const saved = answersToRewatchProfile(getRewatchAnswers());
    return (
      <div className="card p-6" data-testid="rewatch-quiz-done">
        <div className="text-xs font-black uppercase tracking-[0.15em] text-amber-300">Here is how you rewatch</div>
        <h2 className="mt-1 text-2xl font-black text-white">{describeRewatchProfile(saved)}</h2>
        <p className="mt-2 text-sm text-slate-400">
          This can move a rewatch score by up to 10 points either way — never more. The call still rests
          on your own rating and how long it has been.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/app/reverdict" className="btn-primary inline-flex min-h-[44px] items-center px-5">
            Deliver a re-Verd1ct →
          </Link>
          <Link
            href="/app/watchlist"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            Find things to put up for a rewatch
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="rewatch-quiz">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-400" data-testid="rewatch-progress">
          {current + 1} of {Math.min(questions.length, REWATCH_SESSION_LENGTH)}
        </div>
        {current > 0 && (
          <button
            type="button"
            onClick={back}
            data-testid="rewatch-back"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
          >
            ← Back
          </button>
        )}
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-amber-400 transition-all"
          style={{ width: `${(current / Math.min(questions.length, REWATCH_SESSION_LENGTH)) * 100}%` }}
        />
      </div>

      <div className="card mt-4 p-5" data-testid={`rewatch-q-${question.id}`}>
        <p className="text-lg font-bold leading-snug text-white sm:text-xl">{question.prompt}</p>

        {/* 2×2 so four answers never overflow a 320px screen in one row. */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          {RESPONSE_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => answer(key)}
              data-testid={`rewatch-answer-${key}`}
              className={`min-h-[56px] rounded-xl border-2 px-3 text-base font-bold transition hover:brightness-125 ${RESPONSE_STYLE[key]}`}
            >
              {RESPONSE_VALUES[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500" data-testid="rewatch-live-profile">
          {describeRewatchProfile(profile)}
        </p>
        {current > 0 && (
          <button
            type="button"
            onClick={finish}
            data-testid="rewatch-finish"
            className="inline-flex min-h-[44px] items-center rounded-lg border-2 border-amber-200/60 bg-gradient-to-b from-amber-400 to-amber-600 px-5 text-sm font-black text-white transition hover:brightness-110"
          >
            Done — save this
          </button>
        )}
      </div>
    </div>
  );
}
