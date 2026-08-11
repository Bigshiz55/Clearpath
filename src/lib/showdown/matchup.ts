/**
 * DNA SHOWDOWN — choosing the matchup.
 *
 * This file is the feature. Two posters and a tap is trivial to build; the
 * value is entirely in WHICH two, and the answer is never "two popular films".
 *
 * WHAT MAKES A PAIR WORTH ASKING
 *
 * A matchup earns its place when the answer SEPARATES something we do not yet
 * know. That is one quantity, and it decomposes into three:
 *
 *   DISAGREEMENT — the two titles must pull opposite ways on some axis. Two
 *     films that both say "likes crime" cost a decision and teach nothing,
 *     because either answer is consistent with every hypothesis we hold.
 *   UNCERTAINTY — the axis they disagree on must be one we are unsure about.
 *     Separating two films on `darkness` for someone whose darkness we already
 *     know to three decimal places is a wasted turn, however sharp the split.
 *   ANSWERABILITY — both films must be recognisable enough to have an opinion
 *     about. A perfectly diagnostic pair of films nobody has seen returns
 *     "neither" and teaches almost nothing.
 *
 * Multiplied together these give information gain, and the planner simply takes
 * the argmax. Everything else here — the plausibility floor, the repeat guard,
 * the staleness of an axis already asked about — exists to stop that argmax
 * degenerating into the same handful of pairs.
 *
 * WHY IT GETS MORE PERSONAL, NOT LESS
 *
 * Uncertainty falls as evidence arrives, so the axes that dominate the score
 * shift from "what do they like at all" to whatever is still genuinely open for
 * THIS person. A returning player with a settled profile scores near-zero on
 * everything a new player is asked, and the argmax lands on the fine splits
 * instead. That behaviour is not special-cased anywhere; it falls out of using
 * uncertainty as a multiplier, and `intelligence.test.ts` measures it.
 *
 * PURE. No I/O, no clock, no randomness — the same profile and history always
 * produce the same matchup, which is what makes the simulations meaningful.
 */

import { TITLES, type DiagnosticTitle } from '@/lib/voice/quickdna/definition';
import { traitUncertainty, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';
import { attributionConfidence, isTwist } from './attribution';

export interface Matchup {
  left: DiagnosticTitle;
  right: DiagnosticTitle;
  /**
   * The axes this pair separates, strongest first. Stored on the decision so a
   * later reader knows WHY it was asked, not just what was answered.
   */
  testing: TraitKey[];
  /** Expected information gain at the moment it was dealt. */
  gain: number;
  /**
   * How cleanly this pair isolates a single axis, 0..1. 1 is a Twist.
   *
   * Computed here rather than at write time because it is a property of the
   * PAIR — the planner needs it to prefer clean questions, and the evidence
   * layer needs the identical number to weight the answer. One source.
   */
  attribution: number;
  /**
   * A near-single-axis comparison. Internal vocabulary only: the player is
   * never shown the word, because on screen it is two films and a tap like
   * every other round.
   */
  twist: boolean;
}

/**
 * How much a clean question is preferred over a confounded one of equal gain.
 *
 * A Twist is worth more than its raw information gain suggests, because gain
 * measures how much UNCERTAINTY the answer removes while attribution measures
 * how much of the answer we can BELIEVE. A four-axis pair may look informative
 * and still produce four hedged writes; a single-axis pair produces one clean
 * one. Multiplying by attribution makes the planner prefer the second at equal
 * gain, without ever hard-coding "ask a Twist every N rounds" — which would be
 * a scripted sequence rather than a planner.
 *
 * Bounded well below 1 so it tilts rather than dominates: a Twist on an axis we
 * already know must never beat a broad question on one we do not.
 *
 * MEASURED, NOT CHOSEN. At 0.45 this broke the property the planner exists for:
 * two simulated people with opposite taste were dealt all twelve matchups
 * identically, because attribution is a property of the PAIR and a very clean
 * pair then won for everybody regardless of profile — the same "ranking barely
 * moves as beliefs change" failure `SECONDARY` was introduced to fix. The
 * divergence case in `intelligence.test.ts` caught it. At 0.15 the cleanliness
 * boost spans 0.85..1.0, which reorders pairs of near-equal gain without ever
 * outvoting uncertainty.
 */
export const ATTRIBUTION_PREFERENCE = 0.15;

/** How much a title asserts about an axis, signed. Inverted effects push down. */
export function pull(title: DiagnosticTitle, key: TraitKey): number {
  let sum = 0;
  for (const e of title.traits) {
    if (e.key !== key) continue;
    sum += e.invert ? -e.strength : e.strength;
  }
  return sum;
}

/** Every axis either title says anything about. */
function axesOf(a: DiagnosticTitle, b: DiagnosticTitle): TraitKey[] {
  const keys = new Set<TraitKey>();
  for (const e of a.traits) keys.add(e.key);
  for (const e of b.traits) keys.add(e.key);
  return [...keys];
}

/**
 * A pair is only diagnostic on an axis to the extent the two titles DISAGREE
 * about it. Both loving darkness separates nothing; one loving it and the other
 * refusing it separates a great deal. Silence counts as mild disagreement — a
 * film that says nothing about horror is weak evidence against it beside one
 * that shouts about it.
 */
export function separation(a: DiagnosticTitle, b: DiagnosticTitle, key: TraitKey): number {
  return Math.abs(pull(a, key) - pull(b, key));
}

/** Recognition gates everything: an unanswerable pair is a wasted turn. */
function answerable(a: DiagnosticTitle, b: DiagnosticTitle): number {
  // The WEAKER title governs. A household name beside an obscurity is still an
  // obscurity to half the people who see it.
  return Math.min(a.recognition, b.recognition);
}

/**
 * How much the secondary axes count once the leading one is chosen.
 *
 * THE VALUE THAT MAKES THE GAME ADAPTIVE, and the first version got it wrong
 * by leaving it at 1 — a plain sum over every contested axis. Summing rewards
 * titles for having LONG trait vectors, which is a property of the title and
 * not of the player, so the ranking barely moved as beliefs changed: two
 * simulated people with opposite taste were served all twelve matchups
 * identically, and the test that now guards this caught it.
 *
 * Leading with the single most open axis fixes it. The moment one player
 * settles `darkness` and another settles `comedy`, their most-open axis
 * differs, so the argmax differs, and the questions diverge. Breadth still
 * counts — a pair that opens three questions at once beats one that opens a
 * single question — it just no longer drowns out who is playing.
 */
const SECONDARY = 0.35;

/**
 * Information gain, and the axes responsible for it.
 *
 * Per axis: how hard the two titles disagree, times how little we know. Led by
 * the most valuable axis, with the rest discounted (see `SECONDARY`), and
 * gated by whether the pair is answerable at all.
 */
export function informationGain(
  a: DiagnosticTitle,
  b: DiagnosticTitle,
  profile: TraitProfile,
): { gain: number; testing: TraitKey[] } {
  const scored: Array<{ key: TraitKey; value: number }> = [];
  for (const key of axesOf(a, b)) {
    const value = separation(a, b, key) * traitUncertainty(profile, key);
    if (value > 0) scored.push({ key, value });
  }
  if (scored.length === 0) return { gain: 0, testing: [] };
  scored.sort((x, y) => y.value - x.value);

  const lead = scored[0]!.value;
  const rest = scored.slice(1).reduce((s, x) => s + x.value, 0);
  return {
    gain: (lead + SECONDARY * rest) * answerable(a, b),
    testing: scored.slice(0, 3).map((x) => x.key),
  };
}

export interface MatchupContext {
  profile: TraitProfile;
  /** Pair keys already put to this person — never ask the same two again. */
  seenPairs: readonly string[];
  /** Titles this person told us they have not seen. Asking again is rude and useless. */
  unseenTitles: readonly string[];
  /**
   * Axes recently asked about, newest last. A tie-break only: it stops three
   * consecutive matchups all hinging on `darkness` when several pairs score
   * within noise of each other.
   */
  recentAxes: readonly TraitKey[];
  /** Optional pool override. Defaults to the shared diagnostic set. */
  pool?: readonly DiagnosticTitle[];
}

/** Order-independent identity for a pair, so A-vs-B and B-vs-A are the same question. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Recently-asked axes are damped so the game does not fixate on one dimension. */
function stale(testing: readonly TraitKey[], recent: readonly TraitKey[]): number {
  if (testing.length === 0) return 1;
  const idx = [...recent].reverse().indexOf(testing[0]!);
  if (idx === -1) return 1;
  return [0.45, 0.7, 0.85][idx] ?? 0.95;
}

/**
 * The next matchup, or null when nothing left is worth asking.
 *
 * Returning null is a real outcome and the caller must handle it: once every
 * remaining pair scores near zero there is nothing left to learn from this
 * pool, and continuing would be a questionnaire rather than a game.
 */
export function nextMatchup(ctx: MatchupContext, floor = 0.05): Matchup | null {
  const pool = (ctx.pool ?? TITLES).filter((t) => !ctx.unseenTitles.includes(t.id));
  const seen = new Set(ctx.seenPairs);

  let best: Matchup | null = null;
  let bestScore = 0;

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!;
      const b = pool[j]!;
      // A title can never face itself — guarded here rather than trusted,
      // because a pool assembled from two sources can repeat an id.
      if (a.id === b.id) continue;
      if (seen.has(pairKey(a.id, b.id))) continue;

      const { gain, testing } = informationGain(a, b, ctx.profile);
      if (gain <= 0) continue;
      /* TWIST SELECTION IS NOT A SEPARATE CODE PATH. A Twist is simply a pair
         whose separations concentrate on one axis, so it is scored by the same
         argmax as everything else — just with a preference for cleanliness
         folded in. There is no Twist queue, no "every third round", and no
         second generator to keep in sync. */
      const seps = axesOf(a, b)
        .map((k) => Math.min(1, separation(a, b, k)))
        .filter((s) => s > 0);
      const attribution = attributionConfidence(seps);
      const clean = 1 - ATTRIBUTION_PREFERENCE + ATTRIBUTION_PREFERENCE * attribution;
      const score = gain * stale(testing, ctx.recentAxes) * clean;
      if (score > bestScore) {
        bestScore = score;
        best = { left: a, right: b, testing, gain, attribution, twist: isTwist(seps) };
      }
    }
  }

  return best && best.gain >= floor ? best : null;
}
