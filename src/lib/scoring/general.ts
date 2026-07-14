import type {
  Confidence,
  RatingSource,
  ScoreBreakdown,
  TitleMetadata,
  WatchProviders,
  WatchVerdictScore,
} from '@/lib/types';

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const round = (n: number) => Math.round(n);

/** Neutral prior used when audience data is missing. */
const NEUTRAL = 55;

/**
 * Bayesian shrinkage of an audience average toward the neutral prior based on
 * how many votes back it. Few votes => pulled toward neutral (less trust).
 */
function shrinkAudience(voteAverage: number | null, voteCount: number): number {
  if (voteAverage == null) return NEUTRAL;
  const raw = clamp(voteAverage * 10);
  const m = 250; // prior strength in "equivalent votes"
  const weighted = (voteCount * raw + m * NEUTRAL) / (voteCount + m);
  return clamp(weighted);
}

function reliability(voteCount: number, hasVote: boolean): Confidence {
  if (!hasVote) return 'low';
  if (voteCount >= 1000) return 'high';
  if (voteCount >= 200) return 'medium';
  return 'low';
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
  const quality = shrinkAudience(meta.voteAverage, meta.voteCount);
  const engagement = engagementScore(meta.popularity);
  const watchability = watchabilityScore(meta, providers);
  // With only TMDB data, execution/production reception are proxied by the
  // shrunk audience quality signal. This is labeled as a data limitation.
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

  const sources: RatingSource[] = [
    {
      name: 'TMDB Audience',
      value: hasVote ? round(clamp(meta.voteAverage! * 10)) : null,
      raw: hasVote ? `${meta.voteAverage!.toFixed(1)}/10 (${meta.voteCount.toLocaleString()} votes)` : null,
      available: hasVote,
    },
  ];

  return { score, breakdown, confidence, sources };
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
