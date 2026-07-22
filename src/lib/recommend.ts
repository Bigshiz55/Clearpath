import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType, PrimaryCall, TitleMetadata, VerdictTier } from '@/lib/types';
import { getSimilar, discoverByGenres } from '@/lib/tmdb/client';
import { getScoringData } from '@/lib/titleData';
import { buildVerdict } from '@/lib/scoring';
import type { PersonalContext } from '@/lib/scoring/personal';
import { getProfile, getPersonalContext, regionFor } from '@/lib/profile';
import { tileRatingsFromScore, type TileRatings } from '@/lib/ratings';
import { genreIdFromName } from '@/lib/finderGenres';
import { NO_FILTERS, hasFilters, type RecFilters } from '@/lib/recFeedback';

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
// How many low-rated titles seed the "avoid" signal, and how hard a candidate is
// penalized for each disliked title it's similar to. Keeps us from recommending
// neighbors of things the user has already told us they don't like.
const PAN_SEEDS = 6;
const DISLIKE_PENALTY = 1.5;

/** Tuning knobs for a recommendation build. Defaults reproduce the original
 *  hub behavior; the Taste Quiz reveal asks for a much larger, broader set. */
export interface RecommendOptions {
  /** Results to return. */
  limit?: number;
  /** How many top-rated titles to seed "more like this" from. */
  seedLimit?: number;
  /** How many aggregated candidates to run through the deterministic engine. */
  candidatePool?: number;
  /** Minimum personal fit score to surface (0 keeps everything scorable). */
  minScore?: number;
  /** Max results attributed to any single seed, so the list stays varied. */
  perSeedCap?: number;
  /** User feedback filters ("no westerns", "newer only") applied on recalculate. */
  filters?: RecFilters;
}

/** Does this title fall foul of the user's feedback filters? (real metadata only) */
function violatesFilters(meta: TitleMetadata, filters: RecFilters): boolean {
  if (filters.mediaType !== 'any' && meta.mediaType !== filters.mediaType) return true;
  if (filters.excludeGenreIds.length > 0) {
    const ids = meta.genres.map((g) => genreIdFromName(g)).filter((n): n is number => n != null);
    if (ids.some((id) => filters.excludeGenreIds.includes(id))) return true;
  }
  if (filters.minYear != null && (meta.year == null || meta.year < filters.minYear)) return true;
  if (filters.maxYear != null && (meta.year == null || meta.year > filters.maxYear)) return true;
  if (filters.maxRuntime != null) {
    const rt = meta.mediaType === 'movie' ? meta.runtimeMinutes : meta.episodeRuntimeMinutes;
    if (rt != null && rt > filters.maxRuntime) return true;
  }
  return false;
}

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
  seedWeight: number; // rating weight of the strongest seed that recommended it
  strength: number; // sum of seed weights (how much of your taste points here)
  penalty: number; // how many disliked titles it's similar to
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
  opts: RecommendOptions = {},
): Promise<Recommendation[]> {
  const limit = opts.limit ?? RESULT_LIMIT;
  const seedLimit = opts.seedLimit ?? SEED_LIMIT;
  const minScore = opts.minScore ?? MIN_SCORE;
  const perSeedCap = opts.perSeedCap ?? limit;
  const filters = opts.filters ?? NO_FILTERS;
  // With feedback filters on, score a wider pool so enough survive the cut.
  const candidatePool = (opts.candidatePool ?? CANDIDATES_TO_SCORE) + (hasFilters(filters) ? 48 : 0);

  const profile = await getProfile(supabase, userId);
  const region = regionFor(profile);
  const personal = await getPersonalContext(supabase, userId, null);

  const [wlAll, verdicts, watchedFavs, watchedPans] = await Promise.all([
    supabase.from('watchlist_items').select('tmdb_id, media_type').eq('user_id', userId),
    supabase.from('verdicts').select('tmdb_id, media_type').eq('user_id', userId),
    supabase
      .from('watchlist_items')
      .select('tmdb_id, media_type, title, rating')
      .eq('user_id', userId)
      .eq('status', 'watched')
      .order('rating', { ascending: false, nullsFirst: false })
      .order('watched_at', { ascending: false })
      .limit(seedLimit * 3),
    // Lowest-rated titles — the "avoid" signal (their neighbors get penalized).
    supabase
      .from('watchlist_items')
      .select('tmdb_id, media_type, title, rating')
      .eq('user_id', userId)
      .not('rating', 'is', null)
      .lte('rating', 4)
      .order('rating', { ascending: true })
      .limit(PAN_SEEDS),
  ]);

  // Never recommend something the user already has on a list or has a verdict for.
  const exclude = new Set<string>();
  for (const r of wlAll.data ?? []) exclude.add(`${r.media_type}-${r.tmdb_id}`);
  for (const r of verdicts.data ?? []) exclude.add(`${r.media_type}-${r.tmdb_id}`);

  // Seeds: prefer titles rated 7+ (a genuine "like"); fall back to any watched.
  const watched = (watchedFavs.data ?? []) as SeedRow[];
  let seeds = watched.filter((s) => (s.rating ?? 0) >= 7).slice(0, seedLimit);
  if (seeds.length === 0) seeds = watched.slice(0, seedLimit);
  // No watch history yet: recommend straight from the taste profile.
  if (seeds.length === 0) return coldStartFromProfile(personal, region, exclude, minScore, limit, filters);

  const pans = (watchedPans.data ?? []) as SeedRow[];

  const [seedResults, panResults] = await Promise.all([
    Promise.all(
      seeds.map(async (s) => ({
        seed: s,
        similar: await getSimilar(s.media_type, s.tmdb_id).catch(() => []),
      })),
    ),
    Promise.all(pans.map((s) => getSimilar(s.media_type, s.tmdb_id).catch(() => []))),
  ]);

  // Dislike signal: how many disliked titles each candidate is "similar to".
  const panCount = new Map<string, number>();
  for (const sim of panResults) {
    for (const t of sim) {
      const k = `${t.mediaType}-${t.id}`;
      panCount.set(k, (panCount.get(k) ?? 0) + 1);
    }
  }

  // Aggregate candidates. A title recommended by titles you rated HIGHER (weight
  // = rating − 5, so a 10/10 pulls ~2.5× a 7/10) and by MORE of your favorites
  // ranks higher; being adjacent to a disliked title pushes it down.
  const candMap = new Map<string, Candidate>();
  for (const { seed, similar } of seedResults) {
    const w = Math.max(1, (seed.rating ?? 7) - 5);
    for (const t of similar) {
      const key = `${t.mediaType}-${t.id}`;
      if (exclude.has(key) || !t.posterPath) continue;
      const existing = candMap.get(key);
      if (existing) {
        existing.strength += w;
        existing.vote = Math.max(existing.vote, t.voteAverage ?? 0);
        if (w > existing.seedWeight) {
          existing.seedWeight = w;
          existing.seedTitle = seed.title; // credit the strongest "because you liked …"
        }
      } else {
        candMap.set(key, {
          id: t.id,
          mediaType: t.mediaType,
          posterPath: t.posterPath,
          seedTitle: seed.title,
          seedWeight: w,
          strength: w,
          penalty: panCount.get(key) ?? 0,
          vote: t.voteAverage ?? 0,
        });
      }
    }
  }

  const candidates = Array.from(candMap.values())
    .map((c) => ({ c, net: c.strength - DISLIKE_PENALTY * c.penalty }))
    .sort((a, b) => b.net - a.net || b.c.vote - a.c.vote)
    .slice(0, candidatePool);
  if (candidates.length === 0) return [];

  const scored = await Promise.all(
    candidates.map(({ c, net }) =>
      scoreCandidate(c.id, c.mediaType, c.posterPath, region, personal, c.seedTitle, filters).then((r) =>
        r ? { r, strength: net } : null,
      ),
    ),
  );

  return finalize(scored, minScore, limit, perSeedCap);
}

/** Fetch a candidate's metadata, score it against the profile, shape the result. */
async function scoreCandidate(
  id: number,
  mediaType: MediaType,
  fallbackPoster: string | null,
  region: string,
  personal: PersonalContext,
  because: string | null,
  filters: RecFilters = NO_FILTERS,
): Promise<Recommendation | null> {
  try {
    const { meta, providers } = await getScoringData(mediaType, id, region);
    if (violatesFilters(meta, filters)) return null; // dropped by the user's feedback
    const report = buildVerdict({ meta, providers, personal });
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

/**
 * Rank and trim the scored candidates. The deterministic personal fit stays the
 * authoritative sort key (recommendation strength is only the tiebreak), then a
 * per-seed cap keeps the list from being dominated by neighbors of one favorite.
 */
function finalize(
  scored: ({ r: Recommendation; strength: number } | null)[],
  minScore: number,
  limit: number,
  perSeedCap: number,
): Recommendation[] {
  const ranked = scored
    .filter((x): x is { r: Recommendation; strength: number } => x !== null && x.r.personalScore >= minScore)
    .sort((a, b) => b.r.personalScore - a.r.personalScore || b.strength - a.strength);

  const perSeed = new Map<string, number>();
  const out: Recommendation[] = [];
  for (const { r } of ranked) {
    const key = r.because ?? '·';
    const n = perSeed.get(key) ?? 0;
    if (n >= perSeedCap) continue; // keep variety — don't over-serve one seed
    perSeed.set(key, n + 1);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
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
  minScore: number,
  limit: number,
  filters: RecFilters = NO_FILTERS,
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
      .slice(0, Math.max(CANDIDATES_TO_SCORE, limit))
      .map((d) =>
        scoreCandidate(d.id, d.mediaType, d.posterPath, region, personal, null, filters).then((r) =>
          r ? { r, strength: 0 } : null,
        ),
      ),
  );
  return finalize(scored, minScore, limit, limit);
}
