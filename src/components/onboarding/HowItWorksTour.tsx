'use client';

/**
 * THE TOUR — an explicit, opt-in walkthrough, not an auto-shown banner.
 *
 * An earlier welcome-tour strip lived inline on the home hub and showed
 * itself to everyone automatically; it was removed for
 * taking up permanent real estate on a screen most returning users no longer
 * needed. This one only ever appears because someone tapped a button that
 * says what it does — reachable from the nav's "How it works" entry at any
 * time, and from a small, self-dismissing hint on the home hub for people who
 * have never opened it (see TourHint.tsx). Nobody sees it twice against
 * their will.
 *
 * Content lives in tourSteps.ts, kept separate from this stepper shell so the
 * copy is one plain array, not JSX buried in component logic.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { TOUR_STEPS } from './tourSteps';

const SEEN_KEY = 'wv.tour.seen.v1';

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode — the hint just shows again next session, harmless */
  }
}

export function HowItWorksTour() {
  const [index, setIndex] = useState(0);
  const step = TOUR_STEPS[index]!;
  const isFirst = index === 0;
  const isLast = index === TOUR_STEPS.length - 1;

  function next() {
    if (isLast) {
      markSeen();
      return;
    }
    setIndex((i) => Math.min(i + 1, TOUR_STEPS.length - 1));
  }
  function back() {
    setIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      {/* PROGRESS DOTS — tappable, so someone who already knows step 2 can
          jump straight to step 4 instead of stepping through in order. */}
      <div className="mb-5 flex items-center justify-center gap-1.5" data-testid="tour-dots">
        {TOUR_STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Go to step ${i + 1}: ${s.title}`}
            aria-current={i === index ? 'step' : undefined}
            className={`h-2 rounded-full transition-all ${
              i === index ? 'w-6 bg-[#ff1493]' : 'w-2 bg-white/20 hover:bg-white/35'
            }`}
          />
        ))}
      </div>

      <div className="card wv-tile p-6 text-center sm:p-8" data-testid={`tour-step-${step.id}`}>
        <span aria-hidden className="text-5xl">
          {step.icon}
        </span>
        <h1 className="mt-4 text-2xl font-black text-white sm:text-3xl">{step.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-slate-300">{step.body}</p>

        {step.bullets && step.bullets.length > 0 && (
          <ul className="mx-auto mt-4 max-w-md space-y-2 text-left">
            {step.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-sm text-slate-300">
                <Check aria-hidden className="mt-0.5 h-4 w-4 flex-none text-[#ff1493]" strokeWidth={3} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}

        {step.actions && step.actions.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {step.actions.map((a, i) => (
              <Link
                key={a.href + a.label}
                href={a.href}
                onClick={markSeen}
                data-testid={`tour-action-${step.id}`}
                className={i === 0 ? 'btn-primary px-4 py-2 text-sm' : 'btn-ghost px-4 py-2 text-sm'}
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={back}
          disabled={isFirst}
          data-testid="tour-back"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" /> Back
        </button>

        <span className="text-xs font-semibold text-slate-500">
          {index + 1} of {TOUR_STEPS.length}
        </span>

        {isLast ? (
          <Link
            href="/app"
            onClick={markSeen}
            data-testid="tour-finish"
            className="btn-primary inline-flex min-h-[44px] items-center gap-1.5 px-4 text-sm"
          >
            Got it <Check aria-hidden className="h-4 w-4" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={next}
            data-testid="tour-next"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#ff1493] px-4 text-sm font-black text-white ring-1 ring-pink-200/60 transition hover:brightness-110 active:scale-95"
          >
            Next <ArrowRight aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>

      {!isLast && (
        <div className="mt-3 text-center">
          <Link
            href="/app"
            onClick={markSeen}
            data-testid="tour-skip"
            className="text-xs font-semibold text-slate-500 underline underline-offset-2 hover:text-slate-300"
          >
            Skip the tour
          </Link>
        </div>
      )}
    </div>
  );
}

export { SEEN_KEY };
