/**
 * FOUR QUESTIONS, FOUR NUMBERS.
 *
 * ── THE PRODUCTION FAILURE THIS EXISTS TO MAKE IMPOSSIBLE ─────────────────
 * Three unrelated 2026 films were shown at "100 match" for a Samuel L. Jackson
 * request. The number was not miscalculated — it was the WRONG NUMBER.
 * `finder.ts` used
 *
 *     const effectiveMatch = household ? household.score : report.personal.score;
 *
 * which is the deterministic QUALITY verdict: the Standard Score plus the
 * user's explicit preference rules. It answers "is this a good film". It has
 * never answered "is this what was asked for", so a well-rated film nobody
 * requested scored ~100 exactly as a perfect answer would.
 *
 * Conflating those is not a rounding problem, it is a category error, and no
 * amount of tuning one number fixes it. So they stay separate:
 *
 *   requestMatch  did this satisfy what the user explicitly asked for?
 *   quality       is this generally a strong title?      (unchanged logic)
 *   personal      how well does it fit THIS user?        (null until DNA)
 *   confidence    how much evidence stands behind all of the above?
 *
 * `match` is the single headline number the UI shows, derived from those and
 * never from quality alone.
 *
 * ── WHY 100 IS HARD TO REACH ──────────────────────────────────────────────
 * A perfect score is a claim about the person, and without personal evidence
 * there is no basis for one however good the film is. So the top of the scale
 * is reserved: every stated requirement satisfied, real personal evidence, and
 * enough metadata to have judged it. Everything else is honestly short of it.
 *
 * PURE. No I/O, no clock.
 */
import type { ConstraintEvidence } from './hardConstraints';

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/**
 * The ceiling for a title with no personal evidence behind it.
 *
 * Not 100, because "perfect for you" is unsayable when nothing is known about
 * "you"; not low, because a title that satisfies every stated requirement and
 * is genuinely excellent deserves to lead. It is the honest top of what can be
 * claimed from quality and request satisfaction alone.
 */
export const MAX_WITHOUT_PERSONAL_EVIDENCE = 92;

/** Below this, metadata is too thin to make a confident claim about anything. */
export const THIN_METADATA_AT = 0.5;

/** A title that fails a stated requirement can never read as a match. */
export const INELIGIBLE_CEILING = 40;

export type Confidence = 'high' | 'medium' | 'low';

export interface ScoreInput {
  /** The deterministic quality verdict — existing logic, unchanged. */
  quality: number;
  /** Which stated requirements this candidate met and missed. */
  evidence: ConstraintEvidence;
  /** Personal fit 0..100, or null when no taste evidence participated. */
  personal: number | null;
  /** 0..1 — how much of the metadata this judgement needed actually existed. */
  metadataCompleteness: number;
}

export interface RecommendationScore {
  /** The headline number. Never quality alone. */
  match: number;
  /** 0..100 when the user stated requirements; null when they stated none. */
  requestMatch: number | null;
  quality: number;
  personal: number | null;
  confidence: Confidence;
  evidence: ConstraintEvidence;
}

/**
 * How completely the stated request was satisfied.
 *
 * `null` — not 100 — when nothing was asked for. An unconstrained browse
 * satisfied no requirements; claiming a perfect request match for it would be
 * the same lie one level down.
 */
function requestMatchOf(evidence: ConstraintEvidence): number | null {
  const met = evidence.hardConstraintsSatisfied.length;
  const missed = evidence.hardConstraintsMissing.length;
  const total = met + missed;
  if (total === 0) return null;
  return Math.round((met / total) * 100);
}

function confidenceOf(input: ScoreInput, eligible: boolean): Confidence {
  if (!eligible) return 'low';
  if (input.metadataCompleteness < THIN_METADATA_AT) return 'low';
  // Personal evidence is what separates "a good film that fits your request"
  // from "a good film for YOU". Only the latter is high confidence.
  return input.personal != null ? 'high' : 'medium';
}

export function scoreRecommendation(input: ScoreInput): RecommendationScore {
  const quality = clamp(Math.round(input.quality));
  const requestMatch = requestMatchOf(input.evidence);
  const eligible = input.evidence.hardConstraintsMissing.length === 0;
  const confidence = confidenceOf(input, eligible);

  /* THE HEADLINE. Quality is the floor of the claim; personal fit moves it
     when it exists. A failed requirement collapses it regardless of either,
     because a film that is not what was asked for is not a match at any
     quality — that is the whole reported defect. */
  let match = input.personal != null ? Math.round(quality * 0.5 + input.personal * 0.5) : quality;

  if (!eligible) {
    match = Math.min(match, INELIGIBLE_CEILING);
  } else {
    if (input.personal == null) match = Math.min(match, MAX_WITHOUT_PERSONAL_EVIDENCE);
    if (input.metadataCompleteness < THIN_METADATA_AT) {
      match = Math.min(match, MAX_WITHOUT_PERSONAL_EVIDENCE - 10);
    }
  }

  return {
    match: clamp(Math.round(match)),
    requestMatch,
    quality,
    personal: input.personal == null ? null : clamp(Math.round(input.personal)),
    confidence,
    evidence: input.evidence,
  };
}
