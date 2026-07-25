// EVIDENCE SUMMARY — what the verdict screen is allowed to claim.
//
// The score panel used to list all nine rating sources identically, so a title
// with one real rating rendered as one number followed by eight "Not available"
// rows. That is worse than unhelpful: missing data visually outweighed the
// evidence that existed, and every source looked equally involved in the score
// when in fact only five are ever blended.
//
// This module is PURE and lives outside `src/lib/scoring/` — it reads the
// engine's output and decides how to *describe* it. It never computes, alters
// or re-derives a score. The deterministic engine stays authoritative.
//
// Three honesty rules drive everything here:
//   1. A source is "counted" only if the engine actually blended it — that is,
//      it carries an effective weight. Availability alone is not enough.
//   2. A number the engine held at its neutral prior because data was missing
//      is reported as a neutral baseline, never as a measurement.
//   3. Strength labels come from thresholds shared with the engine, so the
//      label and the score can't drift apart.
import type { Confidence, RatingSource, ScoreBreakdown } from '@/lib/types';

/** The engine's own reliability thresholds (`scoring/general.ts`). Sharing the
 *  numbers is deliberate: an evidence label must never claim more confidence
 *  than the score it describes. */
export const MEANINGFUL_VOTES = 200;
export const HIGH_VOTES = 1000;

/** Sources with >= this many counted sources are Strong regardless of volume. */
export const STRONG_SOURCE_COUNT = 3;

export type EvidenceStrength = 'strong' | 'moderate' | 'limited';

export interface EvidenceSource {
  name: string;
  /** Human display, e.g. "8.3/10 (443 votes)". Null when unavailable. */
  raw: string | null;
  available: boolean;
  /** True only when the engine blended it into the score. */
  counted: boolean;
  /** Effective share of the blend, 0..1. Null when not counted. */
  weight: number | null;
  /** Plain-language statement of whether this source moved the number. */
  note: string;
}

export interface FactorBasis {
  key: 'quality' | 'audience' | 'watchability' | 'engagement';
  label: string;
  value: number;
  /** What the number is actually computed from. */
  basis: string;
  /** True when the engine had no data and held a neutral prior. */
  neutralBaseline: boolean;
}

export interface EvidenceSummary {
  strength: EvidenceStrength;
  /** "Strong" | "Moderate" | "Limited" — for the confidence line. */
  strengthLabel: string;
  /** Sources the engine blended, best-weighted first. */
  counted: EvidenceSource[];
  /** Available, but shown for context only — never blended. */
  contextOnly: EvidenceSource[];
  /** Not available from any provider we read. */
  unavailable: EvidenceSource[];
  /** Set when the score should be shown with an explicit caveat. */
  qualifier: string | null;
  /** One sentence for the compact card. */
  headline: string;
  /** Present only when at least one source is missing. */
  unavailableNote: string | null;
  factors: FactorBasis[];
}

const isCounted = (s: RatingSource): boolean =>
  s.available && typeof s.weight === 'number' && s.weight > 0;

function describe(s: RatingSource): EvidenceSource {
  const counted = isCounted(s);
  const note = counted
    ? `Counted — ${Math.round((s.weight as number) * 100)}% of the blended quality score`
    : s.available
      ? 'Shown for context — not counted toward the score'
      : 'No data returned by this provider — not counted, and not treated as a low score';
  return {
    name: s.name,
    raw: s.raw,
    available: s.available,
    counted,
    weight: counted ? (s.weight as number) : null,
    note,
  };
}

/**
 * Deterministic evidence strength.
 *
 * Editorial aggregates (IMDb, Rotten Tomatoes, Metacritic) publish no per-title
 * sample size, so they cannot contribute vote volume — the engine treats them
 * as trusted-when-present, and so does this. Volume therefore comes only from
 * the audience source that actually reports a count.
 */
export function evidenceStrength(countedCount: number, voteCount: number): EvidenceStrength {
  if (countedCount === 0) return 'limited';
  if (countedCount >= STRONG_SOURCE_COUNT) return 'strong';
  if (countedCount >= 2) return voteCount >= MEANINGFUL_VOTES ? 'strong' : 'moderate';
  // A single source. Meaningful volume — or an editorial aggregate, which
  // reports no volume at all — earns Moderate; a thin audience count does not.
  return voteCount === 0 || voteCount >= MEANINGFUL_VOTES ? 'moderate' : 'limited';
}

const STRENGTH_LABEL: Record<EvidenceStrength, string> = {
  strong: 'Strong',
  moderate: 'Moderate',
  limited: 'Limited',
};

function list(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export interface EvidenceInput {
  sources: RatingSource[];
  breakdown: ScoreBreakdown;
  /** TMDB vote count — the only volume figure any provider gives us. */
  voteCount: number;
  /** Whether TMDB returned an audience rating at all. */
  hasAudienceRating: boolean;
  /** Whether TMDB returned a popularity figure. */
  hasPopularity: boolean;
  /** Whether provider availability was known for the region. */
  hasProviders: boolean;
  mediaType: 'movie' | 'tv';
}

export function buildEvidence(input: EvidenceInput): EvidenceSummary {
  const described = input.sources.map(describe);
  const counted = described
    .filter((s) => s.counted)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const contextOnly = described.filter((s) => !s.counted && s.available);
  const unavailable = described.filter((s) => !s.available);

  const volume = input.hasAudienceRating ? input.voteCount : 0;
  const strength = evidenceStrength(counted.length, volume);

  const headline =
    counted.length === 0
      ? 'No external rating source was available for this title.'
      : `Based on ${list(counted.map((s) => s.name))}.`;

  const unavailableNote =
    unavailable.length === 0
      ? null
      : counted.length === 0
        ? 'Every major rating source was unavailable. Nothing was substituted for them.'
        : `${unavailable.length} other rating source${unavailable.length === 1 ? ' was' : 's were'} unavailable and ${unavailable.length === 1 ? 'was' : 'were'} not counted.`;

  const qualifier =
    counted.length === 0
      ? 'Early prediction'
      : strength === 'limited'
        ? 'Limited-source prediction'
        : null;

  return {
    strength,
    strengthLabel: STRENGTH_LABEL[strength],
    counted,
    contextOnly,
    unavailable,
    qualifier,
    headline,
    unavailableNote,
    factors: factorBases(input, counted),
  };
}

/**
 * What each score factor is really computed from.
 *
 * These strings describe `scoring/general.ts` as written. Where the engine
 * falls back to its neutral prior because a signal was missing, that is stated
 * as a baseline rather than dressed up as a derived measurement.
 */
function factorBases(input: EvidenceInput, counted: EvidenceSource[]): FactorBasis[] {
  const { breakdown, mediaType } = input;

  const qualityBasis =
    counted.length > 0
      ? `Blended from ${list(counted.map((s) => s.name))}, each weighted by how much evidence backs it.`
      : 'No rating source was available, so this sits at the neutral baseline. It is not a measured quality score.';

  const audienceBasis = input.hasAudienceRating
    ? `TMDB audience rating and its vote volume (${input.voteCount.toLocaleString()} vote${input.voteCount === 1 ? '' : 's'}).`
    : 'No audience rating was available, so this sits at the neutral baseline. Nothing was inferred in its place.';

  const watchabilityBasis = [
    mediaType === 'movie' ? 'runtime' : 'episode length and whether the series was cancelled',
    'format',
    input.hasProviders ? 'and whether it is streamable in your region' : 'with regional availability unknown',
  ].join(', ');

  const engagementBasis = input.hasPopularity
    ? 'TMDB popularity, log-compressed so a viral spike cannot dominate.'
    : 'No popularity figure was available, so this sits at the neutral baseline.';

  return [
    {
      key: 'quality',
      label: 'General quality',
      value: breakdown.quality,
      basis: qualityBasis,
      neutralBaseline: counted.length === 0,
    },
    {
      key: 'audience',
      label: 'Audience reception',
      value: breakdown.audience,
      basis: audienceBasis,
      neutralBaseline: !input.hasAudienceRating,
    },
    {
      key: 'watchability',
      label: 'Watchability',
      value: breakdown.watchability,
      basis: `Derived from ${watchabilityBasis}.`,
      neutralBaseline: false,
    },
    {
      key: 'engagement',
      label: 'Engagement',
      value: breakdown.engagement,
      basis: engagementBasis,
      neutralBaseline: !input.hasPopularity,
    },
  ];
}

/** Confidence word the engine already computed, phrased for display. */
export function confidenceWord(c: Confidence): string {
  return c === 'high' ? 'High' : c === 'medium' ? 'Moderate' : 'Low';
}
