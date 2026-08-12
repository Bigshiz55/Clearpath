/**
 * WHAT THE SCAN LEARNED, IN ENGLISH.
 *
 * THE DEFECT THIS EXISTS TO FIX. Ranking a profile by CONFIDENCE and showing
 * the top few describes almost everybody the same way. A horror-loving
 * simulated player came out of a scan reading "dark, grounded, crime" — all
 * three true, none of them the point — because `darkness` is carried by 25 of
 * 113 catalogue titles and accumulates from crime, war and prestige picks
 * alike, while `horrorTolerance` is carried by 10. The engine had in fact
 * learned horror perfectly (pref 100); the readout buried it under three
 * better-evidenced platitudes. Verified: that player scored 10/10 axes in the
 * right direction.
 *
 * So the summary ranks by DISTINCTIVENESS, not confidence. "Likes dark stories"
 * is nearly free — most people who finish a scan lean that way, and a fact that
 * describes everyone describes no one. "Will sit through subtitles" or "wants
 * the uncanny, not just the grim" is worth saying precisely because most people
 * do not. Confidence still gates what may be SAID; distinctiveness decides what
 * is worth saying first.
 *
 * NOTHING IS CLAIMED BELOW THRESHOLD. An axis the scan did not resolve is
 * absent, not softened — ninety seconds cannot know everything about a person
 * and pretending otherwise is the failure mode the whole rebuild is against.
 *
 * PURE. No I/O, no clock, no randomness.
 */

import { TITLES } from '@/lib/voice/quickdna/definition';
import {
  TRAIT_KEYS,
  traitBelief,
  traitConfidence,
  type TraitKey,
  type TraitProfile,
} from '@/lib/voice/quickdna/traits';

/** Below this confidence nothing may be asserted to the player at all. */
export const SAY_CONFIDENCE = 0.3;
/** Below this lean the belief is not decisive enough to phrase. */
export const SAY_LEAN = 15;

/**
 * How common each axis is in the catalogue, 0..1.
 *
 * A cheap proxy for "how much does leaning this way distinguish you". An axis
 * half the catalogue asserts will be leaned on by nearly every player simply
 * because they kept meeting it; an axis ten titles carry is a real signal when
 * it lands. Computed from the catalogue rather than hard-coded, so adding
 * titles reshapes it automatically.
 */
export function axisCommonness(): Map<TraitKey, number> {
  const counts = new Map<TraitKey, number>();
  for (const t of TITLES) {
    for (const e of t.traits) {
      if (e.strength < 0.5) continue;
      counts.set(e.key, (counts.get(e.key) ?? 0) + 1);
    }
  }
  const max = Math.max(1, ...counts.values());
  const out = new Map<TraitKey, number>();
  for (const k of TRAIT_KEYS) out.set(k, (counts.get(k) ?? 0) / max);
  return out;
}

export interface DnaFact {
  key: TraitKey;
  pref: number;
  confidence: number;
  /** 0..1 — how much this fact distinguishes them from everyone else. */
  distinctiveness: number;
  high: boolean;
}

/** Everything the scan may honestly say, most distinctive first. */
export function dnaFacts(profile: TraitProfile): DnaFact[] {
  const common = axisCommonness();
  return TRAIT_KEYS.map((key) => {
    const b = traitBelief(profile, key);
    const c = traitConfidence(profile, key);
    const lean = Math.abs(b.pref - 50);
    /* RARITY x LEAN x CONFIDENCE-SQUARED.
       Confidence is squared because the first version of this weighted it
       linearly and promptly traded one failure for its mirror. Ranking by
       confidence buried a horror fan's horror under three well-evidenced
       platitudes; ranking by rarity alone led that same player's summary with
       "the comic-book worlds work for you" — pref 100 on confidence 0.39, from
       a single Dark Knight pick. Rare axes are rare precisely because fewer
       titles carry them, so they accumulate less evidence and are noisier: the
       thing that makes a claim interesting is the same thing that makes it
       unreliable. Squaring confidence prices that in, so a rare claim has to be
       genuinely well-established before it leads. */
    const rarity = 1 - (common.get(key) ?? 0);
    const distinctiveness = rarity * (lean / 50) * c * c;
    return { key, pref: b.pref, confidence: c, distinctiveness, high: b.pref > 50 };
  })
    .filter((f) => f.confidence >= SAY_CONFIDENCE && Math.abs(f.pref - 50) >= SAY_LEAN)
    .sort((a, b) => b.distinctiveness - a.distinctiveness);
}

/** Axes the scan genuinely did not resolve. Reported, never invented. */
export function unknownAxes(profile: TraitProfile): TraitKey[] {
  return TRAIT_KEYS.filter((k) => traitConfidence(profile, k) < SAY_CONFIDENCE);
}

/**
 * PHRASES. Each is a claim about ONE axis in the reader's language.
 *
 * Deliberately written as sentence fragments the composer can join, rather than
 * whole sentences: a list of finished sentences reads like a form letter, and
 * the interesting statements are the ones that combine two axes ("dark, but
 * not slow") — which is only possible if the parts compose.
 */
const HIGH: Partial<Record<TraitKey, string>> = {
  darkness: 'you go where stories get dark',
  horrorTolerance: 'you actually want to be scared',
  supernatural: 'you like it when the rules of the world bend',
  psychological: 'you want the tension inside people’s heads',
  suspense: 'you want dread more than shocks',
  violence: 'you don’t flinch',
  weirdness: 'you like films that refuse to behave',
  ambiguity: 'you’re fine leaving without an answer',
  crime: 'criminal worlds pull you in',
  trueCrime: 'you prefer real cases to invented ones',
  investigation: 'you want a puzzle to work',
  documentary: 'you want it to have actually happened',
  animation: 'animation is a real option for you, not a kids’ shelf',
  international: 'you don’t need it to be in English',
  subtitles: 'subtitles don’t slow you down',
  romance: 'you want the love story to matter',
  warmth: 'you want warmth in it',
  comedy: 'you want to laugh',
  family: 'you want something the room can watch together',
  comfort: 'you watch to feel better, not braced',
  spectacle: 'you want scale you can see',
  action: 'you want momentum',
  patience: 'you’ll wait for a slow build',
  complexity: 'you’ll work for it',
  characterFocus: 'people interest you more than plot',
  dialogue: 'you want it talky',
  emotion: 'you want to feel it',
  grounded: 'you want it to feel real',
  fantasy: 'you want somewhere else entirely',
  scifi: 'you want ideas with the spectacle',
  cynicism: 'you like a hard-eyed view of people',
  sentimentality: 'you don’t mind having your heart pulled',
  episodic: 'you’ll commit to a long series',
  mainstream: 'you like what everyone likes, and that’s fine',
  vintage: 'older films are not a barrier',
  musical: 'music carrying a story works on you',
  sport: 'competition hooks you',
  western: 'westerns land for you',
  war: 'you’ll go to the hard history',
  period: 'the past is where you want to be',
  superhero: 'the comic-book worlds work for you',
  reality: 'unscripted holds your attention',
  martialArts: 'you want the choreography',
  legal: 'the process itself interests you',
};

const LOW: Partial<Record<TraitKey, string>> = {
  darkness: 'bleakness isn’t what you’re after',
  horrorTolerance: 'being frightened isn’t the appeal',
  supernatural: 'you want the world to obey its own rules',
  patience: 'you want it to move',
  violence: 'you don’t need it graphic',
  comedy: 'you’re not here for jokes',
  romance: 'romance isn’t the draw',
  sentimentality: 'you’d rather it didn’t tug',
  animation: 'animation isn’t your shelf',
  subtitles: 'you’d rather not read a film',
  international: 'you stay closer to home',
  mainstream: 'the obvious pick is rarely your pick',
  comfort: 'you’re not looking for a blanket',
  spectacle: 'scale for its own sake leaves you cold',
  complexity: 'you don’t want homework',
  episodic: 'you’d rather it end tonight',
  reality: 'unscripted isn’t for you',
  documentary: 'you want it invented',
  fantasy: 'you want both feet on the ground',
  musical: 'the songs are not the draw',
  sport: 'competition isn’t the hook',
  family: 'you don’t need it safe for everyone',
  warmth: 'you don’t need it warm',
  cynicism: 'you’d rather it believed in people',
  dialogue: 'you don’t need it talky',
  vintage: 'you lean recent',
  weirdness: 'you want it to make sense',
  ambiguity: 'you want an ending that lands',
};

function phrase(f: DnaFact): string | null {
  return (f.high ? HIGH[f.key] : LOW[f.key]) ?? null;
}

/**
 * THE SUMMARY — three to five statements, most distinctive first.
 *
 * Pairs facts that TENSION each other where possible ("you go where stories get
 * dark, but you want it to move"), because the interesting thing about a person
 * is rarely one axis — it is the combination that a genre label cannot express.
 * Falls back to single claims when nothing pairs.
 */
export function dnaSummary(profile: TraitProfile, max = 5): string[] {
  const facts = dnaFacts(profile);
  const used = new Set<TraitKey>();
  const out: string[] = [];

  for (const f of facts) {
    if (out.length >= max) break;
    if (used.has(f.key)) continue;
    const lead = phrase(f);
    if (!lead) continue;

    // Look for a counterweight: a fact pointing the other way in tone, so the
    // sentence says something a genre label could not.
    const partner = facts.find(
      (g) => !used.has(g.key) && g.key !== f.key && g.high !== f.high && phrase(g) && g.distinctiveness > 0.02,
    );
    if (partner) {
      used.add(f.key);
      used.add(partner.key);
      out.push(`${capitalise(lead)}, but ${phrase(partner)}.`);
    } else {
      used.add(f.key);
      out.push(`${capitalise(lead)}.`);
    }
  }
  return out;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * CLUSTERS for the visual readout. Six groups, because thirty-plus sliders is
 * a data dump rather than a portrait, and because these are the axes a person
 * can actually recognise themselves in.
 */
export const DNA_CLUSTERS: Array<{ id: string; label: string; keys: TraitKey[] }> = [
  { id: 'energy', label: 'Energy', keys: ['action', 'spectacle', 'patience', 'suspense'] },
  { id: 'tone', label: 'Tone', keys: ['darkness', 'warmth', 'comedy', 'emotion', 'sentimentality'] },
  { id: 'story', label: 'Story', keys: ['complexity', 'characterFocus', 'dialogue', 'ambiguity', 'investigation'] },
  { id: 'world', label: 'World', keys: ['grounded', 'fantasy', 'scifi', 'supernatural', 'period'] },
  { id: 'edge', label: 'Edge', keys: ['horrorTolerance', 'violence', 'weirdness', 'cynicism', 'crime'] },
  { id: 'openness', label: 'Openness', keys: ['international', 'subtitles', 'animation', 'documentary', 'mainstream', 'episodic'] },
];

export interface ClusterReadout {
  id: string;
  label: string;
  /** Facts strong enough to show, most distinctive first. */
  facts: DnaFact[];
  /** 0..1 — how much of this cluster the scan actually resolved. */
  resolved: number;
}

export function clusterReadout(profile: TraitProfile): ClusterReadout[] {
  const all = dnaFacts(profile);
  return DNA_CLUSTERS.map((c) => {
    const facts = all.filter((f) => c.keys.includes(f.key));
    const resolved =
      c.keys.filter((k) => traitConfidence(profile, k) >= SAY_CONFIDENCE).length / c.keys.length;
    return { id: c.id, label: c.label, facts, resolved };
  });
}
