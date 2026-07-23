import type {
  BookMetadata,
  Confidence,
  RatingSource,
  ReadVerdictScore,
  ScoreBreakdown,
} from '@/lib/types';
import { computeAcclaim, type SourceReading } from './acclaim';

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);

/** Neutral prior used when a component has no signal. */
const NEUTRAL = 55;

function reliability(ratingsCount: number, hasRating: boolean): Confidence {
  if (!hasRating) return 'low';
  if (ratingsCount >= 300) return 'high';
  if (ratingsCount >= 50) return 'medium';
  return 'low';
}

/** Assemble the rating-source readings the Acclaim blend consumes. */
export function acclaimReadings(meta: BookMetadata): SourceReading[] {
  const readings: SourceReading[] = [];
  if (meta.ratingsAverage != null && meta.ratingsCount > 0) {
    // Open Library rates 1..5; map to 0..100.
    readings.push({
      key: 'openLibrary',
      value: clamp(meta.ratingsAverage * 20),
      sampleSize: meta.ratingsCount,
    });
  }
  return readings;
}

/** Log-scaled reach from total reading-log activity. */
function popularityScore(readingLogCount: number): number {
  if (readingLogCount <= 0) return NEUTRAL;
  // Reading logs range from a handful to ~1M for megahits. Log-compress.
  const v = 34 + 12 * Math.log10(readingLogCount + 1);
  return clamp(v);
}

/**
 * Approachability. Shorter books ask less of a reader; very long ones are a
 * real commitment. Language is noted, never penalized — a great book in another
 * language is still great, so it only nudges when we know English readers face
 * a translation barrier and nothing else offsets it.
 */
function readabilityScore(meta: BookMetadata): number {
  let s = 72;
  const pages = meta.pageCount ?? 0;
  if (pages > 0) {
    if (pages <= 200) s += 8;
    else if (pages <= 350) s += 3;
    else if (pages <= 500) s -= 2;
    else if (pages <= 700) s -= 8;
    else s -= 15;
  }
  // Widely available across editions is easier to actually obtain and read.
  if (meta.editionCount >= 20) s += 4;
  return clamp(s);
}

/**
 * Staying power. Endurance is a strong quality signal for books: many editions,
 * and still around decades after first publication, both point to a title that
 * kept earning readers.
 */
function stayingPowerScore(meta: BookMetadata, refYear: number): number {
  let s = 58;
  const ed = meta.editionCount;
  if (ed >= 60) s += 20;
  else if (ed >= 25) s += 14;
  else if (ed >= 10) s += 8;
  else if (ed >= 4) s += 3;

  if (meta.firstPublishYear != null) {
    const age = refYear - meta.firstPublishYear;
    // A book still printed in many editions long after release is a classic.
    if (age >= 50 && ed >= 8) s += 10;
    else if (age >= 25 && ed >= 5) s += 5;
  }
  return clamp(s);
}

export interface GeneralScoreOptions {
  /** Reference year for age-based signals. Injected for determinism. */
  refYear?: number;
}

const DEFAULT_REF_YEAR = 2026;

export function computeGeneralScore(
  meta: BookMetadata,
  options: GeneralScoreOptions = {},
): ReadVerdictScore {
  const refYear = options.refYear ?? DEFAULT_REF_YEAR;
  const hasRating = meta.ratingsAverage != null && meta.ratingsCount > 0;

  const acclaimResult = computeAcclaim(acclaimReadings(meta));
  const acclaim = acclaimResult.score;
  const popularity = popularityScore(meta.readingLogCount);
  const readability = readabilityScore(meta);
  const stayingPower = stayingPowerScore(meta, refYear);

  const dataReliability = reliability(meta.ratingsCount, hasRating);

  const weights = {
    acclaim: 0.42,
    popularity: 0.2,
    readability: 0.2,
    stayingPower: 0.18,
  };

  const weighted =
    acclaim * weights.acclaim +
    popularity * weights.popularity +
    readability * weights.readability +
    stayingPower * weights.stayingPower;

  const score = clamp(round(weighted));

  const breakdown: ScoreBreakdown = {
    acclaim: round(acclaim),
    popularity: round(popularity),
    readability: round(readability),
    stayingPower: round(stayingPower),
    dataReliability,
  };

  const confidence = overallConfidence(meta, dataReliability);

  const weightOf = (key: string) => {
    const c = acclaimResult.contributions.find((x) => x.key === key);
    return c ? Math.round(c.weight * 100) / 100 : undefined;
  };

  const sources: RatingSource[] = [
    {
      name: 'Open Library readers',
      value: hasRating ? round(clamp(meta.ratingsAverage! * 20)) : null,
      raw: hasRating
        ? `${meta.ratingsAverage!.toFixed(1)}/5 (${meta.ratingsCount.toLocaleString()} ratings)`
        : null,
      available: hasRating,
      weight: weightOf('openLibrary'),
    },
  ];

  return {
    score,
    breakdown,
    confidence,
    sources,
    acclaimScore: acclaimResult.score,
    acclaimConfidence: acclaimResult.confidence,
  };
}

function overallConfidence(
  meta: BookMetadata,
  dataReliability: Confidence,
): Confidence {
  let points = 0;
  if (dataReliability === 'high') points += 2;
  else if (dataReliability === 'medium') points += 1;
  if (meta.description && meta.description.length > 40) points += 1;
  if (meta.subjects.length > 0) points += 1;
  if (meta.pageCount != null && meta.pageCount > 0) points += 1;
  if (meta.editionCount >= 5) points += 1;
  if (points >= 4) return 'high';
  if (points >= 2) return 'medium';
  return 'low';
}
