import type {
  Confidence,
  RatingSource,
  ScoreBreakdown,
  TitleMetadata,
  WatchProviders,
  WatchVerdictScore,
} from '@/lib/types';
import { computeStandardScore, type SourceReading } from './standardScore';
import { STANDARD_WEIGHTS } from './standardWeights';

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);

/** Neutral prior used when audience data is missing. */
const NEUTRAL = 55;

function reliability(voteCount: number, hasVote: boolean): Confidence {
  if (!hasVote) return 'low';
  if (voteCount >= 1000) return 'high';
  if (voteCount >= 200) return 'medium';
  return 'low';
}

/** Assemble the rating-source readings the Standard Score blends. */
export function standardReadings(meta: TitleMetadata): SourceReading[] {
  const readings: SourceReading[] = [];
  if (meta.voteAverage != null && meta.voteCount > 0) {
    readings.push({ key: 'tmdbAudience', value: clamp(meta.voteAverage * 10), sampleSize: meta.voteCount });
  }
  if (meta.imdbRating != null) readings.push({ key: 'imdb', value: clamp(meta.imdbRating * 10), sampleSize: Number.POSITIVE_INFINITY });
  if (meta.rottenTomatoes != null) readings.push({ key: 'rottenTomatoes', value: clamp(meta.rottenTomatoes), sampleSize: Number.POSITIVE_INFINITY });
  if (meta.rtAudience != null) readings.push({ key: 'rtAudience', value: clamp(meta.rtAudience), sampleSize: Number.POSITIVE_INFINITY });
  if (meta.metascore != null) readings.push({ key: 'metacritic', value: clamp(meta.metascore), sampleSize: Number.POSITIVE_INFINITY });
  return readings;
}

/** Log-scaled engagement from TMDB popularity. */
function engagementScore(popularity: number | null): number {
  if (popularity == null || popularity <= 0) return NEUTRAL;
  // popularity is unbounded (often 5..500+). Log-compress to 0..100.
  const v = 40 + 18 * Math.log10(popularity + 1);
  return clamp(v);
}

function watchabilityScore(
  meta: TitleMetadata,
  providers: WatchProviders | null,
): number {
  let s = 70;
  const runtime =
    meta.mediaType === 'movie'
      ? meta.runtimeMinutes ?? 0
      : meta.episodeRuntimeMinutes ?? 0;

  if (meta.mediaType === 'movie') {
    if (runtime > 0 && runtime <= 130) s += 6;
    else if (runtime > 160) s -= 10;
    else if (runtime > 145) s -= 5;
  } else {
    // Episodic. Long per-episode runtimes are less bingeable.
    if (runtime > 0 && runtime <= 50) s += 5;
    // Canceled / unfinished series hurt watchability.
    const status = (meta.status ?? '').toLowerCase();
    if (status.includes('cancel')) s -= 14;
  }

  if (providers) {
    if (providers.available && providers.options.length > 0) s += 8;
    else s -= 6; // known-unavailable in region
  }

  return clamp(s);
}

export function computeGeneralScore(
  meta: TitleMetadata,
  providers: WatchProviders | null,
): WatchVerdictScore {
  const hasVote = meta.voteAverage != null && meta.voteCount > 0;
  const audience = hasVote ? clamp(meta.voteAverage! * 10) : NEUTRAL;
  // The Standard Score — one confidence-weighted number across every rating
  // source we actually have. It IS the quality signal now.
  const standard = computeStandardScore(standardReadings(meta), STANDARD_WEIGHTS);
  const quality = standard.score;
  const engagement = engagementScore(meta.popularity);
  const watchability = watchabilityScore(meta, providers);
  // Execution/production reception are proxied by the blended quality signal
  // (labeled as a data limitation when no critic data is present).
  const execution = quality;
  const production = quality;

  const dataReliability = reliability(meta.voteCount, hasVote);

  const weights = {
    quality: 0.3,
    audience: 0.28,
    watchability: 0.16,
    engagement: 0.1,
    execution: 0.1,
    production: 0.06,
  };

  const weighted =
    quality * weights.quality +
    audience * weights.audience +
    watchability * weights.watchability +
    engagement * weights.engagement +
    execution * weights.execution +
    production * weights.production;

  const score = clamp(round(weighted));

  const breakdown: ScoreBreakdown = {
    quality: round(quality),
    audience: round(audience),
    watchability: round(watchability),
    engagement: round(engagement),
    execution: round(execution),
    production: round(production),
    dataReliability,
  };

  const confidence = overallConfidence(meta, providers, dataReliability);

  const weightOf = (key: string) => {
    const c = standard.contributions.find((x) => x.key === key);
    return c ? Math.round(c.weight * 100) / 100 : undefined;
  };

  const sources: RatingSource[] = [
    {
      name: 'TMDB Audience',
      value: hasVote ? round(clamp(meta.voteAverage! * 10)) : null,
      raw: hasVote ? `${meta.voteAverage!.toFixed(1)}/10 (${meta.voteCount.toLocaleString()} votes)` : null,
      available: hasVote,
      weight: weightOf('tmdbAudience'),
    },
    {
      name: 'IMDb',
      value: meta.imdbRating != null ? round(clamp(meta.imdbRating * 10)) : null,
      raw: meta.imdbRating != null ? `${meta.imdbRating.toFixed(1)}/10` : null,
      available: meta.imdbRating != null,
      weight: weightOf('imdb'),
    },
    {
      name: 'Rotten Tomatoes',
      value: meta.rottenTomatoes,
      raw: meta.rottenTomatoes != null ? `${meta.rottenTomatoes}%` : null,
      available: meta.rottenTomatoes != null,
      weight: weightOf('rottenTomatoes'),
    },
    {
      name: 'RT Audience',
      value: meta.rtAudience ?? null,
      raw: meta.rtAudience != null ? `${meta.rtAudience}%` : null,
      available: meta.rtAudience != null,
      weight: weightOf('rtAudience'),
    },
    {
      name: 'Metacritic',
      value: meta.metascore,
      raw: meta.metascore != null ? `${meta.metascore}/100` : null,
      available: meta.metascore != null,
      weight: weightOf('metacritic'),
    },
    // Extra community/critic feeds from MDBList. These are shown for context in
    // the consensus but are NOT blended into the Standard Score — that number
    // stays deterministic and calibrated. No weight; display-only.
    {
      name: 'Metacritic Users',
      value: meta.metacriticUser != null ? round(clamp(meta.metacriticUser * 10)) : null,
      raw: meta.metacriticUser != null ? `${meta.metacriticUser.toFixed(1)}/10` : null,
      available: meta.metacriticUser != null,
    },
    {
      name: 'Trakt',
      value: meta.trakt ?? null,
      raw: meta.trakt != null ? `${meta.trakt}%` : null,
      available: meta.trakt != null,
    },
    {
      name: 'Letterboxd',
      value: meta.letterboxd != null ? round(clamp(meta.letterboxd * 20)) : null,
      raw: meta.letterboxd != null ? `${meta.letterboxd.toFixed(1)}/5` : null,
      available: meta.letterboxd != null,
    },
    {
      name: 'Roger Ebert',
      value: meta.rogerEbert != null ? round(clamp(meta.rogerEbert * 25)) : null,
      raw: meta.rogerEbert != null ? `${meta.rogerEbert.toFixed(1)}/4` : null,
      available: meta.rogerEbert != null,
    },
  ];

  return { score, breakdown, confidence, sources, standardScore: standard.score, standardConfidence: standard.confidence };
}

function overallConfidence(
  meta: TitleMetadata,
  providers: WatchProviders | null,
  dataReliability: Confidence,
): Confidence {
  let points = 0;
  if (dataReliability === 'high') points += 2;
  else if (dataReliability === 'medium') points += 1;
  if (meta.overview && meta.overview.length > 40) points += 1;
  if (meta.genres.length > 0) points += 1;
  if (providers && providers.available) points += 1;
  if (points >= 4) return 'high';
  if (points >= 2) return 'medium';
  return 'low';
}
