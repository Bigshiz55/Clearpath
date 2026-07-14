import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType, PrimaryCall, VerdictTier } from '@/lib/types';
import { getSimilar, getTitle } from '@/lib/tmdb/client';
import { buildVerdict } from '@/lib/scoring';
import { getProfile, getPersonalContext, regionFor } from '@/lib/profile';

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
  if (seeds.length === 0) return [];

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
    candidates.map(async (c): Promise<Recommendation | null> => {
      try {
        const meta = await getTitle(c.mediaType, c.id, region);
        const report = buildVerdict({ meta, providers: null, personal });
        const topPos = report.personal.adjustments.find((a) => a.points > 0);
        return {
          id: c.id,
          mediaType: c.mediaType,
          title: meta.title,
          year: meta.year,
          posterPath: meta.posterPath ?? c.posterPath,
          personalScore: report.personal.score,
          tier: report.tier,
          primaryCall: report.primaryCall,
          because: c.seedTitle,
          matchReason: topPos ? topPos.label : null,
        };
      } catch {
        return null;
      }
    }),
  );

  return scored
    .filter((r): r is Recommendation => r !== null && r.personalScore >= MIN_SCORE)
    .sort((a, b) => b.personalScore - a.personalScore)
    .slice(0, RESULT_LIMIT);
}
