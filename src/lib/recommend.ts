import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType, PrimaryCall, VerdictTier } from '@/lib/types';
import { getSimilar, getTitle, discoverByGenres } from '@/lib/tmdb/client';
import { buildVerdict } from '@/lib/scoring';
import type { PersonalContext } from '@/lib/scoring/personal';
import { getProfile, getPersonalContext, regionFor } from '@/lib/profile';
import { tileRatingsFromScore, type TileRatings } from '@/lib/ratings';

// Map each positive taste trait to TMDB genres, per media type, so the cold-start
// pool reflects whatever profile the user has (Scott, Heather, Amy, …).
const TRAIT_GENRES: Record<string, { movie: number[]; tv: number[] }> = {
  grounded_crime: { movie: [80], tv: [80] },
  serial_killer: { movie: [80, 53], tv: [80, 9648] },
  psychological_thriller: { movie: [53], tv: [9648] },
  domestic_thriller: { movie: [53], tv: [18] },
  detective_mystery: { movie: [9648], tv: [9648] },
};
const DEFAULT_MOVIE_GENRES = [18, 53, 9648, 80]; // drama, thriller, mystery, crime
const DEFAULT_TV_GENRES = [18, 80, 9648];

const SEED_LIMIT = 6;
const CANDIDATES_TO_SCORE = 18;
const RESULT_LIMIT = 12;
// Only surface titles that actually fit the profile (Possible Watch and above).
const MIN_SCORE = 55;

export interface Recommendation {
  id: number;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterPath: string | null;
  personalScore: number;
  tier: VerdictTier;
  primaryCall: PrimaryCall;
  /** The watched title that seeded this suggestion ("Because you liked …"). */
  because: string | null;
  /** Top positive preference trait that fired ("Grounded crime drama"). */
  matchReason: string | null;
  /** Real ratings for the tile plaque (only what we actually have). */
  ratings: TileRatings;
}

interface SeedRow {
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  rating: number | null;
}

interface Candidate {
  id: number;
  mediaType: MediaType;
  posterPath: string | null;
  seedTitle: string;
  freq: number;
  vote: number;
}

/**
 * Personalized "Recommended for you" list.
 *
 * Seeds from the user's highest-rated watched titles, pulls TMDB "similar"
 * titles for each, then scores every candidate through the deterministic
 * verdict engine and keeps the ones that fit the profile. Each result carries
 * both the seed it came from and the top preference trait that matched, so the
 * UI can explain *why* it's recommended.
 */
export async function getRecommendations(
  supabase: SupabaseClient,
  userId: string,
): Promise<Recommendation[]> {
  const profile = await getProfile(supabase, userId);
  const region = regionFor(profile);
  const personal = await getPersonalContext(supabase, userId, null);

  const [wlAll, verdicts, watchedFavs] = await Promise.all([
    supabase.from('watchlist_items').select('tmdb_id, media_type').eq('user_id', userId),
    supabase.from('verdicts').select('tmdb_id, media_type').eq('user_id', userId),
    supabase
      .from('watchlist_items')
      .select('tmdb_id, media_type, title, rating')
      .eq('user_id', userId)
      .eq('status', 'watched')
      .order('rating', { ascending: false, nullsFirst: false })
      .order('watched_at', { ascending: false })
      .limit(SEED_LIMIT * 3),
  ]);

  // Never recommend something the user already has on a list or has a verdict for.
  const exclude = new Set<string>();
  for (const r of wlAll.data ?? []) exclude.add(`${r.media_type}-${r.tmdb_id}`);
  for (const r of verdicts.data ?? []) exclude.add(`${r.media_type}-${r.tmdb_id}`);

  // Seeds: prefer titles rated 8+; fall back to any watched title.
  const watched = (watchedFavs.data ?? []) as SeedRow[];
  let seeds = watched.filter((s) => (s.rating ?? 0) >= 8).slice(0, SEED_LIMIT);
  if (seeds.length === 0) seeds = watched.slice(0, SEED_LIMIT);
  // No watch history yet: recommend straight from the taste profile.
  if (seeds.length === 0) return coldStartFromProfile(personal, region, exclude);

  const seedResults = await Promise.all(
    seeds.map(async (s) => ({
      seed: s,
      similar: await getSimilar(s.media_type, s.tmdb_id).catch(() => []),
    })),
  );

  // Aggregate candidates; a title suggested by multiple favorites ranks higher.
  const candMap = new Map<string, Candidate>();
  for (const { seed, similar } of seedResults) {
    for (const t of similar) {
      const key = `${t.mediaType}-${t.id}`;
      if (exclude.has(key) || !t.posterPath) continue;
      const existing = candMap.get(key);
      if (existing) {
        existing.freq += 1;
        existing.vote = Math.max(existing.vote, t.voteAverage ?? 0);
      } else {
        candMap.set(key, {
          id: t.id,
          mediaType: t.mediaType,
          posterPath: t.posterPath,
          seedTitle: seed.title,
          freq: 1,
          vote: t.voteAverage ?? 0,
        });
      }
    }
  }

  const candidates = Array.from(candMap.values())
    .sort((a, b) => b.freq - a.freq || b.vote - a.vote)
    .slice(0, CANDIDATES_TO_SCORE);
  if (candidates.length === 0) return [];

  const scored = await Promise.all(
    candidates.map((c) =>
      scoreCandidate(c.id, c.mediaType, c.posterPath, region, personal, c.seedTitle),
    ),
  );

  return finalize(scored);
}

/** Fetch a candidate's metadata, score it against the profile, shape the result. */
async function scoreCandidate(
  id: number,
  mediaType: MediaType,
  fallbackPoster: string | null,
  region: string,
  personal: PersonalContext,
  because: string | null,
): Promise<Recommendation | null> {
  try {
    const meta = await getTitle(mediaType, id, region);
    const report = buildVerdict({ meta, providers: null, personal });
    const topPos = report.personal.adjustments.find((a) => a.points > 0);
    return {
      id,
      mediaType,
      title: meta.title,
      year: meta.year,
      posterPath: meta.posterPath ?? fallbackPoster,
      personalScore: report.personal.score,
      tier: report.tier,
      primaryCall: report.primaryCall,
      because,
      matchReason: topPos ? topPos.label : null,
      ratings: tileRatingsFromScore(report.general),
    };
  } catch {
    return null;
  }
}

function finalize(scored: (Recommendation | null)[]): Recommendation[] {
  return scored
    .filter((r): r is Recommendation => r !== null && r.personalScore >= MIN_SCORE)
    .sort((a, b) => b.personalScore - a.personalScore)
    .slice(0, RESULT_LIMIT);
}

/** Genre pool derived from the profile's positive traits (per media type). */
function genresFromRules(personal: PersonalContext): { movie: number[]; tv: number[] } {
  const movie = new Set<number>();
  const tv = new Set<number>();
  for (const rule of personal.rules) {
    if (rule.weight <= 0) continue;
    const g = TRAIT_GENRES[rule.trait];
    if (!g) continue;
    g.movie.forEach((m) => movie.add(m));
    g.tv.forEach((t) => tv.add(t));
  }
  return {
    movie: movie.size > 0 ? [...movie] : DEFAULT_MOVIE_GENRES,
    tv: tv.size > 0 ? [...tv] : DEFAULT_TV_GENRES,
  };
}

/**
 * Recommendations with no watch history: pull popular, well-rated titles in the
 * profile's genres and score them. Lets a freshly-onboarded profile (e.g. the
 * Scott preset) get real, poster-backed suggestions immediately.
 */
async function coldStartFromProfile(
  personal: PersonalContext,
  region: string,
  exclude: Set<string>,
): Promise<Recommendation[]> {
  const genres = genresFromRules(personal);
  const [movies, shows] = await Promise.all([
    discoverByGenres('movie', genres.movie, region).catch(() => []),
    discoverByGenres('tv', genres.tv, region).catch(() => []),
  ]);

  const seen = new Set<string>();
  const pool = [...movies, ...shows].filter((d) => {
    const key = `${d.mediaType}-${d.id}`;
    if (!d.posterPath || exclude.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (pool.length === 0) return [];

  const scored = await Promise.all(
    pool
      .slice(0, CANDIDATES_TO_SCORE)
      .map((d) => scoreCandidate(d.id, d.mediaType, d.posterPath, region, personal, null)),
  );
  return finalize(scored);
}
