/**
 * THE REACTION REEL — one title at a time, and why that beats a pair.
 *
 * A pairwise battle forces a comparison the player never asked for, and the
 * winner is decided as much by which poster is famous as by taste. A single
 * stimulus with a HOOK asks a cleaner question: knowing what this is, do you
 * want it? The hook is what makes an unfamiliar film answerable — nobody can
 * judge a poster for a film they have never heard of, but anyone can react to
 * "a grounded mystery that moves quickly".
 *
 * FIVE ANSWERS, BECAUSE FIVE THINGS ARE ACTUALLY DIFFERENT. Collapsing these
 * is how taste models quietly rot:
 *
 *   PULL    — want it now. Strong positive about the traits.
 *   KEEP    — interested, not tonight. Positive about traits, neutral on mood.
 *   CUT     — actively not this. Negative about the traits.
 *   SEEN    — already watched it. Says nothing about wanting it tonight, and
 *             is the ONLY answer that establishes familiarity.
 *   UNSEEN  — never heard of it. Says nothing about taste AT ALL.
 *
 * The last one is the one every competitor gets wrong. "Haven't seen it" is
 * not a dislike; treating it as one manufactures negative preferences out of
 * ignorance, and it is the fastest way to make a new user's profile worse than
 * empty. It carries no evidence here, by construction.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import { TITLES, type DiagnosticTitle } from '@/lib/voice/quickdna/definition';
import { traitBelief, traitConfidence, traitUncertainty, type TraitKey, type TraitProfile } from '@/lib/voice/quickdna/traits';
import { tonightPreference, type SessionContext } from './context';

export type Reaction = 'pull' | 'keep' | 'cut' | 'seen' | 'unseen';

/** Weight per reaction. A shrug is worth less than an appetite. */
export const REACTION_WEIGHT: Record<Reaction, number> = {
  pull: 0.32,
  keep: 0.16,
  cut: 0.3,
  seen: 0, // familiarity, not taste
  unseen: 0, // ignorance, not taste
};

export interface Stimulus {
  title: DiagnosticTitle;
  /** One accurate line about what this IS. Never marketing copy. */
  hook: string;
  /** Axes this stimulus is being shown to resolve, strongest first. */
  testing: TraitKey[];
  gain: number;
}

/**
 * Hooks, written from the trait vector rather than from a blurb.
 *
 * Each fragment is true of the axis it comes from, so an assembled hook is
 * accurate by construction — there is no path here for a hook to describe a
 * film as something it is not.
 */
const FRAGMENT: Partial<Record<TraitKey, { pos: string; neg?: string }>> = {
  investigation: { pos: 'a mystery to solve' },
  crime: { pos: 'criminal worlds' },
  trueCrime: { pos: 'a real case' },
  legal: { pos: 'courtroom pressure' },
  psychological: { pos: 'psychological tension' },
  supernatural: { pos: 'something not of this world', neg: 'no supernatural get-out' },
  horrorTolerance: { pos: 'genuinely frightening' },
  darkness: { pos: 'dark and morally messy', neg: 'light-hearted' },
  action: { pos: 'kinetic and loud' },
  comedy: { pos: 'funny on purpose' },
  romance: { pos: 'a love story' },
  scifi: { pos: 'science fiction' },
  fantasy: { pos: 'the impossible, played straight' },
  grounded: { pos: 'grounded and plausible', neg: 'far from realistic' },
  patience: { pos: 'a slow build', neg: 'moves quickly' },
  complexity: { pos: 'demanding', neg: 'easy to follow' },
  documentary: { pos: 'a true story' },
  international: { pos: 'not in English' },
  subtitles: { pos: 'subtitled' },
  vintage: { pos: 'an older film' },
};

/**
 * The two or three most defining things about a title, as one clause.
 *
 * Ordered by trait STRENGTH, so the hook leads with what the film most is.
 * Capped at three because a longer line stops being readable in the second or
 * two a player gives it.
 */
export function hookParts(title: DiagnosticTitle, max = 3): string[] {
  const parts: string[] = [];
  for (const e of [...title.traits].sort((a, b) => b.strength - a.strength)) {
    const frag = FRAGMENT[e.key];
    if (!frag) continue;
    const text = e.invert ? frag.neg : frag.pos;
    if (!text) continue;
    if (parts.includes(text)) continue;
    parts.push(text);
    if (parts.length === max) break;
  }
  return parts;
}

/**
 * The same fragments as one sentence.
 *
 * Built on `hookParts` rather than beside it, so the sentence a screen reader
 * hears and the chips a sighted player sees can never describe different films.
 */
export function hookFor(title: DiagnosticTitle): string {
  const parts = hookParts(title);
  if (parts.length === 0) return 'Worth an evening';
  const head = parts[0]!;
  return (head.charAt(0).toUpperCase() + head.slice(1)) + (parts.length > 1 ? `, ${parts.slice(1).join(', ')}` : '');
}

export interface ReelContext {
  profile: TraitProfile;
  context: SessionContext;
  /** Title ids already shown this session. Never repeat one. */
  shown: readonly string[];
  /** Titles the player has said they have not seen, across sessions. */
  unseen: readonly string[];
  /** Axes recently probed — damped so the reel does not fixate. */
  recentAxes: readonly TraitKey[];
  pool?: readonly DiagnosticTitle[];
}

/** Recently-probed axes are damped so the reel varies. */
function stale(testing: readonly TraitKey[], recent: readonly TraitKey[]): number {
  if (testing.length === 0) return 1;
  const idx = [...recent].reverse().indexOf(testing[0]!);
  if (idx === -1) return 1;
  return [0.4, 0.65, 0.85][idx] ?? 0.95;
}

/**
 * How much showing this title would teach, and about what.
 *
 * Uncertainty x strength, gated by recognition — a title nobody knows returns
 * "haven't seen it" and teaches nothing however diagnostic it looks on paper.
 * Tonight's intent tilts it: when someone asked to laugh, comedy-bearing
 * stimuli are worth more THIS SESSION without that preference becoming
 * permanent, which is the whole point of keeping the two separate.
 */
export function stimulusValue(
  title: DiagnosticTitle,
  profile: TraitProfile,
  context: SessionContext,
): { gain: number; testing: TraitKey[] } {
  const scored: Array<{ key: TraitKey; value: number }> = [];
  for (const e of title.traits) {
    const uncertainty = traitUncertainty(profile, e.key);
    // Tonight's lean raises the value of axes the session actually depends on.
    const relevance = 1 + Math.abs(context.lean[e.key] ?? 0) * 0.5;
    const value = e.strength * uncertainty * relevance;
    if (value > 0) scored.push({ key: e.key, value });
  }
  if (scored.length === 0) return { gain: 0, testing: [] };
  scored.sort((a, b) => b.value - a.value);
  const lead = scored[0]!.value;
  const rest = scored.slice(1).reduce((s, x) => s + x.value, 0);

  /*
   * UNCERTAINTY ABOUT THE OUTCOME, not just about the axes.
   *
   * Trait uncertainty alone picks the same "informative" titles for everyone,
   * because it is a property of the axes rather than of the person — two users
   * with opposite taste were shown seven of the same nine stimuli. What makes
   * a stimulus worth a turn is that we cannot PREDICT the answer: a film we
   * already know they will love teaches nothing when they love it.
   *
   * So the score is damped by how confidently the current profile already
   * predicts the reaction. Titles near the decision boundary score highest,
   * and because each person's boundary moves as they answer, their reels
   * diverge sharply instead of converging on the same famous set.
   */
  const predicted = title.traits.reduce((sum, e) => {
    const pref = traitBelief(profile, e.key).pref;
    const conf = traitConfidence(profile, e.key);
    const wanted = e.invert ? 100 - pref : pref;
    return sum + ((wanted - 50) / 50) * e.strength * conf;
  }, 0);
  const boundary = 1 - Math.min(0.85, Math.abs(predicted) / 1.6);

  return {
    gain: (lead + 0.35 * rest) * (0.35 + 0.65 * title.recognition) * boundary,
    testing: scored.slice(0, 3).map((x) => x.key),
  };
}

/** The next stimulus worth showing, or null when none would teach anything. */
export function nextStimulus(ctx: ReelContext, floor = 0.04): Stimulus | null {
  const pool = (ctx.pool ?? TITLES).filter(
    (t) => !ctx.shown.includes(t.id) && !ctx.unseen.includes(t.id),
  );
  let best: Stimulus | null = null;
  let bestScore = 0;

  for (const title of pool) {
    const { gain, testing } = stimulusValue(title, ctx.profile, ctx.context);
    if (gain <= 0) continue;
    const score = gain * stale(testing, ctx.recentAxes);
    if (score > bestScore) {
      bestScore = score;
      best = { title, hook: hookFor(title), testing, gain };
    }
  }
  return best && best.gain >= floor ? best : null;
}

/**
 * What a reaction means, per axis.
 *
 * `seen` and `unseen` return NOTHING, and that is the load-bearing line in this
 * file. Familiarity and ignorance are facts about the player's history, not
 * about their taste, and the moment either one is allowed to produce an
 * observation the profile starts inventing opinions nobody expressed.
 */
export function reactionEvidence(
  stimulus: Stimulus,
  reaction: Reaction,
): Array<{ key: TraitKey; target: number; weight: number }> {
  if (reaction === 'seen' || reaction === 'unseen') return [];

  const weight = REACTION_WEIGHT[reaction];
  const wants = reaction !== 'cut';

  return stimulus.title.traits.map((e) => {
    // An inverted effect means the title is defined by the ABSENCE of the axis.
    const asserts = e.invert ? false : true;
    const target = wants === asserts ? 100 : 0;
    return { key: e.key, target, weight: weight * e.strength };
  });
}

/**
 * Ranking preference for tonight: permanent belief bent by tonight's mood.
 *
 * Exported so the Final Cut and the reel share one definition — two
 * implementations of "what do they want right now" would drift apart.
 */
export function tonightFit(
  title: DiagnosticTitle,
  profile: TraitProfile,
  context: SessionContext,
  belief: (key: TraitKey) => number,
): number {
  let fit = 0;
  for (const e of title.traits) {
    const base = belief(e.key);
    const pref = tonightPreference(base, context, e.key);
    const wanted = e.invert ? 100 - pref : pref;
    fit += ((wanted - 50) / 50) * e.strength;
  }
  return fit;
}
