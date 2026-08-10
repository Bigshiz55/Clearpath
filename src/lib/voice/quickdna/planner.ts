/**
 * QUICK DNA — what to ask next.
 *
 * The governing rule is MAXIMUM TASTE INFORMATION PER SECOND, and the way to
 * lose that is to spend seconds confirming things already known. So nothing
 * here is a fixed list: at every turn the planner scores what is still
 * available by how much uncertainty it would remove, and asks the winner.
 *
 * The score is deliberately plain arithmetic:
 *
 *     value(item) = Σ over the traits it touches of
 *                     strength × uncertainty(trait)
 *
 * A probe about a trait we already know scores near zero and is never asked.
 * A probe touching three unknown traits beats one touching a single unknown.
 * An either/or is scored on the traits its two answers SEPARATE, which is why
 * "Serial killer, or ghost story?" wins whenever grounded-vs-supernatural is
 * genuinely open — it resolves two traits in the same second.
 *
 * Titles are scored the same way, with two extra terms that matter in practice:
 *   • RECOGNITION, because a title nobody has seen returns PASS and PASS is
 *     nearly worthless. A round where half the answers are PASS is a broken
 *     selector, not an unlucky user.
 *   • CONTRAST against what has already been asked, so the round does not spend
 *     five titles re-measuring the same axis.
 *
 * DETERMINISTIC. Same profile in, same question out — no model call, no
 * randomness, and therefore predictable latency and testable behaviour.
 */

import {
  PROBES,
  TITLES,
  type DiagnosticTitle,
  type Probe,
  type TraitEffect,
} from './definition';
import { traitConfidence, traitUncertainty, type TraitProfile } from './traits';

/** Above this we consider a trait known and stop spending seconds on it. */
export const KNOWN_CONFIDENCE = 0.6;

/**
 * EITHER/OR QUESTIONS ARE NOT AN OPENER.
 *
 * They score well on raw information — two traits separated in one second — so
 * an unguarded planner opens with "Serial killer, or ghost story?". That is the
 * wrong first thing to hear: the intro has just told the person to answer with
 * numbers, yes, no or pass, and the very first question then asks for none of
 * those. Contradicting your own instructions in the opening second is how an
 * interface teaches someone it cannot be trusted.
 *
 * So they are held back until the rhythm is established, and capped — the brief
 * asks for them "selectively", and a run made mostly of forced choices stops
 * measuring intensity at all.
 */
const AB_AVAILABLE_AFTER = 4;
const MAX_AB_PROBES = 3;

/** Value of a set of effects against what is still unknown. */
function effectValue(effects: readonly TraitEffect[], profile: TraitProfile): number {
  return effects.reduce((sum, eff) => sum + eff.strength * traitUncertainty(profile, eff.key), 0);
}

/**
 * An either/or is worth what it SEPARATES: the traits where the two answers
 * disagree. Scoring it on the union would over-rate a question whose answers
 * both point the same way.
 */
function abValue(probe: Probe, profile: TraitProfile): number {
  const a = probe.optionA?.effects ?? [];
  const b = probe.optionB?.effects ?? [];
  const keys = new Set([...a, ...b].map((x) => x.key));
  let value = 0;
  for (const key of keys) {
    const inA = a.find((x) => x.key === key);
    const inB = b.find((x) => x.key === key);
    // Separation: present on one side only, or pointing opposite ways.
    const separates =
      (inA ? 1 : 0) !== (inB ? 1 : 0) || (inA?.invert ?? false) !== (inB?.invert ?? false);
    if (!separates) continue;
    const strength = Math.max(inA?.strength ?? 0, inB?.strength ?? 0);
    value += strength * traitUncertainty(profile, key);
  }
  // An either/or is answered faster than a number and carries no scale
  // ambiguity, so a small bonus reflects real seconds saved.
  return value * 1.15;
}

export function probeValue(probe: Probe, profile: TraitProfile): number {
  return probe.kind === 'ab' ? abValue(probe, profile) : effectValue(probe.effects, profile);
}

/**
 * The next probe, or null when nothing left is worth a second.
 *
 * `asked` are probe ids already used. A probe is also dropped when everything
 * it would teach is already confident, which is what "don't waste questions"
 * means concretely.
 */
export function nextProbe(
  profile: TraitProfile,
  asked: readonly string[],
  minValue = 0.25,
): Probe | null {
  const used = new Set(asked);
  const abAsked = asked.filter((id) => PROBES.find((p) => p.id === id)?.kind === 'ab').length;
  const abAllowed = asked.length >= AB_AVAILABLE_AFTER && abAsked < MAX_AB_PROBES;
  let best: Probe | null = null;
  let bestValue = minValue;
  for (const probe of PROBES) {
    if (used.has(probe.id)) continue;
    if (probe.kind === 'ab' && !abAllowed) continue;
    if (probe.supersededBy?.some((id) => used.has(id))) continue;
    const value = probeValue(probe, profile);
    if (value > bestValue) {
      best = probe;
      bestValue = value;
    }
  }
  return best;
}

/**
 * How much a title would teach. `recognition` is a multiplier rather than an
 * addend: an obscure title that would answer three open questions is still a
 * bad bet, because the likely answer is "haven't seen it".
 */
export function titleValue(title: DiagnosticTitle, profile: TraitProfile): number {
  return effectValue(title.traits, profile) * (0.35 + 0.65 * title.recognition);
}

/**
 * The next title. `seen` are ids already asked.
 *
 * `boostTraits` lets the run chase a hypothesis: after a Conjuring NO and a
 * Silence YES, the caller can ask for more weight on `grounded` and
 * `supernatural` so the next pick tests that specific split rather than
 * wandering off to comedy.
 */
export function nextTitle(
  profile: TraitProfile,
  seen: readonly string[],
  boostTraits: readonly string[] = [],
): DiagnosticTitle | null {
  const used = new Set(seen);
  const boost = new Set(boostTraits);
  let best: DiagnosticTitle | null = null;
  let bestValue = 0;
  for (const title of TITLES) {
    if (used.has(title.id)) continue;
    let value = titleValue(title, profile);
    if (boost.size > 0 && title.traits.some((x) => boost.has(x.key))) value *= 1.6;
    if (value > bestValue) {
      best = title;
      bestValue = value;
    }
  }
  return best;
}

/**
 * The hypothesis to chase next, read straight off the profile.
 *
 * This is the "Conjuring NO, Silence YES" case the product brief calls out. The
 * naive reading is "horror preference inconsistent"; the useful reading is that
 * grounded and supernatural have come apart, and the next title should test
 * exactly that. Returned as trait keys for `nextTitle` to boost.
 */
export function openSplits(profile: TraitProfile): string[] {
  const splits: string[] = [];
  const push = (...keys: string[]) => {
    for (const k of keys) if (!splits.includes(k)) splits.push(k);
  };

  const grounded = profile.grounded;
  const supernatural = profile.supernatural;
  const horror = profile.horrorTolerance;

  // Fear is welcome but the supernatural is not — the single most valuable
  // distinction this calibration can draw, and genre tags cannot see it.
  if (horror && supernatural && traitConfidence(profile, 'horrorTolerance') > 0.2) {
    if (horror.pref >= 55 && supernatural.pref <= 45) push('grounded', 'psychological');
    if (horror.pref <= 45 && supernatural.pref >= 55) push('supernatural', 'fantasy');
  }
  // Likes the idea of made-up worlds but not the fantastical ones, or vice versa.
  if (grounded && traitConfidence(profile, 'grounded') > 0.2 && Math.abs(grounded.pref - 50) >= 15) {
    push(grounded.pref >= 50 ? 'grounded' : 'fantasy');
  }
  // Investigation without patience, or patience without investigation: both
  // change which crime titles are worth recommending.
  if (profile.investigation && profile.patience) {
    const gap = Math.abs(profile.investigation.pref - profile.patience.pref);
    if (gap >= 25) push('patience', 'investigation');
  }
  return splits;
}
