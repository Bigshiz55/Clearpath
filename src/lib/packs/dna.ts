import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCachedDimensions, getUserDimensionProfile } from '@/lib/titleDimensions';
import { dimensionMatch, profileConfidence, topDials } from '@/lib/scoring/dimensions';
import type { MediaType } from '@/lib/types';

export interface PackDnaScore {
  score: number;
  /** The strongest matching or clashing dial, for a one-line "why". */
  reason: string;
}

/**
 * Pack DNA — reuses the SAME 15-axis dimension engine and cache as the rest
 * of the app (title_dimensions), per the architecture rule that Pack content
 * gets scored against the existing taste system rather than a new one.
 *
 * Deliberately CACHE-ONLY: this never triggers a live OpenAI classification
 * call from a Pack listing page (which can show dozens of titles at once) —
 * it only reads whatever's already cached from elsewhere in the app (a title
 * page view, a rating, etc.). A title with no cached fingerprint yet simply
 * has no score here, honestly, rather than paying for a burst of
 * classification calls on every Pack page load.
 */
export async function getPackDnaScores(
  supabase: SupabaseClient,
  userId: string | null,
  titles: { tmdbId: number; mediaType: MediaType }[],
): Promise<Map<number, PackDnaScore>> {
  const out = new Map<number, PackDnaScore>();
  if (!userId || titles.length === 0) return out;

  const profile = await getUserDimensionProfile(supabase, userId, 400).catch(() => null);
  if (!profile || profileConfidence(profile) < 15) return out; // not enough learned taste to score against yet

  const dimsByKey = await getCachedDimensions(titles.map((t) => ({ tmdb_id: t.tmdbId, media_type: t.mediaType })));

  for (const t of titles) {
    const dims = dimsByKey.get(`${t.mediaType}-${t.tmdbId}`);
    if (!dims) continue;
    const score = dimensionMatch(dims, profile);
    const dials = topDials(profile, 1);
    const reason = dials[0] ? `Matches your lean toward ${dials[0].lean}` : 'Matches your taste profile';
    out.set(t.tmdbId, { score, reason });
  }

  return out;
}

/**
 * Best-effort resolution of a Pack programme to a real TMDB id, by title +
 * year search — imperfect (no exact-id source exists for TVmaze schedule
 * content), cached once resolved so it's a one-time cost per programme.
 * Returns null (never guesses) when nothing plausible matches.
 */
export async function resolveProgrammeTmdbId(
  supabase: SupabaseClient,
  programmeId: string,
): Promise<{ tmdbId: number; mediaType: MediaType } | null> {
  const { data: existing } = await supabase
    .from('tv_programmes')
    .select('tmdb_id, tmdb_media_type, title, release_year')
    .eq('id', programmeId)
    .maybeSingle();
  if (!existing) return null;
  if (existing.tmdb_id && existing.tmdb_media_type) {
    return { tmdbId: existing.tmdb_id as number, mediaType: existing.tmdb_media_type as MediaType };
  }

  const { searchTitles } = await import('@/lib/tmdb/client');
  const results = await searchTitles(existing.title as string).catch(() => []);
  const year = existing.release_year as number | null;
  const best = year
    ? results.find((r) => r.year === year) ?? results.find((r) => r.year != null && Math.abs(r.year - year) <= 1)
    : results[0];
  if (!best) return null;

  const admin = createAdminClient();
  await admin.from('tv_programmes').update({ tmdb_id: best.id, tmdb_media_type: best.mediaType }).eq('id', programmeId);

  return { tmdbId: best.id, mediaType: best.mediaType };
}
