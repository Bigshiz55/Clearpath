// Shared domain types for WatchVrdIQt.

export type MediaType = 'movie' | 'tv';

export type VerdictTier =
  | 'Must Watch'
  | 'Strong Watch'
  | 'Worth Watching'
  | 'Possible Watch'
  | 'Low Priority'
  | 'Skip';

/** The headline, at-a-glance call shown above everything else. */
export type PrimaryCall = 'WATCH IT' | 'MAYBE' | 'SKIP IT';

export type WatchlistDisposition =
  | 'Strict Watchlist'
  | 'Possible Watchlist'
  | 'Skip';

export type WatchlistStatus =
  | 'strict'
  | 'possible'
  | 'watching'
  | 'watched'
  | 'paused'
  | 'dropped';

/** Normalized title metadata (provider-agnostic, derived from TMDB). */
export interface TitleMetadata {
  id: number;
  mediaType: MediaType;
  title: string;
  originalTitle?: string;
  year: number | null;
  overview: string;
  genres: string[];
  keywords: string[];
  posterPath: string | null;
  backdropPath: string | null;
  runtimeMinutes: number | null;
  episodeRuntimeMinutes: number | null;
  numberOfSeasons?: number | null;
  numberOfEpisodes?: number | null;
  status?: string | null; // e.g. Released, Returning Series, Canceled, Ended
  contentRating: string | null; // e.g. PG-13, TV-MA
  /** TMDB average vote 0..10 (audience-oriented). null when unavailable. */
  voteAverage: number | null;
  voteCount: number;
  popularity: number | null;
  trailerUrl: string | null;
  originalLanguage: string | null;
  spokenLanguages: string[];
  originCountries: string[];
  imdbId: string | null;
  /** Critic/aggregator ratings from OMDb (optional provider). null when absent. */
  imdbRating: number | null; // 0..10
  rottenTomatoes: number | null; // 0..100 — Tomatometer (critics)
  rtAudience?: number | null; // 0..100 — Rotten Tomatoes audience / Popcorn (MDBList)
  metascore: number | null; // 0..100 — Metacritic critics (Metascore)
  /** Extra community/critic ratings from MDBList — display-only, never blended
   *  into the authoritative Standard Score. null when absent (never faked). */
  metacriticUser?: number | null; // 0..10 — Metacritic user score
  trakt?: number | null; // 0..100 — Trakt community rating
  letterboxd?: number | null; // 0..5 — Letterboxd community average
  rogerEbert?: number | null; // 0..4 — RogerEbert.com star rating
  /** TV episode counts. episodesTotal is null when the run is ongoing/unknown. */
  episodesAired: number | null;
  episodesTotal: number | null;
  nextEpisodeDate: string | null;
  /**
   * How reachable this is in English:
   * - native: originally in English
   * - available: an English version/track exists per TMDB (dub or sub; varies by provider)
   * - subtitles: non-English; expect subtitles
   * - unknown: not enough data
   */
  englishAvailability: 'native' | 'available' | 'subtitles' | 'unknown';
}

/** A lightweight "more like this" suggestion. */
export interface SimilarTitle {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  voteAverage: number | null;
}

/** A single streaming/rental/purchase option for a region. */
export interface WatchProvider {
  providerId: number;
  providerName: string;
  logoPath: string | null;
  type: 'flatrate' | 'free' | 'ads' | 'rent' | 'buy';
  /** Deep link straight to the title on this service (Watchmode). Null when we
   *  only know it's available (TMDB) but have no direct link. */
  link?: string | null;
}

export interface WatchProviders {
  region: string;
  link: string | null; // TMDB/JustWatch attribution link
  options: WatchProvider[];
  available: boolean; // whether TMDB returned any data for this region
}

/** A user preference rule (penalty/boost) applied by the scoring engine. */
export interface PreferenceRule {
  id?: string;
  /** Category of trait this rule targets. */
  trait: PreferenceTrait;
  /** Signed points; negative = penalty, positive = boost. */
  weight: number;
  /**
   * If true, the rule fires only when the trait is a *defining* characteristic
   * of the title (dominant genre / dense keywords), not a secondary tag.
   */
  requiresDefining: boolean;
  label: string;
}

export type PreferenceTrait =
  | 'supernatural'
  | 'paranormal'
  | 'noir'
  | 'slow_burn'
  | 'science_fiction'
  | 'fantasy'
  | 'grounded_crime'
  | 'psychological_thriller'
  | 'serial_killer'
  | 'detective_mystery'
  | 'domestic_thriller'
  | 'franchise_favorite';

export interface ScoreAdjustment {
  trait: PreferenceTrait | 'base';
  label: string;
  points: number; // signed
  reason: string;
  defining: boolean;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface ScoreBreakdown {
  quality: number; // 0..100 contribution area, pre-weight
  audience: number;
  watchability: number;
  engagement: number;
  execution: number;
  production: number;
  dataReliability: Confidence;
}

export interface WatchVerdictScore {
  /** 0..100 general recommendation score. */
  score: number;
  breakdown: ScoreBreakdown;
  confidence: Confidence;
  sources: RatingSource[];
  /** The blended, confidence-weighted quality number across all rating
   *  sources (0..100). Its own confidence travels alongside. */
  standardScore?: number;
  standardConfidence?: Confidence;
}

export interface RatingSource {
  name: string; // e.g. "TMDB Audience"
  value: number | null; // normalized 0..100, null if unavailable
  raw: string | null; // human display, e.g. "7.8/10"
  available: boolean;
  /** Effective share of the Standard Score blend, 0..1 (present sources only). */
  weight?: number;
}

export interface PersonalMatch {
  label: string; // e.g. "Scott Match"
  score: number; // 0..100
  adjustments: ScoreAdjustment[];
  baseScore: number;
}

export interface VerdictReport {
  title: TitleMetadata;
  general: WatchVerdictScore;
  personal: PersonalMatch;
  primaryCall: PrimaryCall;
  tier: VerdictTier;
  watchlistDisposition: WatchlistDisposition;
  oneLiner: string;
  reasonsFor: string[];
  reasonsAgainst: string[];
  contentSignals: ContentSignal[];
  providers: WatchProviders | null;
  similar: SimilarTitle[];
  generatedAt: string;
}

export interface ContentSignal {
  label: string;
  level: 'none' | 'low' | 'moderate' | 'high' | 'unknown';
  note?: string;
}
