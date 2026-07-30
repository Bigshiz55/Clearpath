/**
 * STAGE 3 (fast ranking) and STAGE 4 (deep ranking) — pure, no I/O.
 *
 * Two principles run through both:
 *
 *   NORMALISE BEFORE COMBINING. Cosine is −1..1, ts_rank is unbounded, vote
 *   counts are 0..10⁵. Adding those raw would let whichever signal happens to
 *   have the largest scale silently become the ranking. Every component is
 *   mapped to 0..1 first, and the mapping is stated.
 *
 *   MISSING IS NOT ZERO. A title with no gore rating has not been rated
 *   non-gory. Unknown components are dropped and the remaining weights are
 *   renormalised, so absent metadata neither helps nor hurts.
 */

import {
  FAST_WEIGHTS, PENALTIES, GROUP_WEIGHTS, SEVERE_MISMATCH, RANKING_VERSION,
  type FastWeights, type GroupWeights,
} from './config';
import { cosine } from './embedding';
import type { ParsedRequest } from './intent';
import type { SynthTitle } from './synthCatalog';

// ------------------------------------------------------------ normalise -----

/** Cosine (−1..1) → 0..1. */
export const normCosine = (c: number) => Math.max(0, Math.min(1, (c + 1) / 2));
/** Unbounded positive relevance → 0..1, saturating. */
export const normSaturating = (v: number, half: number) => (v <= 0 ? 0 : v / (v + half));
/** 0..10 rating → 0..1. */
export const normRating = (v: number | null | undefined) => (v == null ? null : Math.max(0, Math.min(1, v / 10)));

export interface FastComponents {
  semantic: number | null;
  fullText: number | null;
  watchDna: number | null;
  tonight: number | null;
  referenceTitle: number | null;
  availabilityConfidence: number | null;
  qualityConfidence: number | null;
  novelty: number | null;
}

export interface FastScored {
  id: string;
  score: number;
  components: FastComponents;
  penalties: { negativePreference: number; franchiseRepeat: number; watched: number };
  /** Components that were unknown and therefore excluded from the blend. */
  missing: string[];
  rankingVersion: string;
}

export interface FastInput {
  request: ParsedRequest;
  /** Query vector for the semantic channel; null disables that component. */
  queryVector: number[] | null;
  /** Per-title full-text relevance from retrieval, if any. */
  fullTextScores?: Map<string, number>;
  /** Per-title reference-title proximity from retrieval, if any. */
  referenceScores?: Map<string, number>;
  /** Combined Watch DNA vector for the room; null disables that component. */
  dnaVector?: number[] | null;
  /** Titles any member has already watched. */
  watchedIds?: Set<string>;
  /** Franchises already represented in the working set. */
  seenFranchises?: Set<string>;
  weights?: FastWeights;
}

/**
 * Blend the known components. Weights are renormalised over the components that
 * are actually present, so a title missing three signals is compared on the
 * same 0..1 scale as one with everything.
 */
function blend(components: FastComponents, weights: FastWeights): { score: number; missing: string[] } {
  let total = 0;
  let sum = 0;
  const missing: string[] = [];
  for (const key of Object.keys(weights) as (keyof FastWeights)[]) {
    const v = components[key];
    if (v == null) { missing.push(key); continue; }
    total += weights[key];
    sum += v * weights[key];
  }
  return { score: total > 0 ? sum / total : 0, missing };
}

/** How well a title's genres/moods match the request. Null when unknowable. */
export function tonightMatch(title: SynthTitle, request: ParsedRequest): number | null {
  const wants = request.soft_preferences.genres;
  const moods = request.soft_preferences.moods;
  if (wants.length === 0 && moods.length === 0) return null;

  let got = 0, want = 0;
  for (const g of wants) {
    want += g.weight;
    if (title.genres.includes(g.value)) got += g.weight;
  }
  // Mood axes map onto stored features; an absent feature is skipped, not zeroed.
  const MOOD_FEATURE: Partial<Record<string, { key: keyof SynthTitle['features']; invert?: boolean }>> = {
    gritty: { key: 'violence' }, atmospheric: { key: 'suspense' }, tense: { key: 'suspense' },
    funny: { key: 'humor' }, romantic: { key: 'romance' }, cerebral: { key: 'complexity' },
    comforting: { key: 'familySuitability' }, bleak: { key: 'endingTone', invert: true },
    uplifting: { key: 'endingTone' }, mainstream: { key: 'mainstream' },
    unusual: { key: 'mainstream', invert: true }, visually_impressive: { key: 'productionScale' },
  };
  for (const m of moods) {
    const map = MOOD_FEATURE[m.value];
    if (!map) continue;
    const raw = title.features[map.key];
    if (raw == null) continue;
    want += m.weight;
    got += (map.invert ? 1 - raw : raw) * m.weight;
  }
  return want > 0 ? Math.max(0, Math.min(1, got / want)) : null;
}

/** Negative preferences reduce the score in proportion to the measured trait. */
export function negativePenalty(title: SynthTitle, request: ParsedRequest): number {
  const TRAIT_FEATURE: Record<string, keyof SynthTitle['features']> = {
    graphic_gore: 'gore', graphic_violence: 'violence', horror: 'horror',
    sexual_content: 'romance', depressing: 'emotionalHeaviness', childish: 'familySuitability',
  };
  let penalty = 0;
  for (const n of request.negative_preferences) {
    const key = TRAIT_FEATURE[n.value];
    if (key) {
      const v = title.features[key];
      // Unknown intensity is NOT penalised — we do not punish missing data.
      if (v != null) penalty += v * n.weight;
    } else if (n.value === 'superhero') {
      // No stored trait: fall back to an explicit, visible keyword signal.
      if (title.keywords.some((k) => k.includes('superhero')) || title.franchise?.includes('hero')) {
        penalty += n.weight;
      }
    }
  }
  return penalty * PENALTIES.negativePreference;
}

/** STAGE 3 — cheap scoring over the whole eligible pool. */
export function fastRank(titles: SynthTitle[], input: FastInput, limit: number): FastScored[] {
  const weights = input.weights ?? FAST_WEIGHTS;
  const scored: FastScored[] = titles.map((t) => {
    const components: FastComponents = {
      semantic: input.queryVector ? normCosine(cosine(input.queryVector, t.vector.values)) : null,
      fullText: input.fullTextScores?.has(t.id) ? normSaturating(input.fullTextScores.get(t.id)!, 0.1) : null,
      watchDna: input.dnaVector ? normCosine(cosine(input.dnaVector, t.vector.values)) : null,
      tonight: tonightMatch(t, input.request),
      referenceTitle: input.referenceScores?.has(t.id) ? Math.max(0, Math.min(1, input.referenceScores.get(t.id)!)) : null,
      availabilityConfidence: t.availability.length
        ? Math.max(...t.availability.map((a) => (a.verifiedDaysAgo > 14 ? a.confidence * 0.4 : a.confidence)))
        : 0,
      qualityConfidence: normRating(t.audienceScore),
      novelty: t.features.mainstream == null ? null : 1 - t.features.mainstream,
    };
    const { score: base, missing } = blend(components, weights);

    const penalties = {
      negativePreference: negativePenalty(t, input.request),
      franchiseRepeat: t.franchise && input.seenFranchises?.has(t.franchise) ? PENALTIES.franchiseRepeat : 0,
      watched: input.watchedIds?.has(t.id) ? PENALTIES.watched : 0,
    };
    const score = Math.max(0, base - penalties.negativePreference - penalties.franchiseRepeat - penalties.watched);
    return { id: t.id, score, components, penalties, missing, rankingVersion: RANKING_VERSION };
  });

  // Deterministic ordering: score, then id. Never insertion order, which would
  // make identical inputs produce different courts.
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, limit);
}

// =========================================================== STAGE 4 =========

export interface MemberProfile {
  id: string;
  name: string;
  /** Taste vector; null for a brand-new member. */
  vector: number[] | null;
  /** 0..1 — how much to trust this member's vector. */
  confidence: number;
  watchedIds: Set<string>;
  /** Content traits this member hard-excludes. A GATE, never averaged. */
  exclusions: string[];
  /** Present only so the engine can prove it does NOT use it for weighting. */
  isHost: boolean;
}

export type GroupMethod = 'weighted_mean' | 'min_protected' | 'disagreement_penalty' | 'nash';

export interface DeepScored {
  id: string;
  memberScores: Record<string, number>;
  groupMean: number;
  lowestMemberScore: number;
  disagreement: number;
  compromiseScore: number;
  semanticScore: number;
  watchDnaScore: number;
  tonightScore: number;
  availabilityConfidence: number;
  metadataConfidence: number;
  finalPreDiversityScore: number;
  /** Members predicted to strongly dislike it. */
  severeMismatchFor: string[];
  /** True when a member's hard exclusion removes it outright. */
  gatedOut: boolean;
  gateReason: string | null;
  method: GroupMethod;
  rankingVersion: string;
}

const TRAIT_FEATURE_GATE: Record<string, keyof SynthTitle['features']> = {
  graphic_gore: 'gore', graphic_violence: 'violence', horror: 'horror',
};

/**
 * Per-member fit. A member with no vector falls back to the request fit, damped
 * by their confidence, so a new member neither dominates nor is ignored.
 */
export function memberFit(title: SynthTitle, m: MemberProfile, requestFit: number | null): number {
  const base = m.vector ? normCosine(cosine(m.vector, title.vector.values)) : null;
  const fallback = requestFit ?? 0.5;
  if (base == null) return fallback;
  // Blend toward the request as confidence drops — a low-confidence profile
  // should not out-shout what the room actually asked for.
  return base * m.confidence + fallback * (1 - m.confidence);
}

/** Combine member scores under the selected method. */
export function aggregate(
  scores: number[],
  method: GroupMethod,
  weights: GroupWeights = GROUP_WEIGHTS,
): number {
  if (scores.length === 0) return 0;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const spread = max - min;

  switch (method) {
    case 'weighted_mean':
      return mean;
    case 'min_protected':
      return weights.mean * mean + weights.floor * min;
    case 'disagreement_penalty':
      return Math.max(0, mean - weights.disagreementPenalty * spread);
    case 'nash':
      // Nash bargaining: the product of utilities. One member near zero
      // collapses the whole product, which is exactly the intent.
      return Math.pow(scores.reduce((a, b) => a * Math.max(1e-6, b), 1), 1 / scores.length);
  }
}

export interface DeepInput {
  members: MemberProfile[];
  request: ParsedRequest;
  fast: Map<string, FastScored>;
  method?: GroupMethod;
  weights?: GroupWeights;
}

/** STAGE 4 — richer, per-member ranking over the fast-ranked shortlist. */
export function deepRank(titles: SynthTitle[], input: DeepInput, limit: number): DeepScored[] {
  const method = input.method ?? 'min_protected';
  const weights = input.weights ?? GROUP_WEIGHTS;

  const out: DeepScored[] = titles.map((t) => {
    const fast = input.fast.get(t.id);
    const requestFit = fast?.components.tonight ?? null;

    // Hard personal exclusions are GATES. They are applied per member and are
    // never averaged away by the rest of the room liking the title.
    let gatedOut = false;
    let gateReason: string | null = null;
    for (const m of input.members) {
      for (const ex of m.exclusions) {
        const key = TRAIT_FEATURE_GATE[ex];
        const v = key ? t.features[key] : undefined;
        if (v != null && v >= 0.6) {
          gatedOut = true;
          gateReason = `${m.name} excludes ${ex}`;
          break;
        }
        if (ex === 'horror' && t.genres.includes('horror')) {
          gatedOut = true; gateReason = `${m.name} excludes horror`; break;
        }
      }
      if (gatedOut) break;
    }

    const memberScores: Record<string, number> = {};
    for (const m of input.members) {
      // A member who has seen it scores it lower for themselves, but this is a
      // preference signal, not a claim they disliked it.
      const seen = m.watchedIds.has(t.id) ? 0.6 : 1;
      memberScores[m.id] = Math.max(0, Math.min(1, memberFit(t, m, requestFit) * seen));
    }
    const values = Object.values(memberScores);
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const min = values.length ? Math.min(...values) : 0;
    const disagreement = values.length ? Math.max(...values) - min : 0;
    const compromise = aggregate(values, method, weights);

    const availabilityConfidence = t.availability.length
      ? Math.max(...t.availability.map((a) => (a.verifiedDaysAgo > 14 ? a.confidence * 0.4 : a.confidence)))
      : 0;

    const final = gatedOut ? 0 : compromise * 0.75 + availabilityConfidence * 0.15 + t.metadataConfidence * 0.10;

    return {
      id: t.id,
      memberScores,
      groupMean: round(mean),
      lowestMemberScore: round(min),
      disagreement: round(disagreement),
      compromiseScore: round(compromise),
      semanticScore: round(fast?.components.semantic ?? 0),
      watchDnaScore: round(fast?.components.watchDna ?? 0),
      tonightScore: round(requestFit ?? 0),
      availabilityConfidence: round(availabilityConfidence),
      metadataConfidence: round(t.metadataConfidence),
      finalPreDiversityScore: round(final),
      severeMismatchFor: input.members.filter((m) => (memberScores[m.id] ?? 1) < SEVERE_MISMATCH).map((m) => m.id),
      gatedOut,
      gateReason,
      method,
      rankingVersion: RANKING_VERSION,
    };
  });

  const surviving = out.filter((d) => !d.gatedOut);
  surviving.sort((a, b) => b.finalPreDiversityScore - a.finalPreDiversityScore || a.id.localeCompare(b.id));
  return surviving.slice(0, limit);
}

const round = (n: number) => Math.round(n * 1000) / 1000;
