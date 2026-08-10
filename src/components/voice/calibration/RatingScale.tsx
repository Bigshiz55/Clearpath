'use client';

/**
 * THE 0–10 ROW.
 *
 * The voice path is the fast path, not the only path — this is always on
 * screen, always live, and big enough to hit with a thumb without looking. A
 * microphone that mishears, a noisy room, or a browser with no recognition at
 * all must never strand anyone, so the entire calibration is completable here.
 *
 * `locked` is the confirmation beat: the instant an answer is accepted the
 * chosen number lights up and the row freezes for a fraction of a second, so
 * the user sees WHAT was heard before the next item replaces it. Without that
 * the run is fast but blind, and a mishearing becomes invisible.
 */

import { RATING_MAX, RATING_MIN } from '@/lib/voice/calibration/items';

const VALUES = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MIN + i);

export function RatingScale({
  onPick,
  locked,
  disabled,
}: {
  onPick: (value: number) => void;
  /** The value just accepted, shown lit while the run advances. */
  locked: number | null;
  disabled?: boolean;
}) {
  return (
    <div
      className="grid w-full grid-cols-11 gap-1 sm:gap-2"
      role="group"
      aria-label="Rate from 0 to 10"
      data-testid="rating-scale"
    >
      {VALUES.map((n) => {
        const isLocked = locked === n;
        return (
          <button
            key={n}
            type="button"
            data-testid={`rate-${n}`}
            aria-label={`Rate ${n}`}
            disabled={disabled}
            onClick={() => onPick(n)}
            className={[
              'flex aspect-square items-center justify-center rounded-lg text-lg font-bold tabular-nums',
              'transition-colors duration-100 sm:text-2xl',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300',
              isLocked
                ? 'bg-emerald-400 text-slate-950 ring-2 ring-emerald-200'
                : 'bg-white/10 text-white hover:bg-white/20 active:bg-white/30',
              disabled && !isLocked ? 'opacity-40' : '',
            ].join(' ')}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
