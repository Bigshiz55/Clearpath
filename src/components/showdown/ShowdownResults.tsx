'use client';

/**
 * THE PAYOFF.
 *
 * Every number here is computed from the session that just happened. The
 * before/after is real `dnaKnown()`, and the readout is ranked by
 * DISTINCTIVENESS rather than confidence — see `dnaSummary.ts` for why that
 * distinction is the difference between a portrait and a horoscope. Nothing on
 * this screen is a fixed demo list, and nothing claims precision the evidence
 * does not support.
 *
 * WHAT IT WILL NOT DO IS PAD. Three statements, six cluster meters, three
 * films. A results screen that lists thirty axes is a data dump that says "we
 * measured a lot" instead of "here is who you are", and the axes at the bottom
 * of such a list are exactly the ones the scan is least sure about.
 *
 * THE HONEST-FAILURE CASE MATTERS MOST. Someone who answered "haven't seen
 * either" throughout has taught the engine nothing, and the screen has to say
 * so rather than invent a discovery to look clever. That path is the first
 * thing rendered below.
 */

import { useMemo } from 'react';
import type { ShowdownPayoff } from '@/lib/actions/showdown';
import type { ShowdownMode } from '@/lib/showdown/evidence';
import { dnaKnown } from '@/lib/tastedna/families';
import { clusterReadout, dnaSummary } from '@/lib/showdown/dnaSummary';
import { answeredFollowUps, type ShowdownState } from '@/lib/showdown/session';
import { TITLES } from '@/lib/voice/quickdna/definition';
import { traitBelief, traitConfidence } from '@/lib/voice/quickdna/traits';

/**
 * Rank the diagnostic catalogue against the profile this session produced.
 *
 * DELIBERATELY LABELLED FOR WHAT IT IS. This is the 113-title diagnostic pool
 * scored by Showdown's own model — not the product's ranking pipeline, which
 * lives behind `rankByDna` and needs the server. Calling these "your
 * recommendations" would be the overclaim the whole rebuild is against; they
 * are the best matches among the films the game knows, and the button below is
 * what takes the player to the real thing.
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

/**
 * WHAT THE SESSION DID TO THE REAL RECOMMENDATION POOL.
 *
 * The section below this one ranks the game's own 113 diagnostic titles and
 * says so. This one is the actual claim: the same TMDB discover pool the "For
 * you" surface ranks, scored by the production `preferenceNudge`, ordered
 * against the player's DNA before this session and after it, with the
 * diagnostic titles removed so nothing they just answered about can appear as
 * its own reward. Computed server-side in `payoffPool.ts`.
 *
 * THREE OUTCOMES, AND TWO OF THEM ARE "NO". `movement: 0` is the honest and
 * common answer after one session — `MIN_RANK_CONF` is 0.25 and a single scan
 * does not usually clear it — and it is stated rather than dressed up. Not
 * measured at all (a guest, TMDB down) is a THIRD thing and says so separately,
 * because "we could not look" and "we looked and nothing moved" are different
 * facts and collapsing them is how a screen starts lying.
 */
function RealRankingPayoff({ payoff }: { payoff: ShowdownPayoff }) {
  const moved = payoff.movement > 0;
  return (
    <div data-testid="showdown-payoff" data-movement={payoff.movement}>
      <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
        Your real recommendations
      </h2>
      {!moved ? (
        <p className="mt-2 rounded-xl bg-white/5 px-4 py-3 text-sm leading-relaxed text-slate-300">
          Your ranking hasn&rsquo;t changed yet. One scan moves what we believe about you, but not
          far enough for the recommender to act on it — that takes a couple more. Nothing here is
          being held back; there is genuinely nothing to show yet.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-400">
            {payoff.climbed.length > 0
              ? `${payoff.climbed.length} title${payoff.climbed.length === 1 ? '' : 's'} climbed into your top ${payoff.top.length} because of this session.`
              : 'Your ranking shifted — the order below is now yours rather than everyone’s.'}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {payoff.top.map((c) => (
              <li
                key={c.id}
                data-testid="showdown-payoff-row"
                data-moved={c.moved}
                className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3"
              >
                <span className="min-w-0 flex-1 text-base font-semibold text-white">
                  {c.title}
                  {c.year ? (
                    <span className="ml-1.5 text-sm font-normal text-slate-400">({c.year})</span>
                  ) : null}
                </span>
                {c.moved > 0 && (
                  <span className="shrink-0 text-xs font-black tabular-nums text-emerald-300">
                    ↑{c.moved}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function ShowdownResults({
  state,
  openingKnown,
  onPlayAgain,
  onContinue,
  mode = 'dna',
  payoff = null,
}: {
  state: ShowdownState;
  openingKnown: number;
  onPlayAgain: () => void;
  onContinue: () => void;
  /** Which run this was. Decides what the screen may honestly claim. */
  mode?: ShowdownMode;
  /**
   * Real-ranking movement from the server, or null while it is still in flight
   * — and permanently null for a guest, who has no server-side DNA to move.
   */
  payoff?: ShowdownPayoff | null;
}) {
  const known = useMemo(() => dnaKnown(state.profile), [state.profile]);
  const summary = useMemo(() => dnaSummary(state.profile, 3), [state.profile]);
  const clusters = useMemo(() => clusterReadout(state.profile), [state.profile]);
  const picks = useMemo(() => recommend(state), [state]);

  const decisions = state.decisions.length;
  const elaborated = answeredFollowUps(state);
  const gained = Math.round(known * 100) - Math.round(openingKnown * 100);
  const learnedNothing = decisions === 0;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col gap-5 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8">
      <div>
        <h1
          data-testid="showdown-results"
          data-decisions={decisions}
          data-known={Math.round(known * 100)}
          data-opening={Math.round(openingKnown * 100)}
          data-elaborated={elaborated}
          className="text-3xl font-black uppercase tracking-tight text-white sm:text-4xl"
        >
          {learnedNothing
            ? 'Nothing learned yet'
            : mode === 'tonight'
              ? 'Tonight’s picks'
              : 'Here’s what you watch'}
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
             Showing any INCREASE would be a straight falsehood. */
          <p className="mt-2 text-sm text-slate-400">
            {decisions} {decisions === 1 ? 'pick' : 'picks'} · shaping{' '}
            <span className="font-bold text-amber-300">tonight only</span> — your Taste DNA is
            unchanged.
          </p>
        ) : (
          /* WHAT THIS SCREEN MAY HONESTLY CLAIM.
             One run moves the belief but lands near the ranker's confidence
             floor, so it does not yet reliably reorder anything. "Your
             recommendations are now personalised" would therefore be false.
             What IS true is that something real was learned and that another
             run is what makes it count, so that is what it says. */
          <p className="mt-2 text-sm text-slate-400">
            {decisions} {decisions === 1 ? 'decision' : 'decisions'}
            {elaborated > 0 ? `, ${elaborated} explained` : ''} ·{' '}
            <span className="font-bold text-amber-300 tabular-nums">
              {Math.round(openingKnown * 100)}% → {Math.round(known * 100)}%
            </span>{' '}
            of your taste mapped{gained > 0 ? ` (+${gained})` : ''}
          </p>
        )}
      </div>

      {/*
        LAYER ONE — THREE SENTENCES.
        Ranked by distinctiveness, so what leads is what makes this person
        different, not what most players happen to share. An axis the scan did
        not resolve is absent rather than softened.
      */}
      {summary.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="showdown-summary">
          {summary.map((line) => (
            <li
              key={line}
              data-testid="showdown-summary-line"
              className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold leading-snug text-emerald-100"
            >
              {line}
            </li>
          ))}
        </ul>
      )}

      {/*
        LAYER TWO — WHAT WAS AND WAS NOT RESOLVED.
        The meter is coverage, not preference: it says how much of each cluster
        the scan actually settled. Reporting the gaps is the point — ninety
        seconds cannot know everything about a person, and a readout that
        implies otherwise is the failure mode this rebuild is against.
      */}
      {!learnedNothing && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            What we mapped
          </h2>
          <ul className="mt-2 grid grid-cols-2 gap-2" data-testid="showdown-clusters">
            {clusters.map((c) => (
              <li
                key={c.id}
                data-testid="showdown-cluster"
                data-cluster={c.id}
                data-resolved={Math.round(c.resolved * 100)}
                className="rounded-xl bg-white/5 px-3 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-300">
                    {c.label}
                  </span>
                  <span className="text-[0.65rem] font-black tabular-nums text-slate-500">
                    {Math.round(c.resolved * 100)}%
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-amber-300"
                    style={{ width: `${Math.round(c.resolved * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!learnedNothing && payoff && <RealRankingPayoff payoff={payoff} />}

      {!learnedNothing && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Closest matches in the game&rsquo;s catalogue
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

      <div className="mt-auto flex flex-col gap-3 pt-2">
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
