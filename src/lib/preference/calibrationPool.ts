/**
 * Calibration POOL sourcing plan (pure). The finite 20-title calibration must
 * sample the widest possible range of entertainment. Rather than hope a generic
 * "popular titles" feed happens to be diverse, we source it by CONSTRUCTION: a
 * fixed set of buckets, each a specific TMDB discover query (genre + format +
 * era + language), so every returned title's tags are known for certain. The
 * greedy planner (`buildCalibrationPlan`) then trims the union to a capped,
 * balanced 20.
 *
 * This module is pure: it defines the buckets and maps a bucket + a fetched
 * title into a tagged `CalCandidate`. The actual TMDB fetch lives in the route.
 */
import type { CalCandidate, CalGenre } from './calibration';

export interface PoolBucket {
  id: string;
  mediaType: 'movie' | 'tv';
  /** TMDB genre ids to request (with_genres, OR). */
  genreIds: number[];
  /** The CalGenres these titles are tagged with (by construction). */
  genres: CalGenre[];
  /** How many titles to pull from this bucket. */
  take: number;
  minYear?: number;
  maxYear?: number;
  minVotes?: number;
  originalLanguage?: string;
  originCountry?: string;
  anime?: boolean;
  hallmark?: boolean;
  prestige?: boolean;
  polarizing?: boolean;
  family?: boolean;
}

/**
 * RECOGNISABILITY FLOORS.
 *
 * A calibration card only teaches us something if the person has heard of the
 * title. If they have not, the honest answer is "no idea", and the quiz has no
 * such button — so the answer becomes Skip, which the engine records as
 * `not_interested`. That turns ignorance into a stated dislike, which is a
 * fabricated preference, and twenty of them is a profile built out of nothing.
 *
 * So every bucket carries a vote-count floor. The rare categories keep LOWER
 * floors than the mainstream ones — a Hallmark TV movie genuinely never
 * accumulates blockbuster vote counts, and dropping the category entirely would
 * be worse than showing a moderately known example — but none of them may sit
 * so low that TMDB starts returning titles nobody could name.
 */
export const RECOGNISABLE = {
  /** Mainstream film and TV: no excuse for anything obscure here. */
  mainstream: 800,
  /** Genres with smaller audiences but real hits. */
  niche: 300,
  /** Categories that never chart: reality, soap, Hallmark, family TV. */
  rare: 120,
} as const;

// TMDB genre ids (movie + tv share some; reality/soap are tv-only).
const G = {
  action: 28, actionTv: 10759, adventure: 12, animation: 16, comedy: 35, crime: 80,
  documentary: 99, drama: 18, family: 10751, fantasy: 14, horror: 27, mystery: 9648,
  romance: 10749, scifi: 878, scifiTv: 10765, thriller: 53, tvMovie: 10770,
  reality: 10764, soap: 10766,
} as const;

/**
 * The fixed sourcing plan. Deliberately over-samples (union ~40+) so the planner
 * always has enough to build a capped, balanced 20 even if a bucket comes back
 * thin. Rare-but-required buckets (reality, anime, documentary, soap, hallmark,
 * international, classics) are guaranteed a slot here so the plan can satisfy its
 * MINS.
 */
export const CALIBRATION_BUCKETS: readonly PoolBucket[] = [
  // Mainstream movie genres
  { id: 'drama-movie', mediaType: 'movie', genreIds: [G.drama], genres: ['drama'], take: 3, minVotes: RECOGNISABLE.mainstream, prestige: true },
  { id: 'comedy-movie', mediaType: 'movie', genreIds: [G.comedy], genres: ['comedy'], take: 3, minVotes: RECOGNISABLE.mainstream },
  { id: 'crime-thriller-movie', mediaType: 'movie', genreIds: [G.crime, G.thriller], genres: ['crime', 'thriller'], take: 3, minVotes: RECOGNISABLE.mainstream },
  { id: 'action-movie', mediaType: 'movie', genreIds: [G.action, G.adventure], genres: ['action'], take: 2, minVotes: RECOGNISABLE.mainstream },
  { id: 'scifi-movie', mediaType: 'movie', genreIds: [G.scifi], genres: ['scifi'], take: 2, minVotes: RECOGNISABLE.mainstream, polarizing: true },
  { id: 'horror-movie', mediaType: 'movie', genreIds: [G.horror], genres: ['horror'], take: 2, minVotes: RECOGNISABLE.mainstream, polarizing: true },
  { id: 'romance-movie', mediaType: 'movie', genreIds: [G.romance], genres: ['romance'], take: 2, minVotes: RECOGNISABLE.mainstream },
  { id: 'fantasy-movie', mediaType: 'movie', genreIds: [G.fantasy], genres: ['fantasy'], take: 1, minVotes: RECOGNISABLE.mainstream },
  { id: 'family-animation-movie', mediaType: 'movie', genreIds: [G.animation, G.family], genres: ['animation', 'family'], take: 2, minVotes: RECOGNISABLE.mainstream, family: true },
  { id: 'documentary', mediaType: 'movie', genreIds: [G.documentary], genres: ['documentary'], take: 2, minVotes: RECOGNISABLE.niche },

  // TV genres
  { id: 'drama-tv', mediaType: 'tv', genreIds: [G.drama], genres: ['drama'], take: 3, minVotes: RECOGNISABLE.niche, prestige: true },
  { id: 'comedy-tv', mediaType: 'tv', genreIds: [G.comedy], genres: ['comedy'], take: 2, minVotes: RECOGNISABLE.niche },
  { id: 'crime-tv', mediaType: 'tv', genreIds: [G.crime, G.mystery], genres: ['crime', 'mystery'], take: 2, minVotes: RECOGNISABLE.niche },
  { id: 'scifi-tv', mediaType: 'tv', genreIds: [G.scifiTv], genres: ['scifi'], take: 1, minVotes: RECOGNISABLE.niche },
  { id: 'reality-tv', mediaType: 'tv', genreIds: [G.reality], genres: ['reality'], take: 2, minVotes: RECOGNISABLE.rare },
  { id: 'soap-tv', mediaType: 'tv', genreIds: [G.soap], genres: ['soap'], take: 1, minVotes: RECOGNISABLE.rare },
  { id: 'family-tv', mediaType: 'tv', genreIds: [G.family], genres: ['family'], take: 1, minVotes: RECOGNISABLE.rare, family: true },

  // Anime (capped to 1 by the planner regardless of how many we source)
  { id: 'anime-tv', mediaType: 'tv', genreIds: [G.animation], genres: ['animation'], take: 2, minVotes: RECOGNISABLE.niche, originalLanguage: 'ja', anime: true },

  // International (non-domestic origin)
  { id: 'kdrama-tv', mediaType: 'tv', genreIds: [G.drama], genres: ['drama'], take: 2, minVotes: RECOGNISABLE.niche, originalLanguage: 'ko', originCountry: 'KR' },
  { id: 'intl-movie-es', mediaType: 'movie', genreIds: [G.drama], genres: ['drama'], take: 1, minVotes: RECOGNISABLE.niche, originalLanguage: 'es' },

  // Hallmark / Lifetime style — TV movies, romance/family
  { id: 'hallmark', mediaType: 'movie', genreIds: [G.tvMovie, G.romance], genres: ['romance', 'family'], take: 1, minVotes: RECOGNISABLE.rare, hallmark: true },

  // Classics (older, acclaimed) — great taste signal. Spread across genres so
  // old titles don't all collide on the per-genre cap (and to widen taste range).
  { id: 'classic-drama-movie', mediaType: 'movie', genreIds: [G.drama], genres: ['drama'], take: 2, minVotes: RECOGNISABLE.mainstream, minYear: 1970, maxYear: 2004, prestige: true },
  { id: 'classic-thriller-movie', mediaType: 'movie', genreIds: [G.thriller, G.mystery], genres: ['thriller', 'mystery'], take: 2, minVotes: RECOGNISABLE.mainstream, minYear: 1970, maxYear: 2004 },
  { id: 'classic-scifi-movie', mediaType: 'movie', genreIds: [G.scifi], genres: ['scifi'], take: 1, minVotes: RECOGNISABLE.mainstream, minYear: 1970, maxYear: 2004, polarizing: true },
  { id: 'classic-tv', mediaType: 'tv', genreIds: [G.comedy], genres: ['comedy'], take: 1, minVotes: RECOGNISABLE.niche, minYear: 1975, maxYear: 2004 },
] as const;

/** The origin country a bucket's titles carry (for international detection). */
function countryOfBucket(b: PoolBucket, domestic: string): string {
  if (b.originCountry) return b.originCountry;
  if (b.originalLanguage && b.originalLanguage !== 'en') {
    // Best-effort language → country for the "international" test.
    const map: Record<string, string> = { ja: 'JP', ko: 'KR', es: 'ES', fr: 'FR', de: 'DE', it: 'IT' };
    return map[b.originalLanguage] ?? 'XX';
  }
  return domestic;
}

export interface FetchedTitle {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterPath: string | null;
}

/** Turn a fetched TMDB title into a fully-tagged calibration candidate. */
export function taggedFromBucket(t: FetchedTitle, b: PoolBucket, domestic = 'US'): CalCandidate {
  return {
    key: `${t.mediaType}:${t.id}`,
    mediaType: t.mediaType,
    genres: b.genres,
    year: t.year,
    country: countryOfBucket(b, domestic),
    anime: b.anime,
    hallmark: b.hallmark,
    prestige: b.prestige,
    polarizing: b.polarizing,
    family: b.family || b.genres.includes('family'),
  };
}
