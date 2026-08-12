'use client';

/**
 * THE PAYOFF — an identity reveal, not a report.
 *
 * ── WHAT THIS REPLACES, AND WHY ───────────────────────────────────────────
 * The old ending was a dashboard: a before/after percentage, six cluster
 * meters, three summary lines and a list labelled "closest matches in the
 * game's catalogue". Every one of those is a measurement of OUR machinery
 * handed to a player who does not have it. "Taste DNA 38% → 41%" is not a fact
 * about a person; it is a fact about our confidence, and showing it invites the
 * only reaction it deserves — "so what?".
 *
 * What a player wants at the end of a game about themselves is to be TOLD
 * SOMETHING. So the screen states five things in plain language and then proves
 * them with films:
 *
 *   WHAT HOOKS YOU · WHAT KILLS IT · WHERE YOU CONTRADICT YOURSELF ·
 *   WHAT WE LEARNED TONIGHT · WHAT WE ARE STILL NOT SURE ABOUT
 *
 * The last two are what make the first three believable. A reveal that is
 * confident about everything reads as a horoscope; one that names its own edges
 * reads as somebody paying attention.
 *
 * ── THE SCREEN CANNOT INVENT ANYTHING ─────────────────────────────────────
 * Every claim comes from `reveal.ts`, which filters by evidence before it ranks
 * and can return empty lists. The thin case — a player who answered "haven't
 * seen either" throughout — is rendered as itself rather than padded, and that
 * path is the first thing below.
 *
 * ── NO PERCENTAGES ON RECOMMENDATIONS ─────────────────────────────────────
 * A film does not match somebody 87%. The band is the honest resolution of what
 * this evidence supports, and each card carries a WHY and a WATCH OUT drawn
 * from the axes that actually decided it — the watch-out being the part a
 * recommender usually hides and the part a person actually uses.
 */

import { useMemo } from 'react';
import type { ShowdownMode } from '@/lib/showdown/evidence';
import { buildReveal, type RevealItem } from '@/lib/showdown/reveal';
import { calibrationObservations, type ShowdownState } from '@/lib/showdown/session';
import { TITLES, type DiagnosticTitle } from '@/lib/voice/quickdna/definition';
import { posterFor } from '@/lib/showdown/poster';
import { QUICK_TRAITS, traitBelief, traitConfidence } from '@/lib/voice/quickdna/traits';

/** How well a title fits, and — more usefully — which axes decided it. */
interface Pick {
  title: DiagnosticTitle;
  band: 'Strong match' | 'Good match' | 'Worth a look';
  why: string;
  watchOut: string | null;
}

/**
 * Rank the diagnostic catalogue against the profile this session produced, and
 * keep the REASONS rather than only the score.
 *
 * A number with no reason attached is the thing that made the old list feel
 * generic: three posters and a percentage say nothing a shelf does not.
 */
function recommend(state: ShowdownState, count = 3): Pick[] {
  const reacted = new Set(state.decisions.flatMap((d) => [d.leftId, d.rightId]));

  const scored = TITLES.map((t) => {
    const parts = t.traits.map((e) => {
      const belief = traitBelief(state.profile, e.key);
      const wanted = e.invert ? 100 - belief.pref : belief.pref;
      const conf = traitConfidence(state.profile, e.key);
      return { key: e.key, contribution: ((wanted - 50) / 50) * e.strength * conf };
    });
    const fit = parts.reduce((s, p) => s + p.contribution, 0);
    return { title: t, fit, parts };
  }).sort((a, b) => b.fit - a.fit);

  // Prefer films this session did not already show them; top up rather than
  // ever rendering an empty payoff.
  const fresh = scored.filter((r) => !reacted.has(r.title.id));
  const pool = fresh.length >= count ? fresh : [...fresh, ...scored.filter((r) => reacted.has(r.title.id))];
  const top = pool.slice(0, count);
  const ceiling = top[0]?.fit ?? 0;

  return top.map(({ title, fit, parts }) => {
    const best = [...parts].sort((a, b) => b.contribution - a.contribution)[0];
    const worst = [...parts].sort((a, b) => a.contribution - b.contribution)[0];
    return {
      title,
      band: fit >= ceiling * 0.85 ? 'Strong match' : fit >= ceiling * 0.6 ? 'Good match' : 'Worth a look',
      why: best ? (QUICK_TRAITS[best.key] ?? best.key) : 'Fits the shape of what you picked',
      /* THE PART A RECOMMENDER USUALLY HIDES. Only shown when an axis genuinely
         works AGAINST this title for this person — never manufactured to fill
         the slot, because a fake caveat is as dishonest as a fake match. */
      watchOut: worst && worst.contribution < -0.05 ? (QUICK_TRAITS[worst.key] ?? worst.key) : null,
    };
  });
}

function Section({ title, items, tone }: { title: string; items: RevealItem[]; tone: 'hook' | 'off' | 'plain' }) {
  if (items.length === 0) return null;
  const accent =
    tone === 'hook' ? 'text-amber-300' : tone === 'off' ? 'text-rose-300' : 'text-slate-400';
  return (
    <section className="flex flex-col gap-2" data-testid={`reveal-${tone}`}>
      <h3 className={`text-[0.62rem] font-black uppercase tracking-[0.3em] ${accent}`}>{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {items.map((i) => (
          <li key={i.key} className="text-lg font-bold leading-snug text-white sm:text-xl">
            {i.line}
          </li>
        ))}
      </ul>
    </section>
  );
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
  const observations = useMemo(() => calibrationObservations(state), [state]);
  const reveal = useMemo(
    () => buildReveal({}, state.profile, observations),
    [state.profile, observations],
  );
  const picks = useMemo(() => recommend(state), [state]);
  const decisions = state.decisions.length;

  /* THE HONEST FAILURE, FIRST. Somebody who recognised nothing has taught the
     engine nothing, and saying so is the only thing that keeps the confident
     version credible. */
  if (decisions === 0 || reveal.thin) {
    return (
      <div
        data-testid="showdown-results"
        data-thin="true"
        className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col items-center justify-center gap-5 px-6 text-center"
      >
        <p className="text-[0.65rem] font-black uppercase tracking-[0.4em] text-slate-500">No verdict</p>
        <h1 className="text-balance text-3xl font-black leading-tight text-white sm:text-4xl">
          Not enough to go on yet
        </h1>
        <p className="text-balance text-base text-slate-400">
          {decisions === 0
            ? 'You did not recognise enough of these to tell us anything — that is a gap in our catalogue, not in your taste.'
            : 'A few more rounds and we can say something worth reading. Right now anything we claimed would be guesswork.'}
        </p>
        <button
          type="button"
          data-testid="showdown-again"
          onClick={onPlayAgain}
          className="min-h-[56px] w-full max-w-xs rounded-2xl bg-amber-300 px-8 text-base font-black uppercase tracking-wide text-ink-900 transition active:scale-[0.97] hover:bg-amber-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
        >
          Play again
        </button>
        <button
          type="button"
          onClick={onContinue}
          className="min-h-[44px] text-sm font-semibold text-slate-400 underline-offset-4 hover:underline"
        >
          Skip for now
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="showdown-results"
      className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 pb-16 pt-10 lg:max-w-5xl"
    >
      <header className="flex flex-col gap-2">
        <p className="text-[0.65rem] font-black uppercase tracking-[0.4em] text-amber-300">
          {mode === 'tonight' ? 'Tonight' : 'Your verdict'}
        </p>
        {/* THE HEADLINE IS THE STRONGEST THING WE FOUND, not a score. */}
        <h1 className="text-balance text-4xl font-black leading-[0.95] tracking-tight text-white sm:text-5xl">
          {reveal.hooks[0]?.line ?? 'Here is what we found'}
        </h1>
        <p className="text-sm font-semibold text-slate-400">
          From {decisions} {decisions === 1 ? 'choice' : 'choices'} · no questionnaire required
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="What hooks you" items={reveal.hooks} tone="hook" />
        <Section title="What kills it" items={reveal.turnoffs} tone="off" />
      </div>

      {reveal.contradictions.length > 0 && (
        <section className="rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10" data-testid="reveal-contradiction">
          <h3 className="text-[0.62rem] font-black uppercase tracking-[0.3em] text-sky-300">
            What makes you interesting
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {reveal.contradictions.map((c) => (
              <li key={c.key} className="text-lg font-bold leading-snug text-white">
                {c.line}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-8 sm:grid-cols-2">
        <Section title="What we learned tonight" items={reveal.learned} tone="plain" />
        <Section title="Still not sure about" items={reveal.unsure} tone="plain" />
      </div>

      {/* THE PROOF. Claims are cheap; the films are the argument. */}
      <section className="flex flex-col gap-4" data-testid="reveal-picks">
        <h3 className="text-[0.62rem] font-black uppercase tracking-[0.3em] text-slate-400">
          So you should watch
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {picks.map(({ title, band, why, watchOut }) => {
            const art = posterFor(title.id, 'w342');
            return (
              <article
                key={title.id}
                data-testid="reveal-pick"
                className="flex flex-col overflow-hidden rounded-2xl bg-white/[0.05] ring-1 ring-white/10"
              >
                <div className="relative aspect-[2/3] w-full bg-ink-800">
                  {art.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={art.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center px-3 text-center text-sm font-bold text-slate-500">
                      {title.title}
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-ink-900/90 px-2.5 py-1 text-[0.6rem] font-black uppercase tracking-wider text-amber-300">
                    {band}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="text-base font-black leading-tight text-white">
                    {title.title} <span className="font-semibold text-slate-500">{title.year}</span>
                  </p>
                  <p className="text-xs leading-snug text-slate-300">
                    <span className="font-black uppercase tracking-wider text-emerald-300">Why </span>
                    {why}
                  </p>
                  {watchOut && (
                    <p className="text-xs leading-snug text-slate-300">
                      <span className="font-black uppercase tracking-wider text-amber-300">Watch out </span>
                      {watchOut}
                    </p>
                  )}
                  <a
                    href={`/title/${title.tmdbId}`}
                    className="mt-auto min-h-[40px] rounded-xl bg-white/10 px-3 py-2 text-center text-xs font-black uppercase tracking-wide text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    Quick look
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          data-testid="showdown-continue"
          onClick={onContinue}
          className="min-h-[56px] flex-1 rounded-2xl bg-amber-300 px-6 text-base font-black uppercase tracking-wide text-ink-900 transition active:scale-[0.98] hover:bg-amber-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70"
        >
          Find something to watch
        </button>
        <button
          type="button"
          data-testid="showdown-again"
          onClick={onPlayAgain}
          className="min-h-[56px] rounded-2xl px-6 text-base font-bold text-slate-300 ring-1 ring-white/15 transition active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-48"
        >
          Play again
        </button>
      </div>

      {/* openingKnown is retained for the caller's contract; the screen
          deliberately does not render a confidence delta. */}
      <span className="sr-only" data-opening-known={openingKnown} />
    </div>
  );
}
