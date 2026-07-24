/**
 * Seed-similarity qualification + ranking — the general fix for the class of bug
 * the Rocky incident exposed. PURE (no I/O), title-agnostic: every decision is
 * computed from Title-DNA (the real 15-axis fingerprint + genres + keyword
 * anchors) and reliable franchise identity, never a hard-coded title list.
 *
 * Pipeline order (matches the brief, Phase 12):
 *   1. exclude the seed's canonical identity + canonical duplicates
 *   2. optional franchise handling (exclude, or cap in the top slice) — KNOWN
 *      franchise identity only; an inferred (title-text) hint never filters
 *   3. per-candidate SEED-SIMILARITY QUALIFICATION GATE (anchors + contradictions)
 *      applied BEFORE personalization; a failed gate is dropped outright
 *   4. rank the survivors by personal fit (personalization cannot rescue a
 *      candidate that failed the gate; nor can popularity or requested count)
 *   5. return fewer results when too few qualify; keep a full trace for each.
 */
import {
  DNA_AXES, DEFINING_AXES, canonicalKey, salience, pole, knownAxisCount,
  franchiseAssessment, type SeedTitle, type FranchiseRelation, type IdentitySource,
} from './titleDna';
import { ACTIVE_THRESHOLDS, type SeedSimilarityThresholds } from './thresholds';

/** Genres too broad to count as a *defining* shared anchor on their own. */
const GENERIC_GENRES = new Set(['drama', 'comedy']);

/** Lens → the keyword family that lens requires a candidate to share. Absent
 *  lenses (era/style/actor/…) fall back to the default all-signal comparison. */
const LENS_KEYWORDS: Record<string, string[]> = {
  underdog: ['underdog', 'perseverance', 'earned_payoff', 'inspirational'],
  boxing: ['boxing'],
  sports: ['boxing', 'mma', 'football', 'sport', 'athlete', 'training'],
};

const g = (s: string) => s.toLowerCase();

export interface SimilarityAssessment {
  sharedGenres: string[];
  sharedKeywords: string[];
  sharedDims: string[];
  sharedAnchorCount: number;
  sharedAnchorScore: number;
  contradictionScore: number;
  realismGap: number;
  definingSharedAnchor: boolean;
  metadataConfidence: number;
  positive: Record<string, number>;
  negative: Record<string, number>;
}

/** Compute the seed↔candidate similarity assessment from Title-DNA only. */
export function assess(seed: SeedTitle, cand: SeedTitle): SimilarityAssessment {
  const seedGenres = new Set(seed.genres.map(g));
  const candGenres = new Set(cand.genres.map(g));
  const sharedGenres = [...seedGenres].filter((x) => candGenres.has(x));
  const nonGenericSharedGenres = sharedGenres.filter((x) => !GENERIC_GENRES.has(x));

  const seedKw = new Set(seed.keywords.map(g));
  const sharedKeywords = [...new Set(cand.keywords.map(g))].filter((x) => seedKw.has(x));

  const positive: Record<string, number> = {};
  const negative: Record<string, number> = {};
  const sharedDims: string[] = [];
  let anchorDim = 0;
  let contradiction = 0;
  let comparableDefining = 0;
  let realismGap = 0;

  for (const axis of DNA_AXES) {
    const s = seed.dims[axis];
    const c = cand.dims[axis];
    if (typeof s !== 'number' || typeof c !== 'number') continue;
    const gap = Math.abs(s - c);
    const defining = DEFINING_AXES.has(axis);
    if (defining) comparableDefining++;
    if (axis === 'realism') realismGap = pole(s) !== 0 && pole(c) !== 0 && pole(s) !== pole(c) ? gap : 0;

    if (pole(s) !== 0 && pole(s) === pole(c) && salience(s) >= 0.3) {
      const contrib = salience(s) * (1 - gap / 100) * (defining ? 1 : 0.6);
      anchorDim += contrib;
      sharedDims.push(axis);
      positive[axis] = round(contrib);
    } else if (pole(s) !== 0 && pole(c) !== 0 && pole(s) !== pole(c) && gap >= 30) {
      const contrib = (defining ? 1 : 0.5) * salience(s) * (gap / 100);
      contradiction += contrib;
      negative[axis] = round(-contrib);
    } else if (pole(s) !== 0 && pole(c) === 0 && defining && salience(s) >= 0.5 && gap >= 35) {
      const contrib = 0.4 * (gap / 100);
      contradiction += contrib;
      negative[axis] = round(-contrib);
    }
  }

  const genreScore = nonGenericSharedGenres.length ? Math.min(1, 0.6 + 0.2 * (nonGenericSharedGenres.length - 1)) : 0;
  const keywordScore = Math.min(1, sharedKeywords.length / 3);
  const dimScore = Math.min(1, anchorDim / 1.2);
  const sharedAnchorScore = clamp01(0.4 * genreScore + 0.4 * keywordScore + 0.2 * dimScore);
  if (genreScore) positive['genre'] = round(0.4 * genreScore);
  if (keywordScore) positive['keywords'] = round(0.4 * keywordScore);

  const contradictionScore = clamp01(contradiction / Math.max(2, comparableDefining));

  const dimsCoverage = knownAxisCount(cand.dims) / DNA_AXES.length;
  const metadataConfidence = clamp01(0.5 * dimsCoverage + (cand.keywords.length ? 0.3 : 0) + (cand.genres.length ? 0.2 : 0));

  const definingSharedAnchor = nonGenericSharedGenres.length > 0 || sharedKeywords.length > 0
    || sharedDims.some((d) => DEFINING_AXES.has(d as never));

  return {
    sharedGenres, sharedKeywords, sharedDims,
    sharedAnchorCount: nonGenericSharedGenres.length + sharedKeywords.length + sharedDims.length,
    sharedAnchorScore, contradictionScore, realismGap, definingSharedAnchor, metadataConfidence,
    positive, negative,
  };
}

export interface GateDecision {
  passed: boolean;
  reason: string | null;
  assessment: SimilarityAssessment;
}

/** Gate B — does this candidate qualify as *similar to the seed*? Personalization
 *  is NOT an input here by design. */
export function qualify(
  seed: SeedTitle,
  cand: SeedTitle,
  opts: { lens?: string; thresholds?: SeedSimilarityThresholds } = {},
): GateDecision {
  const th = opts.thresholds ?? ACTIVE_THRESHOLDS;
  const a = assess(seed, cand);
  const lensKw = opts.lens ? LENS_KEYWORDS[opts.lens] : undefined;

  let reason: string | null = null;
  if (a.metadataConfidence < th.minConfidence) reason = 'insufficient_metadata_confidence';
  else if (lensKw && !cand.keywords.map(g).some((k) => lensKw.includes(k))) reason = `lens_${opts.lens}_not_matched`;
  else if (a.realismGap >= th.hardRealismGap) reason = 'hard_contradiction_grounded_vs_fantastical';
  else if (a.contradictionScore > th.maxContradiction) reason = 'contradiction_outweighs_similarity';
  else if (!a.definingSharedAnchor) reason = 'no_defining_shared_anchor';
  else if (a.sharedAnchorScore < th.minAnchor) reason = 'insufficient_seed_similarity';

  return { passed: reason === null, reason, assessment: a };
}

// ── The ranker (matches the Search Lab Ranker signature) ──
export interface RankOpts {
  requestedCount: number;
  lens?: string;
  allowFranchise?: boolean;
  excludeFranchise?: boolean;
  allowSeed?: boolean;
  thresholds?: SeedSimilarityThresholds;
}
export interface RankTrace {
  candidateTitle: string;
  canonicalId: string;
  candidateSource: string;
  franchiseRelation: FranchiseRelation;
  identitySource: IdentitySource;
  qualification: {
    hardConstraintsPassed: boolean;
    seedSimilarityGatePassed: boolean;
    sharedAnchorCount: number;
    sharedAnchorScore: number;
    contradictionScore: number;
    metadataConfidence: number;
  };
  positiveContributions: Record<string, number>;
  negativeContributions: Record<string, number>;
  personalFit: number;
  qualifiedForRanking: boolean;
  exclusionReason: string | null;
}
export interface RankOutput {
  items: { canonicalId: string; title: string; personalFit: number; rank: number }[];
  traces: RankTrace[];
  excludedSeedOrDup: string[];
  /** Count of candidates that passed the similarity gate (before the count cap). */
  qualifiedCount: number;
  /** exclusionReason → how many candidates it eliminated (for the no-match message). */
  gateBreakdown: Record<string, number>;
}

export function rankSeedSimilar(
  seed: SeedTitle,
  candidates: (SeedTitle & { personalScore: number })[],
  opts: RankOpts,
): RankOutput {
  const th = opts.thresholds ?? ACTIVE_THRESHOLDS;
  const traces: RankTrace[] = [];
  const excludedSeedOrDup: string[] = [];
  const gateBreakdown: Record<string, number> = {};
  const bump = (k: string) => { gateBreakdown[k] = (gateBreakdown[k] ?? 0) + 1; };

  const qualified: { cand: SeedTitle & { personalScore: number }; knownFranchise: boolean }[] = [];
  const seenCanonical = new Set<string>();
  const seedKeyStr = canonicalKey(seed);

  for (const c of candidates) {
    const fr = franchiseAssessment(seed, c);
    const ck = canonicalKey(c);

    // 1) canonical seed / duplicate exclusion (identity, not a bare tmdb id)
    if ((fr.relation === 'same_canonical' || ck === seedKeyStr) && !opts.allowSeed) {
      excludedSeedOrDup.push(c.title); bump('excluded_seed_canonical');
      traces.push(exclTrace(c, fr, 'excluded_seed_canonical'));
      continue;
    }
    if (fr.relation === 'canonical_duplicate' || seenCanonical.has(ck)) {
      excludedSeedOrDup.push(c.title); bump('excluded_canonical_duplicate');
      traces.push(exclTrace(c, fr, 'excluded_canonical_duplicate'));
      continue;
    }
    // 2) franchise: hard-exclude on request — KNOWN identity only (inferred can't filter)
    const knownFranchise = fr.relation === 'franchise' && fr.identity === 'known';
    if (knownFranchise && opts.excludeFranchise) {
      excludedSeedOrDup.push(c.title); bump('excluded_franchise');
      traces.push(exclTrace(c, fr, 'excluded_franchise'));
      continue;
    }
    seenCanonical.add(ck);

    // 3) seed-similarity gate (before personalization)
    const decision = qualify(seed, c, { lens: opts.lens, thresholds: th });
    traces.push(gateTrace(c, fr, decision));
    if (decision.passed) qualified.push({ cand: c, knownFranchise });
    else bump(decision.reason ?? 'unqualified');
  }

  // 4) personalization only among the qualified
  qualified.sort((x, y) => y.cand.personalScore - x.cand.personalScore);

  // 5) assemble, applying the franchise cap (KNOWN franchise only) on the slice
  const cap = opts.allowFranchise ? Infinity : opts.excludeFranchise ? 0 : th.defaultFranchiseCap;
  const items: RankOutput['items'] = [];
  let franchiseUsed = 0;
  for (const q of qualified) {
    if (items.length >= opts.requestedCount) break;
    // Only a KNOWN franchise identity is capped; an inferred/unknown relation is
    // recorded in the trace but never filters (per the franchise-identity policy).
    if (q.knownFranchise) {
      if (franchiseUsed >= cap) continue; // fewer results rather than saturate
      franchiseUsed++;
    }
    items.push({ canonicalId: q.cand.canonicalId, title: q.cand.title, personalFit: q.cand.personalScore, rank: items.length + 1 });
  }

  return { items, traces, excludedSeedOrDup, qualifiedCount: qualified.length, gateBreakdown };
}

// ── trace helpers ──
function gateTrace(c: SeedTitle & { personalScore: number }, fr: { relation: FranchiseRelation; identity: IdentitySource }, d: GateDecision): RankTrace {
  return {
    candidateTitle: c.title, canonicalId: c.canonicalId, candidateSource: 'tmdb_recommendations+dna',
    franchiseRelation: fr.relation, identitySource: fr.identity,
    qualification: {
      hardConstraintsPassed: true,
      seedSimilarityGatePassed: d.passed,
      sharedAnchorCount: d.assessment.sharedAnchorCount,
      sharedAnchorScore: round(d.assessment.sharedAnchorScore),
      contradictionScore: round(d.assessment.contradictionScore),
      metadataConfidence: round(d.assessment.metadataConfidence),
    },
    positiveContributions: d.assessment.positive,
    negativeContributions: d.assessment.negative,
    personalFit: c.personalScore, qualifiedForRanking: d.passed, exclusionReason: d.reason,
  };
}
function exclTrace(c: SeedTitle & { personalScore: number }, fr: { relation: FranchiseRelation; identity: IdentitySource }, reason: string): RankTrace {
  return {
    candidateTitle: c.title, canonicalId: c.canonicalId, candidateSource: 'tmdb_recommendations+dna',
    franchiseRelation: fr.relation, identitySource: fr.identity,
    qualification: { hardConstraintsPassed: false, seedSimilarityGatePassed: false, sharedAnchorCount: 0, sharedAnchorScore: 0, contradictionScore: 0, metadataConfidence: 0 },
    positiveContributions: {}, negativeContributions: {}, personalFit: c.personalScore, qualifiedForRanking: false, exclusionReason: reason,
  };
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
function round(x: number): number { return Math.round(x * 100) / 100; }
