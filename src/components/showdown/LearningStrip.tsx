'use client';

/**
 * THE THING THAT REPLACED "38% → 38%".
 *
 * That readout was worse than nothing. It occupied the most valuable space on
 * the screen to tell the player, in the product's own words, that the last
 * twenty taps had accomplished exactly zero — and it was doing that while the
 * engine was in fact learning, because a single global percentage over
 * twenty-eight axes cannot move visibly from one answer. A number that only
 * ever shows 0 is not a progress indicator, it is a claim that nothing is
 * happening.
 *
 * So this shows WHERE the learning went, not how much of it there was in total.
 * Four meters over the clusters a person can recognise themselves in, each one
 * a measured coverage figure from the same `clusterReadout` the results screen
 * uses. One good answer visibly moves one bar, because one good answer really
 * does resolve one part of somebody rather than one twenty-eighth of all of
 * them.
 *
 * THE FLASH IS THE POINT. A bar that grows silently is a bar nobody watches.
 * When a cluster gains, its meter pulses once — the only animation in the game
 * whose job is to say "that answer mattered", tied to a real delta so it can
 * never fire for a round that taught us nothing.
 */

import { useEffect, useRef, useState } from 'react';
import { clusterReadout } from '@/lib/showdown/dnaSummary';
import type { TraitProfile } from '@/lib/voice/quickdna/traits';

/** How many meters fit without turning the game into a dashboard. */
const SHOWN = 4;

export function LearningStrip({ profile }: { profile: TraitProfile }) {
  const clusters = clusterReadout(profile);
  const top = [...clusters].sort((a, b) => b.resolved - a.resolved).slice(0, SHOWN);

  /* WHICH BARS JUST MOVED. Held in a ref keyed by cluster id so the pulse fires
     on the transition rather than on every render — a meter that pulses
     continuously is decoration again. */
  const previous = useRef<Record<string, number>>({});
  const [pulsing, setPulsing] = useState<string[]>([]);

  useEffect(() => {
    const gained = top.filter((c) => c.resolved > (previous.current[c.id] ?? 0)).map((c) => c.id);
    for (const c of clusters) previous.current[c.id] = c.resolved;
    if (gained.length === 0) return;
    setPulsing(gained);
    const t = window.setTimeout(() => setPulsing([]), 600);
    return () => window.clearTimeout(t);
    // `top` is derived from `profile`; keying the effect on the profile is what
    // makes "changed since the last answer" the actual trigger.
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid grid-cols-4 gap-2" data-testid="showdown-learning">
      {top.map((c) => {
        const pct = Math.round(c.resolved * 100);
        const hot = pulsing.includes(c.id);
        return (
          <div key={c.id} data-testid="showdown-meter" data-cluster={c.id} data-resolved={pct}>
            <div className="flex items-baseline justify-between">
              <span
                className={`text-[0.55rem] font-black uppercase tracking-widest transition-colors duration-300 ${
                  hot ? 'text-amber-300' : 'text-slate-500'
                }`}
              >
                {c.label}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  hot ? 'bg-amber-300' : 'bg-white/45'
                }`}
                style={{ width: `${Math.max(3, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
