/**
 * THE TWIST — the only part of this product a competitor cannot copy by
 * looking at it.
 *
 * Every recommender on the market observes CHOICES. A choice is hopelessly
 * confounded: someone picks Zodiac over Hereditary and there are six live
 * explanations — they like investigation, they dislike the supernatural, they
 * have seen one and not the other, they recognised a face, it was on the left.
 * Averaging over enough choices eventually cancels the noise, which is why
 * every service needs months of history to become useful.
 *
 * A counterfactual collapses that in one question. Take the title they just
 * chose, change EXACTLY ONE attribute, and ask again:
 *
 *     "Same mystery — but it's subtitled."
 *     "Same film — but it starts slowly."
 *     "Same story — but you've already seen it."
 *
 * Because only one thing moved, the answer is attributable. Holding the choice
 * fixed and varying one axis is the difference between correlation and cause,
 * and it is why a minute here can be worth months of passive logging.
 *
 * TWO RULES KEEP IT HONEST.
 *
 *   A twist is only offered when it can CHANGE something — it must name a real
 *   axis whose belief is still open, or a context rule tonight depends on.
 *   `NEVER_TWIST` blocks the rest.
 *
 *   A twist answer is evidence about ONE axis: the one that moved. Everything
 *   else about the title is held constant by construction, so nothing else may
 *   be updated from it. That is the whole point, and the thing that would be
 *   silently destroyed by "helpfully" updating the other traits too.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import type { DiagnosticTitle } from '@/lib/voice/quickdna/definition';
import { traitUncertainty, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';

/** How strongly a controlled counterfactual moves the axis it isolates. */
export const TWIST_WEIGHT = 0.42;

/**
 * The heaviest evidence in the product, deliberately.
 *
 * Ordinary choices are confounded, so they are worth less per answer however
 * many you collect. This one holds everything else constant, which is what
 * earns it the top of the ladder.
 */
export interface Twist {
  id: string;
  /** The axis being isolated. The answer is evidence about THIS and nothing else. */
  axis: TraitKey;
  /** Shown to the player, referring to the title they just chose. */
  prompt: (title: DiagnosticTitle) => string;
  /**
   * The changed attribute on its own, with no sentence around it.
   *
   * The surface shows the experiment rather than describing it: the anchor
   * title is rendered as held-constant and this is stamped on top as the single
   * thing that moved. Keeping it as its own field means the UI cannot get the
   * variable wrong by parsing the prompt for it.
   */
  change: string;
  /** Saying yes means they tolerate the changed attribute. */
  stillYes: string;
  stillNo: string;
  /** Which direction "still yes" pushes the axis. */
  yesMeans: 'higher' | 'lower';
}

export const TWISTS: readonly Twist[] = [
  {
    id: 'subtitled',
    axis: 'subtitles',
    prompt: (t) => `Same as ${t.title} — but it’s subtitled.`,
    change: 'It’s subtitled',
    stillYes: 'Still watching',
    stillNo: 'Not tonight',
    yesMeans: 'higher',
  },
  {
    id: 'slow-open',
    axis: 'patience',
    prompt: (t) => `Same as ${t.title} — but the first twenty minutes are slow.`,
    change: 'The first twenty minutes are slow',
    stillYes: 'I’ll wait for it',
    stillNo: 'Lost me',
    yesMeans: 'higher',
  },
  {
    id: 'unknown-cast',
    axis: 'international',
    prompt: (t) => `Same as ${t.title} — but nobody in it is famous.`,
    change: 'Nobody in it is famous',
    stillYes: 'Fine by me',
    stillNo: 'I’d rather not',
    yesMeans: 'higher',
  },
  {
    id: 'darker',
    axis: 'darkness',
    prompt: (t) => `Same as ${t.title} — but genuinely bleak.`,
    change: 'It’s genuinely bleak',
    stillYes: 'Bring it',
    stillNo: 'Too much',
    yesMeans: 'higher',
  },
  {
    id: 'supernatural',
    axis: 'supernatural',
    prompt: (t) => `Same as ${t.title} — but the explanation turns out to be supernatural.`,
    change: 'The explanation is supernatural',
    stillYes: 'Still in',
    stillNo: 'Ruins it',
    yesMeans: 'higher',
  },
  {
    id: 'complex',
    axis: 'complexity',
    prompt: (t) => `Same as ${t.title} — but you have to concentrate the whole way.`,
    change: 'You concentrate the whole way',
    stillYes: 'Good',
    stillNo: 'Not tonight',
    yesMeans: 'higher',
  },
  {
    id: 'vintage',
    axis: 'vintage',
    prompt: (t) => `Same as ${t.title} — but made in 1974.`,
    change: 'It was made in 1974',
    stillYes: 'Still watching',
    stillNo: 'I’d skip it',
    yesMeans: 'higher',
  },
  {
    id: 'funny',
    axis: 'comedy',
    prompt: (t) => `Same as ${t.title} — but it’s played for laughs.`,
    change: 'It’s played for laughs',
    stillYes: 'Better, actually',
    stillNo: 'Spoils it',
    yesMeans: 'higher',
  },
];

/**
 * Axes a twist must never claim to isolate.
 *
 * `grounded` and `psychological` are entangled with too much else in the title
 * vectors for a one-line counterfactual to hold everything constant — a
 * "but it's far-fetched" twist quietly changes tone, genre and plausibility at
 * once, which is exactly the confounding this mechanism exists to remove. They
 * are learned from ordinary reactions instead.
 */
export const NEVER_TWIST: readonly TraitKey[] = ['grounded', 'psychological'];

export interface TwistContext {
  profile: TraitProfile;
  /** Twist ids already used this session — never repeat one. */
  used: readonly string[];
  /** The title the twist will be built from: something they just kept. */
  anchor: DiagnosticTitle;
}

/**
 * The most valuable twist available, or null when none would teach anything.
 *
 * Returning null is a real outcome: if every remaining axis is settled, a twist
 * would be theatre. The caller shows something else instead.
 */
export function nextTwist(ctx: TwistContext, floor = 0.12): Twist | null {
  let best: Twist | null = null;
  let bestScore = floor;

  for (const twist of TWISTS) {
    if (ctx.used.includes(twist.id)) continue;
    if (NEVER_TWIST.includes(twist.axis)) continue;
    // Worth asking exactly to the extent the axis is still open.
    const score = traitUncertainty(ctx.profile, twist.axis);
    if (score > bestScore) {
      bestScore = score;
      best = twist;
    }
  }
  return best;
}

/**
 * What a twist answer means — one axis, nothing else.
 *
 * Deliberately returns a single observation. A longer list would mean the
 * counterfactual had failed to hold the rest constant.
 */
export function twistEvidence(
  twist: Twist,
  stayed: boolean,
): Array<{ key: TraitKey; target: number; weight: number }> {
  const up = twist.yesMeans === 'higher' ? stayed : !stayed;
  return [{ key: twist.axis, target: up ? 100 : 0, weight: TWIST_WEIGHT }];
}
