'use client';

/**
 * THE PAYOFF.
 *
 * Every number here is computed from the session that just happened. The
 * before/after is real `dnaKnown()`, the insights come from the synthesis layer
 * that only makes a comparative claim when both sides are confident enough to
 * mean it, and the recommendations are ranked from the UPDATED profile. Nothing
 * on this screen is a fixed demo list, and nothing claims precision the
 * evidence does not support.
 *
 * THE HONEST-FAILURE CASE MATTERS MOST. Someone who answered "haven't seen
 * either" throughout has taught the engine nothing, and the screen has to say
 * so rather than invent a discovery to look clever. That path is the first
 * thing rendered below.
 */

import { useMemo } from 'react';
import type { ShowdownMode } from '@/lib/showdown/evidence';
import { dnaKnown } from '@/lib/tastedna/families';
import { insightChips } from '@/lib/voice/quickdna/synthesis';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { traitBelief, traitConfidence } from '@/lib/voice/quickdna/traits';
import type { ShowdownState } from '@/lib/showdown/session';

/**
 * Rank the catalogue against the profile this session just produced.
 *
 * Weighted by confidence, so a trait we barely know barely counts — the same
 * shape the recommender uses, rather than a parallel scoring rule that could
 * drift away from what the rest of the product does.
 */
function recommend(state: ShowdownState, count = 3) {
  const reacted = new Set(state.decisions.flatMap((d) => [d.leftId, d.rightId]));
  const ranked = [...TITLES]
    .map((t) => ({
      title: t,
      fit: t.traits.reduce((sum, e) => {
        const belief = traitBelief(state.profile, e.key);
        const wanted = e.invert ? 100 - belief.pref : belief.pref;
        return sum + ((wanted - 50) / 50) * e.strength * traitConfidence(state.profile, e.key);
      }, 0),
    }))
    .sort((a, b) => b.fit - a.fit);

  // Prefer films this session did not already put in front of them; top up
  // rather than ever showing an empty payoff.
  const fresh = ranked.filter((r) => !reacted.has(r.title.id));
  return (fresh.length >= count ? fresh : [...fresh, ...ranked.filter((r) => reacted.has(r.title.id))])
    .slice(0, count);
}

export function ShowdownResults({
  state,
  openingKnown,
  onPlayAgain,
  onContinue,
  mode = 'dna',
}: {
  state: ShowdownState;
  openingKnown: number;
  onPlayAgain: () => void;
  onContinue: () => void;
  /** Which run this was. Decides what the screen may honestly claim. */
  mode?: ShowdownMode;
}) {
  const known = useMemo(() => dnaKnown(state.profile), [state.profile]);
  const chips = useMemo(() => insightChips(state.profile, 3), [state.profile]);
  const picks = useMemo(() => recommend(state), [state]);

  const decisions = state.decisions.length;
  const gained = Math.round(known * 100) - Math.round(openingKnown * 100);
  const learnedNothing = decisions === 0;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col gap-6 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
      <div>
        <h1
          data-testid="showdown-results"
          data-decisions={decisions}
          data-known={Math.round(known * 100)}
          data-opening={Math.round(openingKnown * 100)}
          className="text-3xl font-black uppercase tracking-tight text-white sm:text-4xl"
        >
          {learnedNothing
            ? 'Nothing learned yet'
            : mode === 'tonight'
              ? 'Tonight’s picks'
              : 'You just taught us something real'}
        </h1>

        {learnedNothing ? (
          // No decision was made, so there is nothing to report and we say so.
          // Inventing a discovery here would be the exact dishonesty the whole
          // insight layer exists to prevent.
          <p className="mt-2 text-sm text-slate-400">
            You hadn&rsquo;t seen either film in any of those matchups, so nothing changed. Play
            again and we&rsquo;ll pick from titles you&rsquo;re more likely to know.
          </p>
        ) : mode === 'tonight' ? (
          /* NO DNA METER, BECAUSE PERMANENT DNA DID NOT MOVE.
             Showing "0% → 0%" would be technically true and still a lie by
             implication — it invites the reading that the run was worthless,
             when in fact it did exactly what it promised and shaped tonight.
             Showing any INCREASE would be a straight falsehood. The honest
             thing is to report what this run actually changed: the list below,
             for this session only. */
          <p className="mt-2 text-sm text-slate-400">
            {decisions} {decisions === 1 ? 'pick' : 'picks'} · shaping{' '}
            <span className="font-bold text-amber-300">tonight only</span> — your Taste DNA is
            unchanged.
          </p>
        ) : (
          /* WHAT THIS SCREEN MAY HONESTLY CLAIM.
             One 12-decision run moves the belief but reaches confidence 0.190
             against the ranker's floor of 0.25 — so it produces a ranking nudge
             of exactly zero. "Your recommendations are now personalised" would
             therefore be false, and the old "your DNA just got sharper" over a
             rising percentage implied it. What IS true is that something real
             was learned and that another run is what makes it count, so that is
             what it says. The percentage stays because it is a measured
             coverage figure; the raw confidence decimal does not, because it is
             a diagnostic number and belongs at /api/health/showdown. */
          <>
            <p className="mt-2 text-sm text-slate-400">
              {decisions} {decisions === 1 ? 'decision' : 'decisions'} ·{' '}
              <span className="font-bold text-amber-300 tabular-nums">
                {Math.round(openingKnown * 100)}% → {Math.round(known * 100)}%
              </span>{' '}
              of your taste mapped{gained > 0 ? ` (+${gained})` : ''}
            </p>
            <p className="mt-3 text-sm text-slate-300" data-testid="showdown-progression">
              Your Taste DNA sharpens every time you play.{' '}
              <span className="font-semibold text-white">
                One more Showdown and we can start shaping what we recommend.
              </span>
            </p>
          </>
        )}
      </div>

      {chips.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            {mode === 'tonight' ? 'What you’re in the mood for' : 'What that told us'}
          </h2>
          <ul className="mt-2 flex flex-col gap-2" data-testid="showdown-insights">
            {chips.map((c) => (
              <li
                key={c.id}
                data-testid="showdown-insight"
                className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100"
              >
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!learnedNothing && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            What you&rsquo;d watch tonight
          </h2>
          <ul className="mt-2 flex flex-col gap-2" data-testid="showdown-picks">
            {picks.map(({ title }) => (
              <li
                key={title.id}
                data-testid="showdown-pick-result"
                data-title-id={title.id}
                className="rounded-xl bg-white/5 px-4 py-3 text-base font-semibold text-white"
              >
                {title.title}{' '}
                <span className="text-sm font-normal text-slate-400">({title.year})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3">
        <button
          type="button"
          data-testid="showdown-continue"
          onClick={onContinue}
          className="btn-primary min-h-[52px] py-4 text-base font-bold"
        >
          Show me what I&rsquo;d watch tonight
        </button>
        <button
          type="button"
          data-testid="showdown-again"
          onClick={onPlayAgain}
          className="min-h-[52px] rounded-xl py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Play again
        </button>
      </div>
    </div>
  );
}
