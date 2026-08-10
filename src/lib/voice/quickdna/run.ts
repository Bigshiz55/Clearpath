/**
 * QUICK DNA — the run.
 *
 * One continuous session in two movements: ~10–12 spoken probes, then ~20–25
 * movie reactions. The seam between them is a single sentence, and after START
 * nothing needs a fingertip.
 *
 * The trait profile is the state that matters. Every answer folds into it
 * immediately, which is what makes the run adaptive: the next question is
 * chosen from the profile as it stands, so a Conjuring NO changes which title
 * comes next. That also makes the whole thing a pure fold — replay the same
 * answers and you get the same profile, which is how the persona simulations
 * can prove the calibration separates people.
 *
 * TIME IS THE BUDGET, not the question count. `remainingMs` shrinks as answers
 * land, and the run ends when the budget is spent even if titles remain — the
 * brief's rule that anything cut is the lowest-information question falls out
 * of the planner automatically, because the lowest-value item is simply never
 * chosen.
 *
 * PURE. Time is passed in, never read.
 */

import {
  LIGHTNING_INTRO,
  PROBES_BY_ID,
  QUICK_DNA_VERSION,
  TITLES_BY_ID,
  type DiagnosticTitle,
  type Probe,
  type TraitEffect,
} from './definition';
import { nextProbe, nextTitle, openSplits } from './planner';
import { observeAll, type TraitProfile, type TraitKey } from './traits';
import type { TitleReaction } from './parseAnswer';

export type Phase = 'idle' | 'probes' | 'lightning' | 'complete';
export type InputMethod = 'voice' | 'tap';

/** Every recorded answer keeps the provenance the evidence model needs. */
export interface QuickSignal {
  kind: 'probe' | 'title';
  /** Probe id or title id. */
  id: string;
  /** 0..10 for a scale probe; 'a'/'b' for either/or; the reaction for a title. */
  value: number | 'a' | 'b' | TitleReaction;
  /** True when the person said something stronger than yes/no ("loved it"). */
  strong?: boolean;
  at: number;
  method: InputMethod;
  confidence?: number;
  version: string;
}

export interface QuickRun {
  phase: Phase;
  profile: TraitProfile;
  signals: QuickSignal[];
  askedProbes: string[];
  askedTitles: string[];
  /** The question on the table right now. */
  current: { kind: 'probe'; probe: Probe } | { kind: 'title'; title: DiagnosticTitle } | null;
  startedAt: number;
  /** Wall-clock budget for the whole run. */
  budgetMs: number;
  version: string;
}

/** The brief's hard ceiling. Everything is architected around it. */
export const TIME_BUDGET_MS = 80_000;

/** Reserve for the closing transition, so the run does not overrun the budget. */
const CLOSING_RESERVE_MS = 4_000;

/** Enough probes to shape the profile; beyond this, titles buy more per second. */
export const MAX_PROBES = 12;
export const MIN_PROBES = 8;
export const MAX_TITLES = 25;

/**
 * A movie reaction outweighs a generic dimension rating — the evidence ladder
 * in the brief, expressed as the numbers that actually do the work. Both stay
 * below a real post-watch review (0.35) and far below a loved title (1.6), so
 * Quick DNA can never overrule what someone actually watched.
 */
export const PROBE_WEIGHT = 0.22;
export const TITLE_WEIGHT = 0.32;
/** "Loved it" / "hated it" says more than a bare yes or no. */
export const STRONG_BONUS = 1.4;

export function createRun(startedAt: number, seed: TraitProfile = {}, budgetMs = TIME_BUDGET_MS): QuickRun {
  return {
    phase: 'idle',
    profile: seed,
    signals: [],
    askedProbes: [],
    askedTitles: [],
    current: null,
    startedAt,
    budgetMs,
    version: QUICK_DNA_VERSION,
  };
}

export function elapsedMs(run: QuickRun, now: number): number {
  return Math.max(0, now - run.startedAt);
}

export function remainingMs(run: QuickRun, now: number): number {
  return Math.max(0, run.budgetMs - elapsedMs(run, now));
}

/** Signals that carry taste — the number the brief asks to be counted. */
export function signalCount(run: QuickRun): number {
  return run.signals.filter((s) => !(s.kind === 'title' && s.value === 'pass')).length;
}

/** Turn a probe's declared effects into observations at a given answer. */
function scaleObservations(
  effects: readonly TraitEffect[],
  value0to10: number,
  weight: number,
): Array<{ key: TraitKey; target: number; weight: number }> {
  return effects.map((eff) => {
    const raw = (value0to10 / 10) * 100;
    return { key: eff.key, target: eff.invert ? 100 - raw : raw, weight: weight * eff.strength };
  });
}

/**
 * A title reaction read as observations. A NO is the mirror of a YES — the
 * trait vector is written from the "enjoyed it" direction, so disliking a
 * supernatural horror is evidence AGAINST the supernatural, at the same
 * strength. A PASS teaches nothing and is recorded only so the selector can be
 * judged on how many it produced.
 */
function titleObservations(
  title: DiagnosticTitle,
  reaction: TitleReaction,
  strong: boolean,
): Array<{ key: TraitKey; target: number; weight: number }> {
  if (reaction === 'pass') return [];
  const weight = TITLE_WEIGHT * (strong ? STRONG_BONUS : 1);
  return title.traits.map((eff) => {
    const liked = reaction === 'yes';
    const positive = eff.invert ? !liked : liked;
    return { key: eff.key, target: positive ? 100 : 0, weight: weight * eff.strength };
  });
}

/** Choose and set the next question, or finish. Pure; `now` drives the budget. */
export function advance(run: QuickRun, now: number): QuickRun {
  const left = remainingMs(run, now) - CLOSING_RESERVE_MS;
  if (left <= 0) return { ...run, phase: 'complete', current: null };

  // ── Probes first, until they stop being worth a second ───────────────────
  if (run.phase === 'idle' || run.phase === 'probes') {
    const enough = run.askedProbes.length >= MAX_PROBES;
    const probe = enough ? null : nextProbe(run.profile, run.askedProbes);
    // Below MIN_PROBES we keep asking even a low-value probe, because a profile
    // built from titles alone has no stated preferences to anchor it.
    const mustAsk = run.askedProbes.length < MIN_PROBES;
    if (probe && (mustAsk || run.askedProbes.length < MAX_PROBES)) {
      return { ...run, phase: 'probes', current: { kind: 'probe', probe } };
    }
  }

  // ── Then the lightning round ─────────────────────────────────────────────
  if (run.askedTitles.length < MAX_TITLES) {
    const title = nextTitle(run.profile, run.askedTitles, openSplits(run.profile));
    if (title) return { ...run, phase: 'lightning', current: { kind: 'title', title } };
  }
  return { ...run, phase: 'complete', current: null };
}

/** Begin. Sets the first question without consuming any of the budget. */
export function start(run: QuickRun, now: number): QuickRun {
  return advance({ ...run, phase: 'probes', startedAt: now }, now);
}

/** Record a 0–10 answer to the current probe and move on. */
export function answerScale(
  run: QuickRun,
  value: number,
  now: number,
  method: InputMethod,
  confidence?: number,
): QuickRun {
  if (run.current?.kind !== 'probe') return run;
  const probe = run.current.probe;
  const profile = observeAll(run.profile, scaleObservations(probe.effects, value, PROBE_WEIGHT));
  return advance(
    {
      ...run,
      profile,
      askedProbes: [...run.askedProbes, probe.id],
      signals: [
        ...run.signals,
        { kind: 'probe', id: probe.id, value, at: now, method, ...(confidence === undefined ? {} : { confidence }), version: run.version },
      ],
    },
    now,
  );
}

/** Record an either/or answer. */
export function answerAb(
  run: QuickRun,
  option: 'a' | 'b',
  now: number,
  method: InputMethod,
  confidence?: number,
): QuickRun {
  if (run.current?.kind !== 'probe') return run;
  const probe = run.current.probe;
  const chosen = option === 'a' ? probe.optionA : probe.optionB;
  const profile = chosen
    ? observeAll(
        run.profile,
        chosen.effects.map((eff) => ({
          key: eff.key,
          target: eff.invert ? 0 : 100,
          weight: PROBE_WEIGHT * 1.3 * eff.strength, // a choice beats a rating
        })),
      )
    : run.profile;
  return advance(
    {
      ...run,
      profile,
      askedProbes: [...run.askedProbes, probe.id],
      signals: [
        ...run.signals,
        { kind: 'probe', id: probe.id, value: option, at: now, method, ...(confidence === undefined ? {} : { confidence }), version: run.version },
      ],
    },
    now,
  );
}

/** Record a lightning-round reaction. */
export function answerTitle(
  run: QuickRun,
  reaction: TitleReaction,
  strong: boolean,
  now: number,
  method: InputMethod,
  confidence?: number,
): QuickRun {
  if (run.current?.kind !== 'title') return run;
  const title = run.current.title;
  const profile = observeAll(run.profile, titleObservations(title, reaction, strong));
  return advance(
    {
      ...run,
      profile,
      askedTitles: [...run.askedTitles, title.id],
      signals: [
        ...run.signals,
        { kind: 'title', id: title.id, value: reaction, strong, at: now, method, ...(confidence === undefined ? {} : { confidence }), version: run.version },
      ],
    },
    now,
  );
}

/** Move past the current question without recording anything. */
export function skipCurrent(run: QuickRun, now: number): QuickRun {
  if (!run.current) return run;
  if (run.current.kind === 'probe') {
    return advance({ ...run, askedProbes: [...run.askedProbes, run.current.probe.id] }, now);
  }
  return advance({ ...run, askedTitles: [...run.askedTitles, run.current.title.id] }, now);
}

/**
 * Step back one question and undo its evidence.
 *
 * Undoing means REPLAYING from the seed rather than subtracting: a weighted
 * mean cannot be reversed by arithmetic without keeping every term, and
 * replaying is both exact and obviously correct.
 */
export function goBack(run: QuickRun, seed: TraitProfile, now: number): QuickRun {
  if (run.signals.length === 0) return run;
  const kept = run.signals.slice(0, -1);
  const dropped = run.signals[run.signals.length - 1]!;
  const rebuilt = replay(kept, seed);
  const base: QuickRun = {
    ...run,
    profile: rebuilt,
    signals: kept,
    askedProbes: run.askedProbes.filter((id) => !(dropped.kind === 'probe' && id === dropped.id)),
    askedTitles: run.askedTitles.filter((id) => !(dropped.kind === 'title' && id === dropped.id)),
  };
  return advance(base, now);
}

/** Rebuild a profile from signals — the fold that makes the run reproducible. */
export function replay(signals: readonly QuickSignal[], seed: TraitProfile = {}): TraitProfile {
  let profile = seed;
  for (const s of signals) {
    if (s.kind === 'probe') {
      const probe = PROBES_BY_ID.get(s.id);
      if (!probe) continue;
      if (typeof s.value === 'number') {
        profile = observeAll(profile, scaleObservations(probe.effects, s.value, PROBE_WEIGHT));
      } else if (s.value === 'a' || s.value === 'b') {
        const chosen = s.value === 'a' ? probe.optionA : probe.optionB;
        if (chosen) {
          profile = observeAll(
            profile,
            chosen.effects.map((eff) => ({
              key: eff.key,
              target: eff.invert ? 0 : 100,
              weight: PROBE_WEIGHT * 1.3 * eff.strength,
            })),
          );
        }
      }
    } else {
      const title = TITLES_BY_ID.get(s.id);
      if (!title) continue;
      const reaction = s.value as TitleReaction;
      profile = observeAll(profile, titleObservations(title, reaction, Boolean(s.strong)));
    }
  }
  return profile;
}

/** What to say when crossing from probes into the lightning round. */
export function transitionLine(previous: Phase, next: Phase): string | null {
  return previous !== 'lightning' && next === 'lightning' ? LIGHTNING_INTRO : null;
}

/** How many of the lightning answers were "haven't seen it". Judges the selector. */
export function passRate(run: QuickRun): number {
  const titles = run.signals.filter((s) => s.kind === 'title');
  if (titles.length === 0) return 0;
  return titles.filter((s) => s.value === 'pass').length / titles.length;
}
