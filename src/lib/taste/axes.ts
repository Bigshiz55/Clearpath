/**
 * THE CANONICAL TASTE VOCABULARY — one registry every surface writes into and
 * every recommender reads from.
 *
 * THE ARCHITECTURE DECISION, AND WHY IT IS NOT A/B.
 *
 * The question was whether to (A) expand the canonical ranking profile to carry
 * the rich vocabulary, (B) run a second rich vector alongside the existing 15,
 * or (C) something better. The codebase already answered it, and the answer was
 * hiding in a type:
 *
 *     ChannelProfile.dims: Record<string, TraitBelief>
 *
 * Storage was never fifteen-dimensional. `deriveDna` folds whatever keys an
 * event's `dims` carries; the fifteen-key limit lives entirely in READ-SIDE
 * loops — `for (const k of DIMENSION_KEYS)` in `rank.ts`, `engine.ts`,
 * `explain.ts`, `strength.ts` — and in the classifier that produces title
 * fingerprints.
 *
 * So (B) is strictly worse than doing nothing: a parallel vector would mean two
 * stores to reconcile, two confidences to blend, two nudges to bound, and a
 * migration on sign-in. And (A) as normally meant — replace the 15 — would
 * orphan every belief already accumulated under those keys.
 *
 * (C) is: THE FIFTEEN ARE A SUBSET OF THE CANONICAL SET, NOT A PARALLEL SYSTEM.
 * The same keys, the same storage, the same `TraitBelief`, the same confidence
 * curve. Existing evidence keeps accumulating exactly where it was. Rich axes
 * are additional keys in the same map, and the read side iterates this registry
 * instead of `DIMENSION_KEYS`. There is no bridge to maintain because there are
 * not two things to bridge.
 *
 * `src/lib/scoring/` IS UNTOUCHED. `DIMENSION_KEYS` remains exactly the fifteen
 * axes the deterministic Watchability engine scores on, because that engine is
 * authoritative and is not a personalization model. This registry is the
 * PERSONALIZATION vocabulary, which is a superset — a title can be ranked
 * against someone's taste on `weirdness` without `weirdness` ever entering the
 * deterministic score.
 *
 * WHICH AXES SURVIVED WAS MEASURED, NOT ASSERTED. See `audit.ts` for the
 * criterion (separating pairs, not correlation) and `axes.test.ts` for the run
 * that proves every retained axis is distinguishable from every other one in the
 * live catalogue.
 *
 * PURE DATA. No I/O.
 */

import { DIMENSIONS } from '@/lib/scoring/dimensions';
import type { TraitKey } from '@/lib/voice/quickdna/traits';

/** Which part of taste an axis describes. Used for readouts, never for math. */
export type AxisFamily = 'tone' | 'story' | 'energy' | 'world' | 'edge' | 'form' | 'constraint';

export interface TasteAxis {
  key: string;
  label: string;
  /** What 0 means. */
  low: string;
  /** What 100 means. */
  high: string;
  family: AxisFamily;
  /**
   * One of the deterministic engine's fifteen. Retained verbatim — same key,
   * same polarity — so evidence accumulated before this registry existed keeps
   * accumulating in the same place.
   */
  legacy: boolean;
  /**
   * A constraint rather than a preference: "can the room watch this", "will they
   * read subtitles". Ranked identically, flagged separately because a readout
   * that says "you love films the whole family can watch" is describing a
   * Tuesday, not a person.
   */
  constraint?: boolean;
}

const legacyAxis = (key: string, family: AxisFamily): TasteAxis => {
  const d = DIMENSIONS.find((x) => x.key === key);
  if (!d) throw new Error(`legacy axis ${key} is not a scoring dimension`);
  return { key: d.key, label: d.label, low: d.low, high: d.high, family, legacy: true };
};

/**
 * THE FIFTEEN, INHERITED. Definitions come from `src/lib/scoring/dimensions.ts`
 * rather than being retyped, so the two can never drift apart — a copy would be
 * correct on the day it was written and wrong the first time either moved.
 */
const LEGACY: TasteAxis[] = [
  legacyAxis('pacing', 'energy'),
  legacyAxis('darkness', 'tone'),
  legacyAxis('warmth', 'tone'),
  legacyAxis('humor', 'tone'),
  legacyAxis('suspense', 'energy'),
  legacyAxis('emotion', 'tone'),
  legacyAxis('complexity', 'story'),
  legacyAxis('realism', 'world'),
  legacyAxis('character', 'story'),
  legacyAxis('stakes', 'energy'),
  legacyAxis('morality', 'story'),
  legacyAxis('violence', 'edge'),
  legacyAxis('attention', 'story'),
  legacyAxis('serialized', 'form'),
  legacyAxis('romance', 'tone'),
];

/**
 * THE THIRTEEN THE FIFTEEN COULD NOT SAY.
 *
 * Every one of these was checked against every retained axis on the live
 * catalogue and clears the separability bar — there exist title pairs that split
 * it one way and its nearest neighbour the other, which is precisely the
 * condition for the game being able to learn them apart. The measured
 * hardest-to-separate neighbour is named on each.
 */
const RICH: TasteAxis[] = [
  {
    // Nearest: ambiguity (sep=42, r=0.38). NOT complexity (sep=150): a film can
    // be hard work and perfectly conventional, or effortless and deeply strange.
    key: 'weirdness',
    label: 'Strangeness',
    low: 'Plays it straight',
    high: 'Surreal & offbeat',
    family: 'story',
    legacy: false,
  },
  {
    // Nearest: weirdness (sep=42). Distinct from `morality`, which is about
    // characters being grey; this is about the STORY refusing to resolve. The
    // Departed is morally grey and completely resolved.
    key: 'ambiguity',
    label: 'Resolution',
    low: 'Wants an answer',
    high: 'Fine without one',
    family: 'story',
    legacy: false,
  },
  {
    // Nearest: serialized (under-determined). Against the two axes it is usually
    // assumed to be a blend of: darkness sep=184, violence sep=88. It is not
    // "darkness + violence" and the catalogue says so loudly — plenty of people
    // want dread without gore, or bleakness without fear.
    key: 'horrorTolerance',
    label: 'Appetite for fear',
    low: 'Not here to be scared',
    high: 'Wants to be scared',
    family: 'edge',
    legacy: false,
  },
  {
    // Nearest: violence (sep=32, r=0.37). Distinct from low `warmth` (sep=81):
    // warmth is whether a film is kind, cynicism is whether it believes people
    // are. A bleak film can be deeply humane.
    key: 'cynicism',
    label: 'View of people',
    low: 'Believes in them',
    high: 'Hard-eyed',
    family: 'tone',
    legacy: false,
  },
  {
    // Nearest: serialized (under-determined); vs warmth sep=32, vs cynicism
    // sep=45. UNDER-COVERED at 5 titles — a reported hole in the instrument, not
    // a reason to drop the axis. See `axes.test.ts`.
    key: 'sentimentality',
    label: 'Sentiment',
    low: 'Understated',
    high: 'Worn openly',
    family: 'tone',
    legacy: false,
  },
  {
    // Nearest: character (sep=36, r=0.46). They are close and they are not the
    // same: a character study can be near-silent, and a plot-driven farce can be
    // wall-to-wall dialogue.
    key: 'dialogue',
    label: 'Dialogue',
    low: 'Visual',
    high: 'Talky',
    family: 'story',
    legacy: false,
  },
  {
    // Nearest: serialized (under-determined); vs suspense sep=63, vs complexity
    // sep=65. Tension located INSIDE people rather than in the situation.
    key: 'psychological',
    label: 'Psychological',
    low: 'External stakes',
    high: 'Inside their heads',
    family: 'story',
    legacy: false,
  },
  {
    // Nearest: sentimentality (sep=11, r=0.43). A MODE, not a tone: "I watch to
    // feel better" rather than "I want warm films".
    key: 'comfort',
    label: 'Comfort',
    low: 'Wants a challenge',
    high: 'Wants to feel better',
    family: 'form',
    legacy: false,
  },
  {
    key: 'animation',
    label: 'Animation',
    low: 'Live action',
    high: 'Animated',
    family: 'form',
    legacy: false,
  },
  {
    key: 'period',
    label: 'Setting',
    low: 'Present day',
    high: 'The past',
    family: 'world',
    legacy: false,
  },
  {
    // The film's OWN age, not the story's setting. vs period sep=176 — these are
    // routinely confused and the catalogue separates them cleanly.
    key: 'vintage',
    label: 'Era of the film',
    low: 'Recent',
    high: 'Older',
    family: 'world',
    legacy: false,
  },
  {
    // A CONSTRAINT. Absorbs `international`, which is genuinely redundant with
    // it: sep=0 at r=0.88 on the live catalogue — the one merge the audit
    // actually justifies.
    key: 'subtitles',
    label: 'Subtitles',
    low: 'Would rather not read',
    high: 'No barrier',
    family: 'constraint',
    legacy: false,
    constraint: true,
  },
  {
    // A CONSTRAINT, and the code that first defined it said so: "watchable with
    // children in the room — a scheduling constraint, not a taste".
    key: 'family',
    label: 'Room-safe',
    low: 'Adult',
    high: 'Everyone can watch',
    family: 'constraint',
    legacy: false,
    constraint: true,
  },
];

export const TASTE_AXES: readonly TasteAxis[] = [...LEGACY, ...RICH];
export const TASTE_AXIS_KEYS: readonly string[] = TASTE_AXES.map((a) => a.key);
export const RICH_AXIS_KEYS: readonly string[] = RICH.map((a) => a.key);

export function tasteAxis(key: string): TasteAxis | undefined {
  return TASTE_AXES.find((a) => a.key === key);
}

/* ------------------------------------------------------------------ *
 * WHERE EACH OF THE FORTY-FOUR WENT
 * ------------------------------------------------------------------ */

/**
 * The five dispositions, and the rule for each.
 *
 * `axis`     a genuinely independent preference signal — its own canonical key.
 * `genre`    a CATEGORY, not a taste axis. Routed to the genre-affinity channel,
 *            which already exists and already contributes to ranking. "Likes
 *            westerns" is an affinity for a shelf; it is not a dimension people
 *            vary along continuously.
 * `novelty`  metadata the engine already models as a first-class field.
 * `merged`   provably redundant with another axis on the live catalogue.
 *
 * NOTHING IS DISCARDED. A trait routed to `genre` still reaches the ranker —
 * `preferenceNudge` gives genre affinity a 30% share — it simply reaches it
 * through the channel that means what it means. That is the difference between
 * "we dropped it" and "we filed it correctly".
 */
export type TraitRoute =
  | { kind: 'axis'; axis: string; invert?: boolean; why: string }
  | { kind: 'genre'; slug: string; why: string }
  | { kind: 'novelty'; invert?: boolean; why: string }
  | { kind: 'merged'; axis: string; why: string };

export const TRAIT_ROUTES: Record<TraitKey, TraitRoute> = {
  /* --- identity: the trait and the legacy axis are the same claim --- */
  darkness: { kind: 'axis', axis: 'darkness', why: 'Same claim as the legacy tone axis.' },
  warmth: { kind: 'axis', axis: 'warmth', why: 'Same claim as the legacy warmth axis.' },
  suspense: { kind: 'axis', axis: 'suspense', why: 'Same claim as the legacy tension axis.' },
  emotion: { kind: 'axis', axis: 'emotion', why: 'Same claim as the legacy emotional-intensity axis.' },
  complexity: { kind: 'axis', axis: 'complexity', why: 'Same claim as the legacy complexity axis.' },
  violence: { kind: 'axis', axis: 'violence', why: 'Same claim as the legacy content-edge axis.' },
  romance: { kind: 'axis', axis: 'romance', why: 'Same claim as the legacy romance axis.' },

  /* --- renames: the same axis under a different word --- */
  comedy: { kind: 'axis', axis: 'humor', why: 'Showdown’s word for the legacy humor axis.' },
  grounded: { kind: 'axis', axis: 'realism', why: 'Showdown’s word for the legacy realism axis.' },
  characterFocus: { kind: 'axis', axis: 'character', why: 'Showdown’s word for the legacy plot-vs-character axis.' },
  spectacle: { kind: 'axis', axis: 'stakes', why: 'Visual and narrative scale; the legacy intimate-to-epic axis (sep=80 vs action).' },

  /* --- inversions: same axis, opposite pole --- */
  patience: {
    kind: 'axis',
    axis: 'pacing',
    invert: true,
    why: 'Appetite for a slow build IS the low pole of pace. Inverted rather than duplicated.',
  },
  episodic: {
    kind: 'axis',
    axis: 'serialized',
    invert: true,
    why: 'Wanting a long series is the high pole of the legacy structure axis; "ends tonight" is the low one.',
  },

  /* --- the new axes --- */
  weirdness: { kind: 'axis', axis: 'weirdness', why: 'Independent of complexity (sep=150) and ambiguity (sep=42).' },
  ambiguity: { kind: 'axis', axis: 'ambiguity', why: 'Independent of complexity (sep=160) and of moral greyness.' },
  horrorTolerance: {
    kind: 'axis',
    axis: 'horrorTolerance',
    why: 'Independent of darkness (sep=184) and violence (sep=88) — it is not their sum.',
  },
  cynicism: { kind: 'axis', axis: 'cynicism', why: 'Independent of warmth (sep=81) and of sentimentality (sep=45).' },
  sentimentality: { kind: 'axis', axis: 'sentimentality', why: 'Independent of warmth (sep=32) and cynicism (sep=45). Under-covered at 5 titles.' },
  dialogue: { kind: 'axis', axis: 'dialogue', why: 'Independent of character focus (sep=36).' },
  psychological: { kind: 'axis', axis: 'psychological', why: 'Independent of suspense (sep=63) and complexity (sep=65).' },
  comfort: { kind: 'axis', axis: 'comfort', why: 'A viewing mode; independent of warmth (sep=40) and mainstream (sep=56).' },
  animation: { kind: 'axis', axis: 'animation', why: 'A form nothing else predicts — people who love it often dislike its usual genre neighbours.' },
  period: { kind: 'axis', axis: 'period', why: 'Where the story is set. Independent of the film’s own age (sep=176).' },
  vintage: { kind: 'axis', axis: 'vintage', why: 'How old the film is. Routinely confused with `period`; cleanly separable from it.' },
  subtitles: { kind: 'axis', axis: 'subtitles', why: 'A real constraint that materially decides whether a recommendation lands.' },
  family: { kind: 'axis', axis: 'family', why: 'A scheduling constraint, ranked but flagged so no readout calls it a taste.' },

  /* --- the one provable merge --- */
  international: {
    kind: 'merged',
    axis: 'subtitles',
    why: 'sep=0 at r=0.88 on the live catalogue — no pair of titles distinguishes them, so keeping both splits one belief across two keys and halves the confidence in each.',
  },

  /* --- categories, routed to the genre-affinity channel --- */
  crime: { kind: 'genre', slug: 'crime', why: 'A category, and the genre channel already ranks it.' },
  investigation: { kind: 'genre', slug: 'mystery', why: 'Mystery-solving is the mystery genre, not a continuous taste axis.' },
  trueCrime: { kind: 'genre', slug: 'documentary', why: 'Only 3 titles carry it and it is inseparable from documentary (sep=4); the genre channel is where it can accumulate.' },
  legal: { kind: 'genre', slug: 'drama', why: '2 titles. Not enough support to be its own axis.' },
  supernatural: { kind: 'genre', slug: 'horror', why: 'Inseparable from horrorTolerance in this corpus (sep=7) and category-shaped; the axis keeps the appetite, the channel keeps the shelf.' },
  scifi: { kind: 'genre', slug: 'science-fiction', why: 'A category with a first-class genre home.' },
  fantasy: { kind: 'genre', slug: 'fantasy', why: 'A category. The realism axis already carries the grounded-to-fantastical taste.' },
  documentary: { kind: 'genre', slug: 'documentary', why: 'A category.' },
  superhero: { kind: 'genre', slug: 'action', why: 'sep=0 vs action on the live catalogue and only 3 titles — unlearnable as an axis.' },
  western: { kind: 'genre', slug: 'western', why: '4 titles. A shelf, not a dimension.' },
  musical: { kind: 'genre', slug: 'music', why: '4 titles. A shelf, not a dimension.' },
  sport: { kind: 'genre', slug: 'drama', why: '5 titles, no TMDB genre of its own. A subject, not a taste axis.' },
  war: { kind: 'genre', slug: 'war', why: '4 titles. A subject with a genre home.' },
  martialArts: { kind: 'genre', slug: 'action', why: '1 title. Nothing can be learned from it as an axis.' },
  reality: { kind: 'genre', slug: 'reality', why: '2 titles. A format with a genre home.' },
  action: { kind: 'genre', slug: 'action', why: 'sep=0 vs superhero; its pace component is already the pacing axis, and what remains is the category.' },

  /* --- metadata the engine already models --- */
  mainstream: {
    kind: 'novelty',
    invert: true,
    why: 'Appetite for the obvious pick is the inverse of the discovery-appetite field `ChannelProfile.novelty`, which already exists and already ranks.',
  },
};

/** Every trait routed to a canonical axis, with its polarity. */
export function axisForTrait(trait: TraitKey): { axis: string; invert: boolean } | null {
  const route = TRAIT_ROUTES[trait];
  if (route.kind === 'axis') return { axis: route.axis, invert: route.invert ?? false };
  if (route.kind === 'merged') return { axis: route.axis, invert: false };
  return null;
}
