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

/** Every column the matcher needs to be honest about what it is matching. */
export const PROGRAMME_MATCH_COLUMNS =
  'id, tmdb_id, tmdb_media_type, title, release_year, programme_type, season_number, episode_number';

export interface ProgrammeMatchRow {
  id: string;
  tmdb_id: number | null;
  tmdb_media_type: 'movie' | 'tv' | null;
  title: string;
  release_year: number | null;
  programme_type: string | null;
  season_number: number | null;
  episode_number: number | null;
}

/**
 * Resolve one programme row to a real TMDB id, or refuse.
 *
 * ── WHAT THIS USED TO DO ──────────────────────────────────────────────────
 * `const best = year ? results.find(...) : results[0]` — and since neither
 * ingest writer populates `release_year`, the `results[0]` branch is the only
 * one that ever ran. Every match was TMDB's popularity ordering for a title
 * string, written permanently onto the row as `tmdb_id` and `tmdb_media_type`.
 * A wrong media type is worse than a missing one: the Vault's null check fails
 * closed, and a wrong 'movie' fails open.
 *
 * Now the candidate list goes through `pickMatch`, which requires an exact
 * normalized title and an unambiguous winner, and the provider's own
 * `programme_type` narrows the search to the right kind before ranking. It
 * returns null far more often, which is the point.
 */
export async function matchProgrammeRow(
  row: ProgrammeMatchRow,
): Promise<{ tmdbId: number; mediaType: MediaType; basis: string } | null> {
  const { searchTitles } = await import('@/lib/tmdb/client');
  const { pickMatch } = await import('./tmdbMatch');
  const { expectedTmdbMediaType } = await import('./mediaKind');

  const expected = expectedTmdbMediaType({
    programmeType: row.programme_type,
    seasonNumber: row.season_number,
    episodeNumber: row.episode_number,
  });

  const results = await searchTitles(row.title, { year: row.release_year }).catch(() => []);
  const match = pickMatch(
    { title: row.title, releaseYear: row.release_year, expectedMediaType: expected },
    results.map((r) => ({ id: r.id, mediaType: r.mediaType, title: r.title, year: r.year })),
  );
  if (!match) return null;
  return { tmdbId: match.id, mediaType: match.mediaType, basis: match.basis };
}

/**
 * The on-demand path: resolve a single programme, persisting the result so it
 * is a one-time cost. Returns null (never guesses) when nothing matches
 * unambiguously.
 */
export async function resolveProgrammeTmdbId(
  supabase: SupabaseClient,
  programmeId: string,
): Promise<{ tmdbId: number; mediaType: MediaType } | null> {
  const { data: existing } = await supabase
    .from('tv_programmes')
    .select(PROGRAMME_MATCH_COLUMNS)
    .eq('id', programmeId)
    .maybeSingle();
  if (!existing) return null;
  const row = existing as unknown as ProgrammeMatchRow;
  if (row.tmdb_id && row.tmdb_media_type) {
    return { tmdbId: row.tmdb_id, mediaType: row.tmdb_media_type as MediaType };
  }

  const match = await matchProgrammeRow(row);
  if (!match) return null;

  const admin = createAdminClient();
  await admin
    .from('tv_programmes')
    .update({ tmdb_id: match.tmdbId, tmdb_media_type: match.mediaType })
    .eq('id', programmeId);

  return { tmdbId: match.tmdbId, mediaType: match.mediaType };
}
