/**
 * Optional Watch-DNA calibration PACKS (pure definitions). After the finite
 * onboarding, a user can run small, focused booster packs (Crime, Comedy, Anime,
 * …). Completing a pack raises DNA Confidence ONLY — it never touches Quiz
 * Progress (that metric belongs to the finite onboarding alone). Each pack is a
 * single, well-scoped TMDB discover query; the route fetches and caps it.
 */
import type { CalGenre } from './calibration';

export interface PackQuery {
  mediaType: 'movie' | 'tv';
  genreIds: number[];
  minVotes?: number;
  minYear?: number;
  maxYear?: number;
  originalLanguage?: string;
  originCountry?: string;
  sortBy?: string;
}

export interface CalibrationPack {
  key: string;
  name: string;
  emoji: string;
  description: string;
  /** Target number of titles (5–10). */
  size: number;
  /** CalGenres these titles are tagged with (by construction). */
  genres: CalGenre[];
  query: PackQuery;
}

const G = {
  action: 28, actionTv: 10759, adventure: 12, animation: 16, comedy: 35, crime: 80,
  documentary: 99, drama: 18, family: 10751, mystery: 9648, romance: 10749,
  scifi: 878, thriller: 53, tvMovie: 10770, reality: 10764,
} as const;

export const PACKS: readonly CalibrationPack[] = [
  { key: 'crime', name: 'Crime', emoji: '🕵️', description: 'Heists, detectives, and true-crime drama.', size: 8, genres: ['crime', 'thriller'],
    query: { mediaType: 'movie', genreIds: [G.crime, G.thriller], minVotes: 600 } },
  { key: 'comedy', name: 'Comedy', emoji: '😂', description: 'From sitcoms to laugh-out-loud films.', size: 8, genres: ['comedy'],
    query: { mediaType: 'movie', genreIds: [G.comedy], minVotes: 600 } },
  { key: 'reality', name: 'Reality TV', emoji: '📹', description: 'Competition, dating, and unscripted.', size: 6, genres: ['reality'],
    query: { mediaType: 'tv', genreIds: [G.reality], minVotes: 20 } },
  { key: 'anime', name: 'Anime', emoji: '🌸', description: 'Japanese animated series and films.', size: 8, genres: ['animation'],
    query: { mediaType: 'tv', genreIds: [G.animation], originalLanguage: 'ja', minVotes: 150 } },
  { key: 'documentary', name: 'Documentary', emoji: '🎞️', description: 'Real stories, real people.', size: 6, genres: ['documentary'],
    query: { mediaType: 'movie', genreIds: [G.documentary], minVotes: 100 } },
  { key: 'hallmark', name: 'Hallmark / Lifetime', emoji: '💝', description: 'Cozy TV-movie romance and family.', size: 6, genres: ['romance', 'family'],
    query: { mediaType: 'movie', genreIds: [G.tvMovie, G.romance], minVotes: 5 } },
  { key: 'family', name: 'Family', emoji: '👨‍👩‍👧', description: 'Watch-together picks for all ages.', size: 7, genres: ['family'],
    query: { mediaType: 'movie', genreIds: [G.family, G.animation], minVotes: 400 } },
  { key: 'international', name: 'International', emoji: '🌍', description: 'Acclaimed non-English stories.', size: 8, genres: ['drama'],
    query: { mediaType: 'movie', genreIds: [G.drama], originalLanguage: 'ko', minVotes: 150 } },
  { key: 'action', name: 'Action', emoji: '💥', description: 'Blockbusters and adrenaline.', size: 8, genres: ['action'],
    query: { mediaType: 'movie', genreIds: [G.action, G.adventure], minVotes: 800 } },
  { key: 'classic', name: 'Classic Movies', emoji: '🎬', description: 'Timeless, acclaimed older films.', size: 8, genres: ['drama'],
    query: { mediaType: 'movie', genreIds: [G.drama], minVotes: 800, minYear: 1950, maxYear: 2000, sortBy: 'vote_average.desc' } },
] as const;

export function packByKey(key: string): CalibrationPack | null {
  return PACKS.find((p) => p.key === key) ?? null;
}

/** The event source tag a pack's answers carry (drives packAnswers signal). */
export function packSource(key: string): string {
  return `pack:${key}`;
}
