'use client';

import { useEffect, useMemo, useState } from 'react';
import { revealTimeline, type RevealTimeline } from '@/lib/court/verdictReveal';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface VerdictRevealState {
  revealedJurors: number;
  revealedVetoes: number;
  winnerRevealed: boolean;
  /** True once every stage has fired. */
  done: boolean;
}

/**
 * Drives the Verd1ct reveal from `revealTimeline`'s pure offsets — every
 * piece of data is already on the client in full; this only decides WHEN each
 * becomes visible, purely presentational (see verdictReveal.ts for why).
 *
 * Restarts from zero whenever `jurorCount`/`vetoCount` change, so a fresh
 * Verd1ct (an appeal promoting the next candidate) replays the sequence
 * rather than being stuck mid-reveal from the previous one.
 */
export function useVerdictReveal(jurorCount: number, vetoCount: number): VerdictRevealState {
  // Read once per mount — a user does not toggle this setting mid-reveal, and
  // re-reading on every render would fight the timeline's own memoization.
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const timeline: RevealTimeline = useMemo(
    () => revealTimeline(jurorCount, vetoCount, reduced),
    [jurorCount, vetoCount, reduced],
  );

  const [revealedJurors, setRevealedJurors] = useState(reduced ? jurorCount : 0);
  const [revealedVetoes, setRevealedVetoes] = useState(reduced ? vetoCount : 0);
  const [winnerRevealed, setWinnerRevealed] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      // Instant reveal: same final state, no staged wait.
      setRevealedJurors(jurorCount);
      setRevealedVetoes(vetoCount);
      setWinnerRevealed(true);
      return;
    }
    setRevealedJurors(0);
    setRevealedVetoes(0);
    setWinnerRevealed(false);

    const timers: ReturnType<typeof setTimeout>[] = [];
    timeline.jurorAt.forEach((ms, i) => {
      timers.push(setTimeout(() => setRevealedJurors((n) => Math.max(n, i + 1)), ms));
    });
    timeline.vetoAt.forEach((ms, i) => {
      timers.push(setTimeout(() => setRevealedVetoes((n) => Math.max(n, i + 1)), ms));
    });
    timers.push(setTimeout(() => setWinnerRevealed(true), timeline.winnerAt));

    return () => timers.forEach(clearTimeout);
    // `timeline` is a derived, memoized object keyed on the same inputs —
    // depending on it (rather than jurorCount/vetoCount/reduced directly)
    // keeps this effect's dependency list honest without re-deriving it here.
  }, [timeline, jurorCount, vetoCount, reduced]);

  return { revealedJurors, revealedVetoes, winnerRevealed, done: winnerRevealed };
}
