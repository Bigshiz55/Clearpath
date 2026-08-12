/**
 * THE IDENTITY REVEAL — what the ending is allowed to say about somebody.
 *
 * ── WHY THIS IS A MODULE AND NOT JSX ──────────────────────────────────────
 * The old ending was a dashboard: cluster meters, a before/after percentage,
 * and a list of "closest titles". Every one of those is a measurement of OUR
 * machinery reported to a player who does not have it. The fix is not nicer
 * bars — it is deciding, in one testable place, which claims the evidence can
 * actually support. A results screen that renders whatever it is handed will
 * always drift back toward the data dump.
 *
 * ── FIVE THINGS, AND THE LAST TWO ARE THE POINT ───────────────────────────
 *   HOOKS         what reliably pulls you in.
 *   TURNOFFS      what kills a recommendation, which is different information
 *                 and usually stronger — people know what they refuse.
 *   CONTRADICTIONS the axes you argued with yourself about. Not a defect in
 *                 the data: it is the most interesting thing on the screen,
 *                 and it is why "you like intense films" is worthless next to
 *                 "you want dark, but not bleak".
 *   LEARNED       what MOVED this session, so the game can show it earned the
 *                 claims rather than knowing them already.
 *   UNSURE        stated plainly. A reveal that admits its edges is believable;
 *                 one that is confident about everything reads as a horoscope.
 *
 * ── NOTHING IS SAID BELOW ITS EVIDENCE FLOOR ──────────────────────────────
 * Every list is filtered by confidence before it is ranked, and each list can
 * come back EMPTY. A player who answered "haven't seen either" throughout has
 * taught the engine nothing and the screen must be able to say so — inventing
 * a hook to fill a slot is the exact failure this replaces.
 *
 * ── AND NOTHING IS RANKED BY CONFIDENCE ───────────────────────────────────
 * Ranking by confidence surfaces the axes everybody shares, so every player
 * gets the same reveal. These rank by DISTINCTIVENESS — how far from neutral
 * the belief is — which is what makes the screen about this person.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import { QUICK_TRAITS, traitBelief, traitConfidence, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';
import { contestedAxes, type AxisObservation } from './calibration';

export interface RevealItem {
  key: TraitKey;
  /** The axis in the player's words. */
  label: string;
  /** A sentence they would say about themselves, not about our axes. */
  line: string;
  /** Distance from neutral, 0..1 — what the list is ordered by. */
  strength: number;
}

export interface Reveal {
  hooks: RevealItem[];
  turnoffs: RevealItem[];
  contradictions: RevealItem[];
  learned: RevealItem[];
  unsure: RevealItem[];
  /** True when the session produced too little to say anything honestly. */
  thin: boolean;
}

/**
 * Below this an axis is a rumour, not a belief, and must not appear as a claim
 * about somebody. The reveal would rather be short than confident and wrong.
 */
const CLAIM_FLOOR = 0.18;

/** How far from 50 a belief must sit before it is worth a sentence. */
const DISTINCT_FLOOR = 0.22;

/** A session with fewer real observations than this cannot support a portrait. */
const MIN_OBSERVATIONS = 6;

const MAX_PER_LIST = 3;

/**
 * Consumer phrasing.
 *
 * The catalogue labels are OUR names for axes ("Appetite for fear", "Comfort
 * with dark material"). A reveal that uses them is describing its own
 * instrumentation. These are sentences a person might say about themselves,
 * which is the only register in which "we figured something out about you"
 * lands. Anything absent falls back to the label, so a new axis degrades to
 * plain rather than to nonsense.
 */
const HOOK: Partial<Record<TraitKey, string>> = {
  horrorTolerance: 'You want to be scared, properly',
  darkness: 'You go where it gets bleak',
  psychological: 'You want tension over spectacle',
  investigation: 'You want a puzzle to work',
  trueCrime: 'Real cases beat invented ones',
  crime: 'You gravitate to criminal worlds',
  romance: 'You want the love story to matter',
  comedy: 'You are here to laugh',
  action: 'You want spectacle and momentum',
  scifi: 'Big ideas pull you in',
  fantasy: 'You will go somewhere impossible',
  supernatural: 'The unexplained draws you',
  grounded: 'You want it to feel real',
  patience: 'You will wait for a slow build',
  complexity: 'You want to work for it',
  documentary: 'True stories, told straight',
  animation: 'Animation is not a lesser format to you',
  international: 'You look beyond English-language films',
  subtitles: 'Subtitles are not a barrier',
  vintage: 'You reach back past this decade',
  emotion: 'You want to be moved',
  sentimentality: 'You are fine with heart on sleeve',
  spectacle: 'You want scale',
  mainstream: 'You like what everybody likes, unapologetically',
  war: 'War and the military pull you in',
  sport: 'You are there for the competition',
  western: 'The frontier still works on you',
  musical: 'You will take a musical',
  superhero: 'Comic-book worlds land for you',
  period: 'You like being somewhere in the past',
  legal: 'You want the courtroom process',
  family: 'You are often picking for the room',
};

const OFF: Partial<Record<TraitKey, string>> = {
  horrorTolerance: 'Being scared is not the appeal',
  darkness: 'Bleak is where you get off',
  supernatural: 'Ghosts lose you',
  romance: 'A love story is not what you came for',
  comedy: 'You are not here for jokes',
  action: 'Spectacle alone does not hold you',
  scifi: 'Sci-fi is not your shelf',
  fantasy: 'The impossible loses you',
  patience: 'A slow build will lose you',
  complexity: 'You do not want homework',
  animation: 'Animation is a hard sell',
  subtitles: 'Subtitles are a real cost for you',
  international: 'You stay close to home',
  vintage: 'Older films are a hard sell',
  sentimentality: 'Sentiment reads as manipulation to you',
  mainstream: 'The obvious pick is not for you',
  war: 'War stories are not your thing',
  sport: 'Sport is not the draw',
  western: 'Westerns leave you cold',
  musical: 'Musicals are a hard no',
  superhero: 'Capes do not do it for you',
  period: 'The past is not where you look',
  investigation: 'A puzzle is not what you want',
  crime: 'Criminal worlds are not the draw',
  trueCrime: 'Real cases are not the appeal',
  legal: 'Courtroom process bores you',
  psychological: 'Slow tension is not it',
  emotion: 'You would rather not be wrung out',
  spectacle: 'Scale for its own sake does nothing',
  grounded: 'Realism is not what you are after',
  family: 'You are not picking for the room',
  documentary: 'Documentary is not the mode you want',
};

const label = (k: TraitKey): string => QUICK_TRAITS[k] ?? k;

/**
 * The player-facing sentence for an axis, in the direction the belief points.
 *
 * Used by every list, not just hooks and turnoffs — the first version let
 * `learned` and `unsure` fall back to raw catalogue labels, so a screen that
 * had just said "Ghosts lose you" would follow it with "Sport & competition"
 * and "Real cases over invented ones". Mixing the two registers is worse than
 * using either one consistently: it reads as a reveal that ran out of material
 * and started printing field names.
 */
function phraseFor(profile: TraitProfile, key: TraitKey): string {
  const high = traitBelief(profile, key).pref >= 50;
  return (high ? HOOK[key] : OFF[key]) ?? label(key);
}

function item(profile: TraitProfile, key: TraitKey, high: boolean): RevealItem {
  const pref = traitBelief(profile, key).pref;
  const strength = Math.abs(pref - 50) / 50;
  const phrase = high ? HOOK[key] : OFF[key];
  return { key, label: label(key), line: phrase ?? label(key), strength };
}

/** Axes the profile can honestly speak about at all. */
function speakable(profile: TraitProfile): TraitKey[] {
  return (Object.keys(profile) as TraitKey[]).filter(
    (k) => traitConfidence(profile, k) >= CLAIM_FLOOR,
  );
}

export function buildReveal(
  before: TraitProfile,
  after: TraitProfile,
  observations: readonly AxisObservation[],
): Reveal {
  const keys = speakable(after);

  const rank = (items: RevealItem[]) =>
    items
      .filter((i) => i.strength >= DISTINCT_FLOOR)
      .sort((a, b) => b.strength - a.strength)
      .slice(0, MAX_PER_LIST);

  const hooks = rank(
    keys.filter((k) => traitBelief(after, k).pref > 50).map((k) => item(after, k, true)),
  );
  const turnoffs = rank(
    keys.filter((k) => traitBelief(after, k).pref < 50).map((k) => item(after, k, false)),
  );

  /* THE CONTRADICTIONS COME FROM THE SAME PLACE THE 1-10 QUESTION DOES.
     One definition of "argued with yourself", used by the mechanic that asks
     about it and the screen that reports it — so the game cannot interrupt you
     about horror and then tell you it was sure about horror all along. */
  /* VARIED, BECAUSE THREE IDENTICAL SENTENCES READ AS A TEMPLATE. The first
     version ended every contradiction with "you went both ways on this one",
     and a stack of three made the section look generated rather than observed.
     Indexed rather than random so the screen is stable across re-renders. */
  const CONTRA = [
    (l: string) => `${l} — you want it, then you don't`,
    (l: string) => `${l} — you kept changing your mind, and meant it both times`,
    (l: string) => `${l} — it depends on the film, clearly`,
  ];
  const contradictions = contestedAxes(observations)
    .slice(0, MAX_PER_LIST)
    .map((c, i) => ({
      key: c.key,
      label: label(c.key),
      line: (CONTRA[i % CONTRA.length] as (l: string) => string)(label(c.key)),
      strength: c.contested,
    }));

  /* WHAT MOVED, not what is true. The difference between a game that learned
     something tonight and a profile that already existed. */
  const learned = (Object.keys(after) as TraitKey[])
    .map((k) => {
      const delta = Math.abs(traitBelief(after, k).pref - traitBelief(before, k).pref);
      return { key: k, label: label(k), line: phraseFor(after, k), strength: delta / 100 };
    })
    .filter((i) => i.strength > 0.05 && traitConfidence(after, i.key) >= CLAIM_FLOOR)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, MAX_PER_LIST);

  /* THE EDGES, STATED. Axes we touched but cannot yet stand behind — which is
     honest and, unlike a confidence percentage, actionable: it is the reason
     to play again. */
  const unsure = (Object.keys(after) as TraitKey[])
    .filter((k) => traitConfidence(after, k) > 0 && traitConfidence(after, k) < CLAIM_FLOOR)
    .map((k) => ({ key: k, label: label(k), line: phraseFor(after, k), strength: traitConfidence(after, k) }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, MAX_PER_LIST);

  return {
    hooks,
    turnoffs,
    contradictions,
    learned,
    unsure,
    thin: observations.length < MIN_OBSERVATIONS || (hooks.length === 0 && turnoffs.length === 0),
  };
}
