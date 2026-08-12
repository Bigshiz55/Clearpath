'use client';

/**
 * THE 1–10 MOMENT.
 *
 * The game stops, once, because it has something specific to admit: it could
 * not work an axis out from the choices alone. That admission is the reason
 * this does not feel like a form — the screen names the contradiction before it
 * asks anything, and the question is the only thing on it.
 *
 * TEN TAP TARGETS, NOT A SLIDER. A drag is a fiddly, imprecise gesture on a
 * phone and it invites the player to fine-tune a number they do not have an
 * opinion about to that resolution. Ten buttons are one confident thumb tap,
 * they read as a game rather than a settings panel, and they keep the whole
 * interaction inside the tempo of the rest of the round.
 *
 * THE ANSWER IS ACKNOWLEDGED. On tap the scale resolves to the chosen value and
 * states what it settled — "Strong yes. That settles 3 split decisions." — then
 * hands back. A number that disappears silently teaches the player that the
 * question was busywork.
 */

import { useState } from 'react';
import type { CalibrationQuestion } from '@/lib/showdown/calibration';
import { calibrationResolution } from '@/lib/showdown/calibration';

const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Long enough to read the resolution, short enough not to break tempo. */
const ACK_MS = 900;

export function CalibrationCard({
  question,
  onAnswer,
  onSkip,
}: {
  question: CalibrationQuestion;
  onAnswer: (value: number) => void;
  onSkip: () => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null);

  function pick(value: number) {
    if (chosen !== null) return;
    setChosen(value);
    window.setTimeout(() => onAnswer(value), ACK_MS);
  }

  return (
    <section
      data-testid="showdown-calibration"
      data-axis={question.key}
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-1"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-[0.6rem] font-black uppercase tracking-[0.3em] text-amber-300">
          One thing we can&rsquo;t call
        </p>
        {/* THE CONTRADICTION, STATED. This is what makes the question worth
            answering rather than an interruption. */}
        <h2
          data-testid="showdown-calibration-prompt"
          className="text-balance text-xl font-black leading-tight tracking-tight text-white sm:text-3xl"
        >
          {question.prompt}
        </h2>
      </div>

      <div className="w-full max-w-lg">
        <div className="grid grid-cols-10 gap-1 sm:gap-1.5" role="group" aria-label={question.label}>
          {VALUES.map((v) => {
            const isChosen = chosen === v;
            const dulled = chosen !== null && !isChosen;
            return (
              <button
                key={v}
                type="button"
                data-testid="showdown-calibration-value"
                data-value={v}
                aria-label={`${v} out of 10`}
                disabled={chosen !== null}
                onClick={() => pick(v)}
                className={[
                  'min-h-[52px] rounded-lg text-sm font-black tabular-nums transition-all duration-200',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-white',
                  isChosen
                    ? 'scale-110 bg-amber-300 text-ink-900 ring-2 ring-amber-200'
                    : dulled
                      ? 'bg-white/[0.04] text-slate-600'
                      : 'bg-white/[0.07] text-white ring-1 ring-white/10 active:scale-95 active:bg-amber-400/30',
                ].join(' ')}
              >
                {v}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between px-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-slate-500">
          <span>Never</span>
          <span>As much as possible</span>
        </div>
      </div>

      {/* THE PAYOFF LINE — proof the answer refined something real. */}
      <p
        data-testid="showdown-calibration-resolution"
        aria-live="polite"
        className={`h-5 text-center text-sm font-bold text-amber-200 transition-opacity duration-200 ${
          chosen === null ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {chosen === null ? ' ' : calibrationResolution(question, chosen)}
      </p>

      <button
        type="button"
        data-testid="showdown-calibration-skip"
        onClick={onSkip}
        disabled={chosen !== null}
        className="min-h-[44px] rounded-xl px-4 text-sm font-semibold text-slate-400 ring-1 ring-white/10 transition active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-0"
      >
        Depends too much on the film
      </button>
    </section>
  );
}
