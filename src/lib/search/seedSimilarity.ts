/**
 * Seed-similarity qualification + ranking — the general fix for the class of bug
 * the Rocky incident exposed. PURE (no I/O), title-agnostic: every decision is
 * computed from Title-DNA (the real 15-axis fingerprint + genres + keyword
 * anchors), never from a hard-coded title list.
 *
 * Pipeline order (matches the brief, Phase 12):
 *   1. exclude the seed's canonical identity + canonical duplicates
 *   2. optional franchise handling (exclude, or cap in the top slice)
 *   3. per-candidate SEED-SIMILARITY QUALIFICATION GATE (anchors + contradictions)
 *      — applied BEFORE personalization; a failed gate is dropped outright
 *   4. rank the survivors by personal fit (personalization cannot rescue a
 *      candidate that failed the gate; nor can popularity or requested count)
 *   5. return fewer results when too few qualify; keep a full trace for each.
 */
import {
  DNA_AXES, DEFINING_AXES, canonicalKey, salience, pole, knownAxisCount, type SeedTitle,
} from './titleDna';

// ── Tunable thresholds (calibrated on the dev set; holdout is not used here) ──
export const GATE = {
  MIN_ANCHOR: 0.28, // minimum weighted shared-anchor score to qualify
  MAX_CONTRADICTION: 0.42, // above this a candidate fails regardless of anchors
  HARD_REALISM_GAP: 50, // grounded↔fantastical split this wide is a hard fail
  MIN_CONFIDENCE: 0.4, // below this the fingerprint is too sparse to trust
  DEFAULT_FRANCHISE_CAP: 1, // same-collection results allowed in the top slice
} as const;

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
      // shared salient anchor on the same pole
      const contrib = salience(s) * (1 - gap / 100) * (defining ? 1 : 0.6);
      anchorDim += contrib;
      sharedDims.push(axis);
      positive[axis] = round(contrib);
    } else if (pole(s) !== 0 && pole(c) !== 0 && pole(s) !== pole(c) && gap >= 30) {
      // opposite poles → contradiction, weighted up on defining axes
      const contrib = (defining ? 1 : 0.5) * salience(s) * (gap / 100);
      contradiction += contrib;
      negative[axis] = round(-contrib);
    } else if (pole(s) !== 0 && pole(c) === 0 && defining && salience(s) >= 0.5 && gap >= 35) {
      const contrib = 0.4 * (gap / 100);
      contradiction += contrib;
      negative[axis] = round(-contrib);
    }
  }

  // Normalize (cap at 1). Anchor blends genre + keyword + dim evidence.
  const genreScore = nonGenericSharedGenres.length ? Math.min(1, 0.6 + 0.2 * (nonGenericSharedGenres.length - 1)) : 0;
  const keywordScore = Math.min(1, sharedKeywords.length / 3);
  const dimScore = Math.min(1, anchorDim / 1.2);
  const sharedAnchorScore = clamp01(0.4 * genreScore + 0.4 * keywordScore + 0.2 * dimScore);
  if (genreScore) positive['genre'] = round(0.4 * genreScore);
  if (keywordScore) positive['keywords'] = round(0.4 * keywordScore);

  const contradictionScore = clamp01(contradiction / Math.max(2, comparableDefining));

  // Confidence reflects ALL available signal, so a title whose fingerprint isn't
  // cached yet still qualifies on genres + keywords (graceful degradation) rather
  // than emptying results. The dim-based contradiction checks simply don't fire
  // when dims are absent — the defining-anchor requirement still filters weak
  // overlaps (e.g. sharing only a generic "Drama" genre).
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
export function qualify(seed: SeedTitle, cand: SeedTitle, opts: { lens?: string } = {}): GateDecision {
  const a = assess(seed, cand);
  const lensKw = opts.lens ? LENS_KEYWORDS[opts.lens] : undefined;

  let reason: string | null = null;
  if (a.metadataConfidence < GATE.MIN_CONFIDENCE) reason = 'insufficient_metadata_confidence';
  else if (lensKw && !cand.keywords.map(g).some((k) => lensKw.includes(k))) reason = `lens_${opts.lens}_not_matched`;
  else if (a.realismGap >= GATE.HARD_REALISM_GAP) reason = 'hard_contradiction_grounded_vs_fantastical';
  else if (a.contradictionScore > GATE.MAX_CONTRADICTION) reason = 'contradiction_outweighs_similarity';
  else if (!a.definingSharedAnchor) reason = 'no_defining_shared_anchor';
  else if (a.sharedAnchorScore < GATE.MIN_ANCHOR) reason = 'insufficient_seed_similarity';

  return { passed: reason === null, reason, assessment: a };
}

// ── The ranker (matches the Search Lab Ranker signature) ──
export interface RankOpts {
  requestedCount: number;
  lens?: string;
  allowFranchise?: boolean;
  excludeFranchise?: boolean;
  allowSeed?: boolean;
}
export interface RankTrace {
  candidateTitle: string;
  canonicalId: string;
  candidateSource: string;
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
}

export function rankSeedSimilar(
  seed: SeedTitle,
  candidates: (SeedTitle & { personalScore: number })[],
  opts: RankOpts,
): RankOutput {
  const traces: RankTrace[] = [];
  const excludedSeedOrDup: string[] = [];
  const seedKeyStr = canonicalKey(seed);
  const seedCollection = seed.collectionId ?? null;

  const qualified: { cand: SeedTitle & { personalScore: number }; a: SimilarityAssessment }[] = [];
  const seenCanonical = new Set<string>();

  for (const c of candidates) {
    const ck = canonicalKey(c);
    // 1) canonical seed exclusion (identity, not a bare tmdb id)
    if (ck === seedKeyStr && !opts.allowSeed) {
      excludedSeedOrDup.push(c.title);
      traces.push(exclTrace(c, 'excluded_seed_canonical'));
      continue;
    }
    // 1b) canonical duplicate exclusion (same work, different record)
    if (seenCanonical.has(ck)) {
      excludedSeedOrDup.push(c.title);
      traces.push(exclTrace(c, 'excluded_canonical_duplicate'));
      continue;
    }
    // 2) franchise: hard-exclude on request; otherwise it stays but is capped later
    const isFranchise = seedCollection != null && c.collectionId === seedCollection && ck !== seedKeyStr;
    if (isFranchise && opts.excludeFranchise) {
      excludedSeedOrDup.push(c.title);
      traces.push(exclTrace(c, 'excluded_franchise'));
      continue;
    }
    seenCanonical.add(ck);

    // 3) seed-similarity gate (before personalization)
    const decision = qualify(seed, c, { lens: opts.lens });
    traces.push(gateTrace(c, decision));
    if (decision.passed) qualified.push({ cand: c, a: decision.assessment });
  }

  // 4) personalization only among the qualified
  qualified.sort((x, y) => y.cand.personalScore - x.cand.personalScore);

  // 5) assemble, applying the franchise cap on the returned slice
  const cap = opts.allowFranchise ? Infinity : opts.excludeFranchise ? 0 : GATE.DEFAULT_FRANCHISE_CAP;
  const items: RankOutput['items'] = [];
  let franchiseUsed = 0;
  for (const q of qualified) {
    if (items.length >= opts.requestedCount) break;
    const isFranchise = seedCollection != null && q.cand.collectionId === seedCollection;
    if (isFranchise && franchiseUsed >= cap) continue; // fewer results rather than saturate
    if (isFranchise) franchiseUsed++;
    items.push({ canonicalId: q.cand.canonicalId, title: q.cand.title, personalFit: q.cand.personalScore, rank: items.length + 1 });
  }

  return { items, traces, excludedSeedOrDup };
}

// ── trace helpers ──
function gateTrace(c: SeedTitle & { personalScore: number }, d: GateDecision): RankTrace {
  return {
    candidateTitle: c.title,
    canonicalId: c.canonicalId,
    candidateSource: 'tmdb_recommendations+dna',
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
    personalFit: c.personalScore,
    qualifiedForRanking: d.passed,
    exclusionReason: d.reason,
  };
}
function exclTrace(c: SeedTitle & { personalScore: number }, reason: string): RankTrace {
  return {
    candidateTitle: c.title, canonicalId: c.canonicalId, candidateSource: 'tmdb_recommendations+dna',
    qualification: { hardConstraintsPassed: false, seedSimilarityGatePassed: false, sharedAnchorCount: 0, sharedAnchorScore: 0, contradictionScore: 0, metadataConfidence: 0 },
    positiveContributions: {}, negativeContributions: {}, personalFit: c.personalScore, qualifiedForRanking: false, exclusionReason: reason,
  };
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
function round(x: number): number { return Math.round(x * 100) / 100; }
