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

  /*
   * TITLES FOR THE TEN NEW AXES.
   *
   * A reaction to a film someone has actually seen is the strongest evidence
   * this engine collects, so an axis with no title behind it can only ever be
   * learned from the weaker formats. These are chosen for RECOGNITION first —
   * a diagnostic nobody has seen returns "haven't seen it" and teaches
   * nothing — and each carries its new axis clearly rather than subtly.
   */
  t('toy-story', 'Toy Story', 1995, 862, 0.95, [e('animation', 1), e('family', 0.9), e('comedy', 0.6)]),
  t('spirited-away', 'Spirited Away', 2001, 129, 0.7, [e('animation', 1), e('international', 0.9), e('fantasy', 0.8), e('subtitles', 0.5)]),
  t('spider-verse', 'Spider-Man: Into the Spider-Verse', 2018, 324857, 0.8, [e('animation', 0.9), e('superhero', 1), e('action', 0.6)]),
  t('avengers', 'The Avengers', 2012, 24428, 0.9, [e('superhero', 1), e('action', 0.9), e('grounded', 0.6, true)]),
  t('dark-knight', 'The Dark Knight', 2008, 155, 0.9, [e('superhero', 0.9), e('darkness', 0.8), e('crime', 0.6), e('action', 0.7)]),
  t('django', 'Django Unchained', 2012, 68718, 0.8, [e('western', 1), e('period', 0.8), e('darkness', 0.7)]),
  t('true-grit', 'True Grit', 2010, 44264, 0.6, [e('western', 1), e('period', 0.8), e('patience', 0.5)]),
  t('la-la-land', 'La La Land', 2016, 313369, 0.85, [e('musical', 1), e('romance', 0.8)]),
  t('bohemian', 'Bohemian Rhapsody', 2018, 424694, 0.8, [e('musical', 1), e('documentary', 0.3), e('grounded', 0.6)]),
  t('rocky', 'Rocky', 1976, 1366, 0.8, [e('sport', 1), e('vintage', 0.7), e('grounded', 0.7)]),
  t('last-dance', 'The Last Dance', 2020, 97183, 0.6, [e('sport', 1), e('documentary', 1)]),
  t('saving-private-ryan', 'Saving Private Ryan', 1998, 857, 0.85, [e('war', 1), e('period', 0.7), e('darkness', 0.7), e('grounded', 0.8)]),
  t('1917', '1917', 2019, 530915, 0.7, [e('war', 1), e('period', 0.8), e('patience', 0.5)]),
  t('crouching-tiger', 'Crouching Tiger, Hidden Dragon', 2000, 146, 0.65, [e('martialArts', 1), e('international', 0.9), e('subtitles', 0.8), e('period', 0.6)]),
  t('bridgerton', 'Bridgerton', 2020, 63247, 0.7, [e('period', 1), e('romance', 0.9)]),
  t('great-british-bake-off', 'The Great British Bake Off', 2010, 45965, 0.6, [e('reality', 1), e('family', 0.7), e('darkness', 0.8, true)]),

  /* ── THE UNIVERSE SWEEP ADDITIONS ────────────────────────────────────────
     The original forty-six could not support a cold-start scan. Twenty
     decisions need forty UNIQUE titles, and a pool of forty-six leaves the
     planner nothing to choose from — by the late rounds it is dealing whatever
     is left rather than whatever is most informative, which is how a
     diagnostic turns into a queue. The old pool was also concentrated: crime,
     prestige and superhero were richly represented while anime, documentary,
     musical, western, reality and romance had one or two entries each, so a
     sweep across the entertainment universe was not physically possible.
     Every entry below states a POSITION clearly — a title nobody can
     characterise teaches nothing, however famous it is. */

  t('your-name', 'Your Name', 2016, 372058, 0.6, [e('animation', 1), e('international', 0.9), e('subtitles', 0.8), e('romance', 0.7), e('emotion', 0.9), e('fantasy', 0.6)]),
  t('akira', 'Akira', 1988, 149, 0.5, [e('animation', 1), e('international', 0.9), e('scifi', 0.9), e('violence', 0.7), e('weirdness', 0.7), e('subtitles', 0.7)]),
  t('princess-mononoke', 'Princess Mononoke', 1997, 128, 0.55, [e('animation', 1), e('international', 0.9), e('fantasy', 0.9), e('subtitles', 0.7), e('emotion', 0.7)]),
  t('totoro', 'My Neighbor Totoro', 1988, 8392, 0.6, [e('animation', 1), e('family', 0.9), e('warmth', 1), e('comfort', 0.9), e('international', 0.8)]),
  t('attack-on-titan', 'Attack on Titan', 2013, 1429, 0.55, [e('animation', 1), e('international', 0.8), e('episodic', 0.9), e('darkness', 0.8), e('violence', 0.8), e('spectacle', 0.7)]),
  t('cowboy-bebop', 'Cowboy Bebop', 1998, 30991, 0.4, [e('animation', 1), e('international', 0.8), e('scifi', 0.8), e('episodic', 0.7), e('characterFocus', 0.7)]),
  t('finding-nemo', 'Finding Nemo', 2003, 12, 0.9, [e('animation', 1), e('family', 1), e('warmth', 0.9), e('comfort', 0.8), e('mainstream', 0.9)]),
  t('inside-out', 'Inside Out', 2015, 150540, 0.85, [e('animation', 1), e('family', 0.9), e('emotion', 1), e('warmth', 0.8), e('complexity', 0.5)]),
  t('shrek', 'Shrek', 2001, 808, 0.9, [e('animation', 1), e('comedy', 0.9), e('family', 0.9), e('mainstream', 0.9), e('comfort', 0.8)]),

  t('titanic', 'Titanic', 1997, 597, 0.95, [e('romance', 1), e('emotion', 1), e('spectacle', 0.8), e('period', 0.7), e('sentimentality', 0.9), e('mainstream', 0.9)]),
  t('pride-prejudice', 'Pride & Prejudice', 2005, 4348, 0.7, [e('romance', 1), e('period', 0.9), e('characterFocus', 0.8), e('dialogue', 0.7), e('warmth', 0.7)]),
  t('when-harry-met-sally', 'When Harry Met Sally...', 1989, 639, 0.7, [e('romance', 1), e('comedy', 0.9), e('dialogue', 0.9), e('warmth', 0.8), e('comfort', 0.8)]),
  t('crazy-rich-asians', 'Crazy Rich Asians', 2018, 455207, 0.7, [e('romance', 1), e('comedy', 0.8), e('warmth', 0.8), e('international', 0.5), e('mainstream', 0.8)]),
  t('notting-hill', 'Notting Hill', 1999, 509, 0.7, [e('romance', 1), e('comedy', 0.8), e('comfort', 0.9), e('sentimentality', 0.8)]),

  t('superbad', 'Superbad', 2007, 8363, 0.8, [e('comedy', 1), e('mainstream', 0.8), e('darkness', 0.4, true), e('characterFocus', 0.5)]),
  t('hangover', 'The Hangover', 2009, 18785, 0.85, [e('comedy', 1), e('mainstream', 0.9), e('spectacle', 0.4), e('comfort', 0.6)]),
  t('in-bruges', 'In Bruges', 2008, 8321, 0.45, [e('comedy', 0.9), e('darkness', 0.9), e('cynicism', 0.8), e('dialogue', 0.9), e('crime', 0.6), e('violence', 0.6)]),
  t('grand-budapest', 'The Grand Budapest Hotel', 2014, 120467, 0.7, [e('comedy', 0.9), e('weirdness', 0.9), e('dialogue', 0.8), e('period', 0.7), e('spectacle', 0.6)]),

  t('sopranos', 'The Sopranos', 1999, 1398, 0.75, [e('crime', 1), e('episodic', 0.9), e('characterFocus', 0.9), e('darkness', 0.8), e('dialogue', 0.8), e('ambiguity', 0.7)]),
  t('the-wire', 'The Wire', 2002, 1438, 0.6, [e('crime', 1), e('episodic', 0.9), e('grounded', 0.9), e('complexity', 0.9), e('cynicism', 0.8), e('patience', 0.9)]),
  t('succession', 'Succession', 2018, 76331, 0.65, [e('episodic', 0.9), e('dialogue', 1), e('cynicism', 0.9), e('characterFocus', 0.9), e('comedy', 0.5)]),
  t('chernobyl', 'Chernobyl', 2019, 87108, 0.6, [e('episodic', 0.7), e('grounded', 1), e('darkness', 0.9), e('suspense', 0.9), e('period', 0.7), e('documentary', 0.4)]),
  t('moonlight', 'Moonlight', 2016, 376867, 0.5, [e('characterFocus', 1), e('emotion', 0.9), e('patience', 0.8), e('grounded', 0.9), e('ambiguity', 0.6)]),
  t('whiplash', 'Whiplash', 2014, 244786, 0.65, [e('musical', 0.8), e('emotion', 0.9), e('suspense', 0.8), e('darkness', 0.7), e('characterFocus', 0.8)]),

  t('the-matrix', 'The Matrix', 1999, 603, 0.9, [e('scifi', 1), e('action', 0.9), e('spectacle', 0.9), e('complexity', 0.7), e('mainstream', 0.8)]),
  t('blade-runner-2049', 'Blade Runner 2049', 2017, 335984, 0.6, [e('scifi', 1), e('patience', 0.9), e('spectacle', 0.9), e('ambiguity', 0.8), e('dialogue', 0.4, true)]),
  t('arrival', 'Arrival', 2016, 329865, 0.65, [e('scifi', 1), e('emotion', 0.9), e('complexity', 0.8), e('patience', 0.8), e('grounded', 0.6)]),
  t('alien', 'Alien', 1979, 348, 0.75, [e('scifi', 0.9), e('horrorTolerance', 0.9), e('suspense', 1), e('vintage', 0.7)]),
  t('star-wars', 'Star Wars', 1977, 11, 0.95, [e('scifi', 0.8), e('spectacle', 1), e('fantasy', 0.7), e('mainstream', 1), e('comfort', 0.7), e('vintage', 0.6)]),
  t('black-mirror', 'Black Mirror', 2011, 42009, 0.7, [e('scifi', 1), e('episodic', 0.6), e('darkness', 0.9), e('cynicism', 0.9), e('ambiguity', 0.7)]),

  t('the-shining', 'The Shining', 1980, 694, 0.85, [e('horrorTolerance', 0.9), e('psychological', 1), e('suspense', 0.9), e('weirdness', 0.7), e('vintage', 0.7), e('ambiguity', 0.8)]),
  t('halloween', 'Halloween', 1978, 948, 0.7, [e('horrorTolerance', 1), e('suspense', 0.9), e('violence', 0.7), e('vintage', 0.7), e('grounded', 0.5)]),
  t('scream', 'Scream', 1996, 4232, 0.7, [e('horrorTolerance', 0.9), e('comedy', 0.5), e('violence', 0.7), e('mainstream', 0.7)]),
  t('midsommar', 'Midsommar', 2019, 530385, 0.45, [e('horrorTolerance', 0.9), e('weirdness', 1), e('patience', 0.9), e('emotion', 0.8), e('ambiguity', 0.8)]),
  t('the-exorcist', 'The Exorcist', 1973, 9552, 0.75, [e('horrorTolerance', 1), e('supernatural', 1), e('vintage', 0.8), e('suspense', 0.8)]),

  t('pulp-fiction', 'Pulp Fiction', 1994, 680, 0.85, [e('crime', 0.9), e('dialogue', 1), e('violence', 0.7), e('weirdness', 0.7), e('cynicism', 0.7)]),
  t('goodfellas', 'Goodfellas', 1990, 769, 0.8, [e('crime', 1), e('violence', 0.8), e('characterFocus', 0.8), e('cynicism', 0.7), e('vintage', 0.5)]),
  t('no-country', 'No Country for Old Men', 2007, 6977, 0.65, [e('crime', 0.9), e('suspense', 1), e('patience', 0.8), e('ambiguity', 0.9), e('violence', 0.8), e('dialogue', 0.4, true)]),
  t('sicario', 'Sicario', 2015, 273481, 0.55, [e('crime', 0.9), e('suspense', 1), e('grounded', 0.9), e('darkness', 0.8), e('ambiguity', 0.7)]),
  t('shutter-island', 'Shutter Island', 2010, 11324, 0.75, [e('psychological', 1), e('suspense', 0.9), e('complexity', 0.8), e('darkness', 0.7)]),

  t('tiger-king', 'Tiger King', 2020, 89393, 0.7, [e('documentary', 1), e('trueCrime', 0.8), e('weirdness', 0.9), e('episodic', 0.7), e('mainstream', 0.7)]),
  t('planet-earth', 'Planet Earth', 2006, 41637, 0.8, [e('documentary', 1), e('spectacle', 1), e('comfort', 0.8), e('episodic', 0.6), e('darkness', 0.5, true)]),
  t('free-solo', 'Free Solo', 2018, 515001, 0.55, [e('documentary', 1), e('suspense', 0.9), e('sport', 0.8), e('grounded', 0.9), e('emotion', 0.7)]),
  t('thirteenth', '13th', 2016, 415586, 0.4, [e('documentary', 1), e('grounded', 1), e('complexity', 0.8), e('darkness', 0.7), e('dialogue', 0.8)]),

  t('schindlers-list', 'Schindler’s List', 1993, 424, 0.8, [e('war', 1), e('period', 0.9), e('emotion', 1), e('darkness', 0.9), e('grounded', 0.9), e('patience', 0.8)]),
  t('apocalypse-now', 'Apocalypse Now', 1979, 28, 0.6, [e('war', 1), e('weirdness', 0.8), e('patience', 0.8), e('vintage', 0.8), e('ambiguity', 0.8)]),
  t('unforgiven', 'Unforgiven', 1992, 33, 0.5, [e('western', 1), e('cynicism', 0.8), e('violence', 0.7), e('characterFocus', 0.8), e('patience', 0.7)]),
  t('good-bad-ugly', 'The Good, the Bad and the Ugly', 1966, 429, 0.65, [e('western', 1), e('vintage', 0.9), e('patience', 0.8), e('spectacle', 0.7)]),

  t('twelve-angry-men', '12 Angry Men', 1957, 389, 0.6, [e('legal', 1), e('dialogue', 1), e('vintage', 0.9), e('characterFocus', 0.9), e('spectacle', 0.6, true)]),
  t('spotlight', 'Spotlight', 2015, 314365, 0.55, [e('investigation', 1), e('grounded', 1), e('dialogue', 0.8), e('patience', 0.7), e('trueCrime', 0.5)]),
  t('social-network', 'The Social Network', 2010, 37799, 0.75, [e('dialogue', 1), e('grounded', 0.9), e('cynicism', 0.8), e('characterFocus', 0.8)]),
  t('moneyball', 'Moneyball', 2011, 60308, 0.6, [e('sport', 1), e('dialogue', 0.8), e('grounded', 0.9), e('characterFocus', 0.7)]),

  t('greatest-showman', 'The Greatest Showman', 2017, 316029, 0.75, [e('musical', 1), e('spectacle', 0.9), e('sentimentality', 1), e('comfort', 0.8), e('mainstream', 0.9)]),
  t('survivor', 'Survivor', 2000, 810, 0.7, [e('reality', 1), e('episodic', 0.9), e('sport', 0.5), e('comfort', 0.6)]),

  t('amelie', 'Amélie', 2001, 194, 0.6, [e('international', 1), e('subtitles', 0.9), e('weirdness', 0.8), e('warmth', 0.9), e('romance', 0.6)]),
  t('city-of-god', 'City of God', 2002, 598, 0.5, [e('international', 1), e('subtitles', 0.9), e('crime', 0.9), e('violence', 0.8), e('grounded', 0.9)]),
  t('oldboy', 'Oldboy', 2003, 670, 0.45, [e('international', 1), e('subtitles', 0.9), e('violence', 0.9), e('weirdness', 0.8), e('darkness', 0.9), e('ambiguity', 0.7)]),
  t('everything-everywhere', 'Everything Everywhere All at Once', 2022, 545611, 0.7, [e('weirdness', 1), e('scifi', 0.7), e('emotion', 0.9), e('comedy', 0.7), e('action', 0.6), e('international', 0.5)]),
  t('eternal-sunshine', 'Eternal Sunshine of the Spotless Mind', 2004, 38, 0.65, [e('romance', 0.9), e('weirdness', 0.9), e('emotion', 0.9), e('complexity', 0.8), e('ambiguity', 0.7)]),

  t('princess-bride', 'The Princess Bride', 1987, 2493, 0.7, [e('family', 0.9), e('comedy', 0.9), e('fantasy', 0.8), e('comfort', 1), e('warmth', 0.9), e('vintage', 0.6)]),
  t('paddington-2', 'Paddington 2', 2017, 346648, 0.55, [e('family', 1), e('comedy', 0.8), e('warmth', 1), e('comfort', 1), e('sentimentality', 0.8)]),
  t('harry-potter', 'Harry Potter and the Philosopher’s Stone', 2001, 671, 0.9, [e('fantasy', 1), e('family', 0.9), e('spectacle', 0.8), e('comfort', 0.8), e('mainstream', 0.9)]),
  t('jurassic-park', 'Jurassic Park', 1993, 329, 0.9, [e('spectacle', 1), e('action', 0.8), e('suspense', 0.8), e('mainstream', 0.9), e('family', 0.6)]),
  t('top-gun-maverick', 'Top Gun: Maverick', 2022, 361743, 0.8, [e('action', 1), e('spectacle', 1), e('mainstream', 0.9), e('sentimentality', 0.7), e('comfort', 0.6)]),
  t('fight-club', 'Fight Club', 1999, 550, 0.8, [e('psychological', 1), e('cynicism', 1), e('violence', 0.8), e('weirdness', 0.7), e('complexity', 0.7)]),
  t('game-of-thrones', 'Game of Thrones', 2011, 1399, 0.9, [e('fantasy', 1), e('episodic', 1), e('spectacle', 0.9), e('violence', 0.8), e('darkness', 0.7)]),
  t('stranger-things', 'Stranger Things', 2016, 66732, 0.85, [e('scifi', 0.8), e('supernatural', 0.7), e('episodic', 0.9), e('comfort', 0.7), e('vintage', 0.5), e('family', 0.5)]),
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
