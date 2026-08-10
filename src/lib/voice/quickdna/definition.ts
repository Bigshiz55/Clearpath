/**
 * QUICK DNA — the versioned calibration definition.
 *
 * The probes and the diagnostic titles live here as DATA, not inside the
 * components that render them, so the calibration set can be rewritten without
 * rebuilding the feature. `QUICK_DNA_VERSION` is stamped onto every stored
 * answer, which is what makes a later change safe: old evidence stays readable
 * and attributable to the version that collected it.
 *
 * Two kinds of thing are defined:
 *
 *   PROBES — spoken in one to four words. A probe is worth asking only for what
 *     it reveals, so each one declares the traits it informs and how strongly.
 *     Some are 0–10, some are either/or; the A/B ones cost the same second and
 *     often separate two traits at once, which is why the planner reaches for
 *     them when a pair of traits is jointly uncertain.
 *
 *   TITLES — the lightning round. Each carries a TRAIT VECTOR, not a genre tag,
 *     because genre tags are the thing that misleads: The Conjuring and The
 *     Silence of the Lambs are both "horror" and they measure opposite things.
 *     A single reaction updates several traits at once, which is how the round
 *     buys twenty-five signals in forty seconds.
 *
 * PURE DATA. No I/O.
 */

import type { TraitKey } from './traits';

export const QUICK_DNA_VERSION = 'quick-v1';

/** What a probe's answer moves, and by how much. */
export interface TraitEffect {
  key: TraitKey;
  /**
   * How strongly this observation speaks to the trait, 0..1. Multiplied by the
   * answer to produce the target, and used as the evidence weight.
   */
  strength: number;
  /** True when a HIGH answer means a LOW trait (e.g. "slow burns" → patience). */
  invert?: boolean;
}

export type ProbeKind = 'scale' | 'ab';

export interface Probe {
  id: string;
  kind: ProbeKind;
  /** Spoken. One to four words. */
  prompt: string;
  /** Shown large on screen. */
  label: string;
  /** For 'scale' probes: what a 10 means. */
  effects: TraitEffect[];
  /** For 'ab' probes only. */
  optionA?: { label: string; spoken: string[]; effects: TraitEffect[] };
  optionB?: { label: string; spoken: string[]; effects: TraitEffect[] };
  /**
   * Probes that make this one redundant. The planner skips a probe whose
   * traits are already confident, but this also stops near-duplicates being
   * asked back to back ("Crime?" then "Serial killers?").
   */
  supersededBy?: string[];
}

const e = (key: TraitKey, strength: number, invert = false): TraitEffect =>
  invert ? { key, strength, invert } : { key, strength };

/**
 * The probe bank. The planner picks ~10–12 of these; it never asks all of them,
 * which is the point — a fixed list wastes seconds confirming what we know.
 */
export const PROBES: readonly Probe[] = [
  { id: 'crime', kind: 'scale', prompt: 'Crime?', label: 'Crime', effects: [e('crime', 1), e('investigation', 0.4)] },
  { id: 'mystery', kind: 'scale', prompt: 'Murder mysteries?', label: 'Murder mysteries', effects: [e('investigation', 1), e('crime', 0.4)] },
  { id: 'trueCrime', kind: 'scale', prompt: 'True crime?', label: 'True crime', effects: [e('trueCrime', 1), e('documentary', 0.5), e('grounded', 0.3)] },
  { id: 'serialKillers', kind: 'scale', prompt: 'Serial killers?', label: 'Serial killers', effects: [e('psychological', 0.8), e('darkness', 0.8), e('crime', 0.4)] },
  { id: 'courtroom', kind: 'scale', prompt: 'Courtroom?', label: 'Courtroom', effects: [e('legal', 1), e('grounded', 0.3)] },
  { id: 'procedural', kind: 'scale', prompt: 'Police procedurals?', label: 'Police procedurals', effects: [e('investigation', 0.7), e('crime', 0.6), e('grounded', 0.3)] },
  { id: 'spy', kind: 'scale', prompt: 'Spy thrillers?', label: 'Spy thrillers', effects: [e('action', 0.5), e('complexity', 0.4)] },
  { id: 'psych', kind: 'scale', prompt: 'Psychological thrillers?', label: 'Psychological thrillers', effects: [e('psychological', 1), e('complexity', 0.4), e('darkness', 0.5)] },
  { id: 'action', kind: 'scale', prompt: 'Action?', label: 'Action', effects: [e('action', 1)] },
  { id: 'comedy', kind: 'scale', prompt: 'Comedy?', label: 'Comedy', effects: [e('comedy', 1)] },
  { id: 'romance', kind: 'scale', prompt: 'Romance?', label: 'Romance', effects: [e('romance', 1)] },
  { id: 'drama', kind: 'scale', prompt: 'Drama?', label: 'Drama', effects: [e('complexity', 0.4), e('grounded', 0.3)] },
  { id: 'ghosts', kind: 'scale', prompt: 'Ghosts?', label: 'Ghosts', effects: [e('supernatural', 1), e('grounded', 0.6, true)] },
  { id: 'horror', kind: 'scale', prompt: 'Horror?', label: 'Horror', effects: [e('horrorTolerance', 1), e('darkness', 0.5)] },
  { id: 'scifi', kind: 'scale', prompt: 'Sci-fi?', label: 'Sci-fi', effects: [e('scifi', 1)] },
  { id: 'fantasy', kind: 'scale', prompt: 'Fantasy?', label: 'Fantasy', effects: [e('fantasy', 1), e('grounded', 0.5, true)] },
  { id: 'docs', kind: 'scale', prompt: 'Documentaries?', label: 'Documentaries', effects: [e('documentary', 1), e('grounded', 0.4)] },
  { id: 'slowBurn', kind: 'scale', prompt: 'Slow burns?', label: 'Slow burns', effects: [e('patience', 1)] },
  { id: 'older', kind: 'scale', prompt: 'Older movies?', label: 'Older movies', effects: [e('vintage', 1)] },
  { id: 'subtitles', kind: 'scale', prompt: 'Subtitles?', label: 'Subtitles', effects: [e('subtitles', 1), e('international', 0.5)] },
  { id: 'dubbed', kind: 'scale', prompt: 'Foreign, if dubbed?', label: 'Foreign, if dubbed', effects: [e('international', 1)] },

  // ── Either/or. Same second, two traits separated at once. ────────────────
  {
    id: 'ab-whodunit',
    kind: 'ab',
    prompt: 'Whodunit, or police procedural?',
    label: 'Whodunit or procedural?',
    effects: [],
    optionA: { label: 'Whodunit', spoken: ['whodunit', 'whodunnit', 'mystery', 'first', 'a'], effects: [e('investigation', 1), e('complexity', 0.5)] },
    optionB: { label: 'Procedural', spoken: ['procedural', 'police', 'second', 'b'], effects: [e('crime', 1), e('grounded', 0.5)] },
    supersededBy: ['mystery', 'procedural'],
  },
  {
    id: 'ab-killer-ghost',
    kind: 'ab',
    prompt: 'Serial killer, or ghost story?',
    label: 'Serial killer or ghost story?',
    effects: [],
    optionA: { label: 'Serial killer', spoken: ['serial', 'killer', 'first', 'a'], effects: [e('psychological', 1), e('grounded', 0.8), e('darkness', 0.6)] },
    optionB: { label: 'Ghost story', spoken: ['ghost', 'ghosts', 'story', 'second', 'b'], effects: [e('supernatural', 1), e('grounded', 0.8, true)] },
  },
  {
    id: 'ab-grounded',
    kind: 'ab',
    prompt: 'Real world, or made-up world?',
    label: 'Real or made-up world?',
    effects: [],
    optionA: { label: 'Real world', spoken: ['real', 'grounded', 'first', 'a'], effects: [e('grounded', 1)] },
    optionB: { label: 'Made-up', spoken: ['made', 'up', 'fantasy', 'second', 'b'], effects: [e('fantasy', 0.8), e('grounded', 1, true)] },
  },
  {
    id: 'ab-twist-chase',
    kind: 'ab',
    prompt: 'Clever twist, or big chase?',
    label: 'Twist or chase?',
    effects: [],
    optionA: { label: 'Twist', spoken: ['twist', 'clever', 'first', 'a'], effects: [e('complexity', 1), e('investigation', 0.6)] },
    optionB: { label: 'Chase', spoken: ['chase', 'big', 'action', 'second', 'b'], effects: [e('action', 1), e('patience', 0.5, true)] },
  },
] as const;

export const PROBES_BY_ID = new Map(PROBES.map((p) => [p.id, p]));

/**
 * A diagnostic title. `traits` is what a LIKE tells us — a dislike is read as
 * the mirror image, which is why every vector is written from the "enjoyed it"
 * direction.
 */
export interface DiagnosticTitle {
  id: string;
  title: string;
  year: number;
  tmdbId: number;
  /** How widely seen — the planner prefers recognisable titles to avoid PASSes. */
  recognition: number; // 0..1
  traits: TraitEffect[];
}

const t = (
  id: string,
  title: string,
  year: number,
  tmdbId: number,
  recognition: number,
  traits: TraitEffect[],
): DiagnosticTitle => ({ id, title, year, tmdbId, recognition, traits });

/**
 * The diagnostic set. Chosen so that reactions SEPARATE profiles rather than
 * confirm them — several deliberate near-pairs (Conjuring/Silence,
 * Interstellar/Martian, Knives Out/Zodiac) exist precisely because the
 * difference between them is more informative than either one alone.
 */
export const TITLES: readonly DiagnosticTitle[] = [
  t('knives-out', 'Knives Out', 2019, 546554, 0.9, [e('investigation', 1), e('comedy', 0.6), e('complexity', 0.4)]),
  t('zodiac', 'Zodiac', 2007, 1949, 0.75, [e('investigation', 1), e('psychological', 0.7), e('darkness', 0.7), e('patience', 0.8), e('grounded', 0.6)]),
  t('silence', 'The Silence of the Lambs', 1991, 274, 0.9, [e('psychological', 1), e('darkness', 0.9), e('grounded', 0.8), e('horrorTolerance', 0.6), e('investigation', 0.6)]),
  t('conjuring', 'The Conjuring', 2013, 138843, 0.8, [e('supernatural', 1), e('horrorTolerance', 0.8), e('grounded', 0.7, true)]),
  t('john-wick', 'John Wick', 2014, 245891, 0.85, [e('action', 1), e('investigation', 0.4, true)]),
  t('interstellar', 'Interstellar', 2014, 157336, 0.9, [e('scifi', 1), e('complexity', 0.7), e('patience', 0.7), e('grounded', 0.4, true)]),
  t('martian', 'The Martian', 2015, 286217, 0.85, [e('scifi', 0.8), e('grounded', 0.9), e('comedy', 0.4)]),
  t('parasite', 'Parasite', 2019, 496243, 0.75, [e('international', 1), e('subtitles', 0.9), e('complexity', 0.7), e('darkness', 0.6)]),
  t('bridesmaids', 'Bridesmaids', 2011, 55721, 0.75, [e('comedy', 1), e('romance', 0.4)]),
  t('notebook', 'The Notebook', 2004, 11036, 0.8, [e('romance', 1), e('darkness', 0.5, true)]),
  t('godfather', 'The Godfather', 1972, 238, 0.85, [e('crime', 1), e('vintage', 0.8), e('patience', 0.7), e('complexity', 0.5)]),
  t('few-good-men', 'A Few Good Men', 1992, 881, 0.7, [e('legal', 1), e('vintage', 0.5), e('grounded', 0.5)]),
  t('gone-girl', 'Gone Girl', 2014, 210577, 0.8, [e('psychological', 1), e('darkness', 0.7), e('complexity', 0.6), e('grounded', 0.6)]),
  t('lotr', 'The Lord of the Rings', 2001, 120, 0.9, [e('fantasy', 1), e('patience', 0.6), e('grounded', 0.7, true)]),
  t('making-a-murderer', 'Making a Murderer', 2015, 65249, 0.6, [e('trueCrime', 1), e('documentary', 0.9), e('patience', 0.6), e('grounded', 0.7)]),
  t('se7en', 'Se7en', 1995, 807, 0.8, [e('psychological', 0.9), e('darkness', 1), e('investigation', 0.7), e('grounded', 0.5)]),
  t('mad-max', 'Mad Max: Fury Road', 2015, 76341, 0.75, [e('action', 1), e('patience', 0.6, true)]),
  t('hereditary', 'Hereditary', 2018, 493922, 0.6, [e('supernatural', 0.8), e('horrorTolerance', 1), e('patience', 0.7), e('darkness', 0.8)]),
  t('get-out', 'Get Out', 2017, 419430, 0.8, [e('horrorTolerance', 0.7), e('psychological', 0.8), e('complexity', 0.6), e('grounded', 0.5)]),
  t('shawshank', 'The Shawshank Redemption', 1994, 278, 0.9, [e('vintage', 0.5), e('patience', 0.6), e('darkness', 0.4)]),
  t('inception', 'Inception', 2010, 27205, 0.9, [e('complexity', 1), e('scifi', 0.7), e('action', 0.6)]),
  t('sherlock', 'Sherlock', 2010, 19885, 0.7, [e('investigation', 1), e('complexity', 0.6)]),
  t('breaking-bad', 'Breaking Bad', 2008, 1396, 0.85, [e('crime', 1), e('darkness', 0.8), e('patience', 0.6), e('complexity', 0.6)]),
  t('office', 'The Office', 2005, 2316, 0.85, [e('comedy', 1), e('darkness', 0.5, true)]),
  t('squid-game', 'Squid Game', 2021, 93405, 0.8, [e('international', 1), e('subtitles', 0.7), e('darkness', 0.7)]),
  t('dark', 'Dark', 2017, 70523, 0.5, [e('international', 1), e('subtitles', 0.9), e('complexity', 0.9), e('scifi', 0.6)]),
  t('prisoners', 'Prisoners', 2013, 146233, 0.65, [e('investigation', 0.9), e('darkness', 0.9), e('grounded', 0.7), e('patience', 0.7)]),
  t('casablanca', 'Casablanca', 1942, 289, 0.7, [e('vintage', 1), e('romance', 0.7)]),
  t('true-detective', 'True Detective', 2014, 46648, 0.6, [e('investigation', 1), e('darkness', 0.9), e('patience', 0.8), e('psychological', 0.7)]),
  t('deadpool', 'Deadpool', 2016, 293660, 0.85, [e('comedy', 0.9), e('action', 0.9)]),
] as const;

export const TITLES_BY_ID = new Map(TITLES.map((x) => [x.id, x]));

/** Spoken once, before the first title. Nothing else is explained. */
export const LIGHTNING_INTRO =
  "Lightning round. Liked it: yes. Didn't like it: no. Haven't seen it: pass.";

/**
 * Spoken once, at the very start. Five to seven seconds.
 *
 * IT DESCRIBES THE PHASE IT OPENS, and nothing else. The first version listed
 * every answer format the whole run would ever accept — "numbers, yes, no, or
 * pass" — and then showed a 0–10 question. A person hearing "yes, no, or pass"
 * in front of a numeric scale reasonably concludes the thing is broken, and
 * they are right to: the system contradicted itself in its opening sentence.
 * The yes/no/pass grammar is introduced by LIGHTNING_INTRO, at the exact moment
 * it becomes the correct thing to say.
 */
export const QUICK_DNA_INTRO =
  'Quick calibration. First, rate a few things zero to ten. ' +
  'Ten means love it, zero means absolutely not.';
