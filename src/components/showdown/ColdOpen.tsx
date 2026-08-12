'use client';

/**
 * THE FIRST FIVE SECONDS.
 *
 * There was no opening. The component mounted straight into `screen='playing'`
 * and the player's first sight of the flagship game was a 0.6rem uppercase
 * label, a hairline progress bar reading 0/12, and two posters sharing a row
 * with a set of meters. It read as a diagnostic, because structurally that is
 * what it was.
 *
 * WHAT AN OPENING HAS TO DO, and it is only three things:
 *
 *   SAY WHAT THE GAME IS, in one sentence a player believes: make instinctive
 *   choices, and WatchVerd1ct works out what you actually like. No percentages,
 *   no axis counts, no "calibration" — those are our words for our machinery
 *   and they belong nowhere near the front door.
 *
 *   PROVE IT IS ABOUT FILMS. The posters drift in behind the copy before the
 *   player has done anything, so the screen is already showing the material it
 *   is going to ask about. An empty gradient with a button on it promises
 *   nothing.
 *
 *   HAVE ONE OBVIOUS THING TO DO. One CTA, large, thumb-height, and nothing
 *   competing with it.
 *
 * NO FAKE METRICS. The old header claimed "Taste DNA 0% → 0%" before a single
 * tap. A number that cannot move is worse than no number, and a number that
 * starts at zero tells a new player their taste is worth nothing.
 *
 * REDUCED MOTION IS A REAL MODE, not a degradation: the drift and the stagger
 * are the only things that go, and the composition is designed to still read
 * without them.
 */

import { useEffect, useState } from 'react';
import { tmdbImage } from '@/lib/tmdb/image';

/** Enough to register as deliberate, short enough that nobody waits for it. */
const REVEAL_MS = 60;

export function ColdOpen({
  posterPaths,
  returning,
  onStart,
}: {
  /** A handful of real poster paths from the verified catalogue. May be empty. */
  posterPaths: readonly string[];
  /** True when this player already has a Taste DNA worth building on. */
  returning: boolean;
  onStart: () => void;
}) {
  const [lit, setLit] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setLit(true), REVEAL_MS);
    return () => window.clearTimeout(t);
  }, []);

  const backdrop = posterPaths.slice(0, 5);

  return (
    <section
      data-testid="showdown-cold-open"
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-5 py-10"
    >
      {/* THE MATERIAL, BEHIND THE PROMISE. Real posters from the verified
          catalogue — never placeholders, because a placeholder in the opening
          of a film game is the first thing a player notices. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="flex gap-3 opacity-[0.18] blur-[1px] sm:gap-5">
          {backdrop.map((p, i) => (
            <div
              key={p}
              className={[
                'w-28 shrink-0 overflow-hidden rounded-xl sm:w-40 lg:w-52',
                'transition-all duration-[1200ms] ease-out motion-reduce:transition-none',
                lit ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
              ].join(' ')}
              style={{
                transitionDelay: `${i * 90}ms`,
                transform: `rotate(${(i - 2) * 3}deg)`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tmdbImage(p, 'w342') ?? ''} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink-900/60 via-ink-900/85 to-ink-900" />

      <div
        className={[
          'relative flex w-full max-w-xl flex-col items-center gap-6 text-center',
          'transition-all duration-500 ease-out motion-reduce:transition-none',
          lit ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
        ].join(' ')}
      >
        <p className="text-[0.65rem] font-black uppercase tracking-[0.4em] text-amber-300">
          {returning ? 'Round two' : 'WatchVerd1ct'}
        </p>

        <h1 className="text-balance text-4xl font-black leading-[0.95] tracking-tight text-white sm:text-6xl">
          Which would you
          <br />
          <span className="text-amber-300">rather watch?</span>
        </h1>

        {/* THE PROMISE, IN THE PLAYER'S WORDS. */}
        <p className="text-balance text-base leading-snug text-slate-300 sm:text-lg">
          {returning
            ? 'Pick fast and go with your gut. We already know a fair bit about you — this is where we find the edges.'
            : 'Pick fast and go with your gut. No right answers. By the end we can tell you what you actually like, and why.'}
        </p>

        <button
          type="button"
          data-testid="showdown-start"
          onClick={onStart}
          autoFocus
          className="mt-2 min-h-[60px] w-full max-w-sm rounded-2xl bg-amber-300 px-8 text-lg font-black uppercase tracking-wide text-ink-900 shadow-[0_10px_40px_-10px_rgba(252,211,77,0.7)] transition active:scale-[0.97] hover:bg-amber-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
        >
          {returning ? 'Keep going' : 'Start'}
        </button>

        <p className="text-xs font-semibold text-slate-500">
          About a minute · {returning ? 'builds on what you already taught us' : 'nothing to sign up for'}
        </p>
      </div>
    </section>
  );
}
