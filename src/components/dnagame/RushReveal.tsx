'use client';

/**
 * THE PAYOFF.
 *
 * Six genre bars would be a failure condition, and they would also be a lie
 * about what was learned — the interesting statements are the RELATIONSHIPS
 * between traits, which no single bar can hold. So the reveal has three layers:
 * the wheel resolving into family affinities, the signature traits underneath
 * it, and then the point of the whole exercise — three things to watch, chosen
 * by the profile the player just built.
 *
 * The signature lines come from the existing synthesis layer, which only makes
 * a comparative claim when both sides are confident enough to mean it. A chip
 * that fires on thin evidence is worse than no chip: it is the product telling
 * someone something false about themselves.
 */

import { useMemo } from 'react';
import { readAllFamilies } from '@/lib/dnagame/families';
import { meaningfulDecisions, traitsCaptured, type GameState } from '@/lib/dnagame/game';
import { insightChips } from '@/lib/voice/quickdna/synthesis';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { traitBelief } from '@/lib/voice/quickdna/traits';

/**
 * Three titles the new profile actually argues for.
 *
 * Deliberately excludes anything already reacted to in this session — telling
 * someone to watch the film they just rated is the fastest way to look like the
 * recommendations did not change.
 */
function recommend(state: GameState, count = 3) {
  const seen = new Set(state.usedTitleIds);
  return [...TITLES]
    .filter((t) => !seen.has(t.id))
    .map((t) => {
      const fit = t.traits.reduce((sum, e) => {
        const pref = traitBelief(state.profile, e.key).pref;
        const wanted = e.invert ? 100 - pref : pref;
        return sum + ((wanted - 50) / 50) * e.strength;
      }, 0);
      return { title: t, fit };
    })
    .sort((a, b) => b.fit - a.fit)
    .slice(0, count);
}

export function RushReveal({
  state,
  elapsedMs,
  onShowPicks,
  onPlayAgain,
}: {
  state: GameState;
  elapsedMs: number;
  onShowPicks: () => void;
  onPlayAgain: () => void;
}) {
  const families = useMemo(
    () => readAllFamilies(state.profile).sort((a, b) => b.affinity - a.affinity),
    [state.profile],
  );
  const chips = useMemo(() => insightChips(state.profile, 6), [state.profile]);
  const picks = useMemo(() => recommend(state), [state]);
  const known = families.reduce((s, f) => s + f.confidence, 0) / families.length;

  return (
    <div className="mx-auto flex min-h-[80vh] w-full max-w-lg flex-col gap-6 px-5 py-8">
      <div>
        <h1 className="text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
          Your Verd1ct DNA
        </h1>
        <p
          className="mt-1 text-sm text-slate-400"
          data-testid="rush-summary"
          data-ms={elapsedMs}
          data-decisions={meaningfulDecisions(state)}
          data-traits={traitsCaptured(state)}
        >
          {/* No fake precision: a strong read is a strong read, not 100%. */}
          {known >= 0.72 ? 'Strong read' : 'Ready to recommend'} · {Math.round(known * 100)}% ·{' '}
          {meaningfulDecisions(state)} decisions in {Math.round(elapsedMs / 1000)}s
        </p>
      </div>

      <ul className="flex flex-col gap-2" data-testid="rush-families">
        {families.map((f) => (
          <li key={f.id} className="flex items-center gap-3" data-testid="rush-family">
            <span className="w-20 shrink-0 text-xs font-bold uppercase tracking-wider text-slate-300">
              {f.label}
            </span>
            <span className="h-2 grow overflow-hidden rounded-full bg-white/10">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.round(f.affinity)}%`, background: f.accent }}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-sm font-bold tabular-nums text-white">
              {Math.round(f.affinity)}
            </span>
          </li>
        ))}
      </ul>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="rush-chips">
          {chips.map((c) => (
            <span
              key={c.id}
              data-testid="rush-chip"
              className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-200"
            >
              {c.text}
            </span>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">
          Three you should watch
        </h2>
        <ul className="mt-2 flex flex-col gap-2" data-testid="rush-picks">
          {picks.map(({ title }) => (
            <li
              key={title.id}
              data-testid="rush-pick"
              className="rounded-xl bg-white/5 px-4 py-3 text-base font-semibold text-white"
            >
              {title.title} <span className="text-sm font-normal text-slate-400">({title.year})</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-auto flex flex-col gap-3">
        <button type="button" data-testid="rush-show-picks" onClick={onShowPicks} className="btn-primary py-4 text-base font-bold">
          Show me what I should watch
        </button>
        <button
          type="button"
          data-testid="rush-play-again"
          onClick={onPlayAgain}
          className="rounded-xl py-3 text-sm font-semibold text-slate-300 hover:bg-white/10"
        >
          Level up my DNA
        </button>
      </div>
    </div>
  );
}
