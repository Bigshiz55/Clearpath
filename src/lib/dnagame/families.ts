/**
 * VERD1CT RUSH — the six wheel families.
 *
 * These are a PRESENTATION LAYER, not a taxonomy. The real model is the twenty
 * latent traits in `quickdna/traits.ts`, which is what actually predicts whether
 * someone will enjoy a title; a family is just a readable name for a region of
 * that space, so a person can see the game reacting to them.
 *
 * Keeping the two apart is the whole point. Six genre buckets could never
 * express "fear is fine but ghosts are not" — the trait engine can, and the
 * wheel simply renders a projection of it. Change these labels freely; nothing
 * downstream scores on them.
 *
 * AFFINITY AND CONFIDENCE ARE DIFFERENT NUMBERS, and the wheel must never blur
 * them. "We are certain you dislike comedy" and "we know nothing about comedy"
 * are opposite states that a single fill level would render identically, so
 * every family reports both and the UI is required to use two visual channels.
 *
 * PURE. No I/O.
 */

import {
  traitBelief,
  traitConfidence,
  type TraitKey,
  type TraitProfile,
} from '@/lib/voice/quickdna/traits';

export interface Family {
  id: string;
  label: string;
  /** Traits this family projects, and how much each one speaks for it. */
  traits: Array<{ key: TraitKey; weight: number }>;
  /** Wheel accent — WatchVerd1ct's own palette, not a borrowed one. */
  accent: string;
}

export const FAMILIES: readonly Family[] = [
  {
    id: 'mystery',
    label: 'Mystery',
    accent: '#38bdf8',
    traits: [
      { key: 'investigation', weight: 1 },
      { key: 'crime', weight: 0.7 },
      { key: 'legal', weight: 0.4 },
      { key: 'trueCrime', weight: 0.3 },
    ],
  },
  {
    id: 'thrill',
    label: 'Thrill',
    accent: '#f59e0b',
    traits: [
      { key: 'action', weight: 1 },
      { key: 'superhero', weight: 0.6 },
      { key: 'martialArts', weight: 0.5 },
      { key: 'psychological', weight: 0.4 },
      { key: 'war', weight: 0.4 },
      { key: 'complexity', weight: 0.2 },
    ],
  },
  {
    id: 'dark',
    label: 'Dark',
    accent: '#a855f7',
    traits: [
      { key: 'darkness', weight: 1 },
      { key: 'horrorTolerance', weight: 0.7 },
      { key: 'psychological', weight: 0.6 },
      { key: 'supernatural', weight: 0.4 },
    ],
  },
  {
    id: 'laugh',
    label: 'Laugh',
    accent: '#22c55e',
    traits: [
      { key: 'comedy', weight: 1 },
      { key: 'animation', weight: 0.6 },
      { key: 'family', weight: 0.5 },
      { key: 'reality', weight: 0.3 },
    ],
  },
  {
    id: 'heart',
    label: 'Heart',
    accent: '#ec4899',
    traits: [
      { key: 'romance', weight: 1 },
      { key: 'musical', weight: 0.5 },
      { key: 'sport', weight: 0.4 },
      { key: 'grounded', weight: 0.3 },
    ],
  },
  {
    id: 'worlds',
    label: 'Worlds',
    accent: '#14b8a6',
    traits: [
      { key: 'scifi', weight: 1 },
      { key: 'fantasy', weight: 0.9 },
      { key: 'western', weight: 0.5 },
      { key: 'period', weight: 0.5 },
      { key: 'international', weight: 0.4 },
      { key: 'vintage', weight: 0.3 },
    ],
  },
] as const;

export const FAMILY_IDS = FAMILIES.map((f) => f.id);

export interface FamilyReading {
  id: string;
  label: string;
  accent: string;
  /** 0..100 — how much they like this region. */
  affinity: number;
  /** 0..1 — how sure we are. Drives wheel fill; NEVER the same as affinity. */
  confidence: number;
}

/** Weighted projection of the trait profile onto one family. */
export function readFamily(profile: TraitProfile, family: Family): FamilyReading {
  let affinitySum = 0;
  let confidenceSum = 0;
  let weightSum = 0;
  for (const { key, weight } of family.traits) {
    affinitySum += traitBelief(profile, key).pref * weight;
    confidenceSum += traitConfidence(profile, key) * weight;
    weightSum += weight;
  }
  return {
    id: family.id,
    label: family.label,
    accent: family.accent,
    affinity: weightSum === 0 ? 50 : affinitySum / weightSum,
    confidence: weightSum === 0 ? 0 : confidenceSum / weightSum,
  };
}

export function readAllFamilies(profile: TraitProfile): FamilyReading[] {
  return FAMILIES.map((f) => readFamily(profile, f));
}

/**
 * HOW MUCH OF THIS PERSON DO WE KNOW, 0..1.
 *
 * Derived from confidence coverage, never from "question 20 of 30". A decision
 * that resolves something genuinely open has to move this more than one that
 * confirms what we already believed — which falls out automatically, because a
 * trait already near certainty contributes almost nothing more.
 */
export function dnaKnown(profile: TraitProfile): number {
  const readings = readAllFamilies(profile);
  return readings.reduce((sum, r) => sum + r.confidence, 0) / readings.length;
}
