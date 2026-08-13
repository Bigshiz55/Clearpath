/**
 * "WE CAUGHT SOMETHING" — and the user gets to say whether we did.
 *
 * A percentage bar tells someone the machine is busy. A SENTENCE about them
 * tells them it is paying attention, and it is the only thing on the screen
 * that can be wrong in a way they can feel — which is exactly why it is worth
 * showing, and exactly why it has to come with a way to push back.
 *
 * TWO RULES KEEP THIS FROM BECOMING A HOROSCOPE.
 *
 * ONE: EVERY DISCOVERY IS A CONJUNCTION, not a single axis. "You like dark
 * stories" describes most people who finish a scan and reads as flattery.
 * "You'll sit through a slow build, but only when it's going somewhere dark" is
 * a claim about a specific person, and it is only sayable when two axes are BOTH
 * confident and pointing in directions that are not usually found together. The
 * interesting fact about a person is almost never one axis; it is the
 * combination a genre label cannot express.
 *
 * TWO: NOTHING IS SAID BELOW THRESHOLD. An axis the scan has not resolved is
 * absent, not hedged. Ninety seconds cannot know everything about somebody and
 * a system that pretends otherwise is the thing this rebuild exists to replace.
 *
 * "NOT QUITE" IS THE MOST VALUABLE TAP IN THE GAME. It is a single-axis
 * correction from the person themselves — the cleanest evidence the product can
 * ever collect, better than any inference — so it is not a dismissal, it is an
 * input. Confirming is worth less than correcting, and both are worth more than
 * a matchup, which is why interrupting for one is justified.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import {
  traitBelief,
  traitConfidence,
  type TraitKey,
  type TraitProfile,
} from '@/lib/voice/quickdna/traits';
import { MAX_PERMANENT_WEIGHT } from './attribution';
import type { PermanentTraitEvidence } from './evidence';

/** Below this confidence an axis may not appear in a claim at all. */
export const CLAIM_CONFIDENCE = 0.34;
/** Below this lean the belief is not decisive enough to phrase. */
export const CLAIM_LEAN = 14;

export interface Discovery {
  id: string;
  /** The sentence shown to the player. */
  text: string;
  /** The axes it rests on. Confirming or denying moves exactly these. */
  axes: Array<{ key: TraitKey; high: boolean }>;
  /** 0..1 — how strongly the evidence supports it. Drives ordering, never shown. */
  strength: number;
}

/**
 * PAIRINGS THAT ARE WORTH A SENTENCE.
 *
 * Hand-written because the interesting combinations are a matter of meaning, not
 * arithmetic: `patience` high with `darkness` high is a recognisable kind of
 * viewer, and `patience` high with `subtitles` high is just two facts. Each
 * entry names the two axes, the directions that make it true, and the sentence.
 *
 * The phrasing is deliberately about WHAT THEY WATCH, never about who they are.
 * "You're a serious person" is a personality claim the evidence cannot support;
 * "you'll wait for a slow build when it's heading somewhere dark" is a statement
 * about films, which is all anybody actually told us.
 */
interface Rule {
  id: string;
  a: { key: TraitKey; high: boolean };
  b: { key: TraitKey; high: boolean };
  text: string;
}

const RULES: readonly Rule[] = [
  {
    id: 'slow-but-dark',
    a: { key: 'patience', high: true },
    b: { key: 'darkness', high: true },
    text: 'You’ll sit through a slow build — as long as it’s heading somewhere dark.',
  },
  {
    id: 'fear-not-gore',
    a: { key: 'horrorTolerance', high: true },
    b: { key: 'violence', high: false },
    text: 'You want to be scared, not shown the gore. That’s dread, not splatter.',
  },
  {
    id: 'weird-not-hard',
    a: { key: 'weirdness', high: true },
    b: { key: 'complexity', high: false },
    text: 'You like films that refuse to behave — you just don’t want homework.',
  },
  {
    id: 'dark-but-fast',
    a: { key: 'darkness', high: true },
    b: { key: 'patience', high: false },
    text: 'You go to dark places, but you want the film to move.',
  },
  {
    id: 'character-not-talky',
    a: { key: 'characterFocus', high: true },
    b: { key: 'dialogue', high: false },
    text: 'People interest you more than plot — but you’d rather be shown than told.',
  },
  {
    id: 'sincere-not-soft',
    a: { key: 'emotion', high: true },
    b: { key: 'sentimentality', high: false },
    text: 'You want it to land emotionally without being told how to feel.',
  },
  {
    id: 'grounded-but-strange',
    a: { key: 'grounded', high: true },
    b: { key: 'weirdness', high: true },
    text: 'You want the real world — just tilted slightly off its axis.',
  },
  {
    id: 'unresolved',
    a: { key: 'ambiguity', high: true },
    b: { key: 'complexity', high: true },
    text: 'You’ll do the work, and you don’t need the ending handed to you.',
  },
  {
    id: 'comfort-not-bland',
    a: { key: 'comfort', high: true },
    b: { key: 'mainstream', high: false },
    text: 'You watch to feel better — but not with whatever everyone else is watching.',
  },
  {
    id: 'spectacle-with-ideas',
    a: { key: 'spectacle', high: true },
    b: { key: 'complexity', high: true },
    text: 'You want scale you can see, with an idea underneath it.',
  },
  {
    id: 'funny-and-dark',
    a: { key: 'comedy', high: true },
    b: { key: 'darkness', high: true },
    text: 'Your comedy has teeth.',
  },
  {
    id: 'subtitles-worth-it',
    a: { key: 'subtitles', high: true },
    b: { key: 'mainstream', high: false },
    text: 'Subtitles don’t slow you down, and the obvious pick is rarely your pick.',
  },
  {
    id: 'not-here-for-romance',
    a: { key: 'romance', high: false },
    b: { key: 'suspense', high: true },
    text: 'You’d trade the love story for another turn of the screw.',
  },
  {
    id: 'real-over-invented',
    a: { key: 'documentary', high: true },
    b: { key: 'grounded', high: true },
    text: 'You’d rather it actually happened.',
  },
];

function holds(profile: TraitProfile, side: { key: TraitKey; high: boolean }): number {
  const c = traitConfidence(profile, side.key);
  if (c < CLAIM_CONFIDENCE) return 0;
  const b = traitBelief(profile, side.key);
  const lean = b.pref - 50;
  if (Math.abs(lean) < CLAIM_LEAN) return 0;
  if (side.high !== lean > 0) return 0;
  return c * (Math.abs(lean) / 50);
}

/**
 * Everything the evidence currently supports saying, strongest first.
 *
 * `exclude` carries the ids already put to this player — a discovery is a
 * moment, and a moment repeated is a screensaver.
 */
export function discoveriesFor(
  profile: TraitProfile,
  exclude: readonly string[] = [],
): Discovery[] {
  const seen = new Set(exclude);
  const out: Discovery[] = [];
  for (const rule of RULES) {
    if (seen.has(rule.id)) continue;
    const sa = holds(profile, rule.a);
    const sb = holds(profile, rule.b);
    if (sa === 0 || sb === 0) continue;
    out.push({
      id: rule.id,
      text: rule.text,
      axes: [rule.a, rule.b],
      // The WEAKER half governs. A conjunction is only as true as its shakier
      // side, and averaging would let one certainty carry a guess.
      strength: Math.min(sa, sb),
    });
  }
  return out.sort((x, y) => y.strength - x.strength);
}

/**
 * How much a player's own verdict on a claim is worth.
 *
 * CONFIRMATION IS WORTH LESS THAN CORRECTION, and deliberately so. "That's me"
 * agrees with something the engine already believes — it is real evidence, but
 * it is evidence for the thing the engine was already going to act on, so it
 * mostly buys confidence rather than direction. "Not quite" contradicts a
 * confident belief, which is the rarest and most valuable thing a user can say:
 * it is the only input that can pull a profile off a wrong track it has already
 * committed to.
 */
export const CONFIRM_WEIGHT = MAX_PERMANENT_WEIGHT * 0.75;
export const CORRECT_WEIGHT = MAX_PERMANENT_WEIGHT;

/**
 * Evidence from a verdict on a discovery.
 *
 * Both axes move, because the claim was a conjunction and the player answered
 * about the whole sentence. A denial pushes each axis toward the middle rather
 * than to the opposite pole: "not quite" means "that is not right about me", not
 * "the reverse is true about me", and inverting it would invent an opinion out
 * of a correction.
 */
export function discoveryEvidence(
  discovery: Discovery,
  verdict: 'confirm' | 'correct',
): PermanentTraitEvidence[] {
  return discovery.axes.map((axis) => ({
    kind: 'permanent' as const,
    key: axis.key,
    target:
      verdict === 'confirm'
        ? axis.high
          ? 100
          : 0
        : // Toward neutral, not to the opposite pole.
          50,
    weight: verdict === 'confirm' ? CONFIRM_WEIGHT : CORRECT_WEIGHT,
    // The player named the axes themselves by answering the sentence, so there
    // is no attribution ambiguity left to price in.
    attribution: 1,
  }));
}

/** How many rounds must pass between discoveries, so they stay events. */
export const DISCOVERY_SPACING = 5;
/** Never open with one — there is nothing to have caught yet. */
export const DISCOVERY_EARLIEST = 4;

export function discoveryDue(
  decisionCount: number,
  lastDiscoveryRound: number,
  shown: number,
  max = 3,
): boolean {
  if (shown >= max) return false;
  if (decisionCount < DISCOVERY_EARLIEST) return false;
  return decisionCount - lastDiscoveryRound >= DISCOVERY_SPACING;
}
