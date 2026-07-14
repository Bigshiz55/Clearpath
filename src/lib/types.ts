// Shared domain types for WatchVerdict.

export type MediaType = 'movie' | 'tv';

export type VerdictTier =
  | 'Must Watch'
  | 'Strong Watch'
  | 'Worth Watching'
  | 'Possible Watch'
  | 'Low Priority'
  | 'Skip';

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
}

/** A single streaming/rental/purchase option for a region. */
export interface WatchProvider {
  providerId: number;
  providerName: string;
  logoPath: string | null;
  type: 'flatrate' | 'free' | 'ads' | 'rent' | 'buy';
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
}

export interface RatingSource {
  name: string; // e.g. "TMDB Audience"
  value: number | null; // normalized 0..100, null if unavailable
  raw: string | null; // human display, e.g. "7.8/10"
  available: boolean;
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
  tier: VerdictTier;
  watchlistDisposition: WatchlistDisposition;
  oneLiner: string;
  reasonsFor: string[];
  reasonsAgainst: string[];
  contentSignals: ContentSignal[];
  providers: WatchProviders | null;
  generatedAt: string;
}

export interface ContentSignal {
  label: string;
  level: 'none' | 'low' | 'moderate' | 'high' | 'unknown';
  note?: string;
}
