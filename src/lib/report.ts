import 'server-only';
import type { MediaType, VerdictReport } from '@/lib/types';
import { getTitle, getWatchProviders, getCollectionId, getSimilar } from '@/lib/tmdb/client';
import { buildVerdict } from '@/lib/scoring';
import { createClient } from '@/lib/supabase/server';
import { getProfile, getPersonalContext, regionFor } from '@/lib/profile';
import { enhanceOneLiner } from '@/lib/ai';
import { getCriticRatings } from '@/lib/omdb';

export interface ReportResult {
  report: VerdictReport;
  region: string;
}

/**
 * Build a full verdict report for the current user and persist it to their
 * verdict history (best-effort). Throws TmdbError/ConfigError on data problems
 * so callers can render a precise error.
 */
export async function buildReportForCurrentUser(
  mediaType: MediaType,
  id: number,
): Promise<ReportResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('UNAUTHENTICATED');

  const profile = await getProfile(supabase, user.id);
  const region = regionFor(profile);

  // Fetch metadata + providers + franchise + similar in parallel.
  const [meta, providers, collectionId, similar] = await Promise.all([
    getTitle(mediaType, id, region),
    getWatchProviders(mediaType, id, region).catch(() => null),
    getCollectionId(mediaType, id).catch(() => null),
    getSimilar(mediaType, id).catch(() => []),
  ]);

  // Enrich with critic aggregator ratings (optional OMDb; graceful when absent).
  const critics = await getCriticRatings(meta.imdbId).catch(() => null);
  if (critics) {
    meta.imdbRating = critics.imdbRating;
    meta.rottenTomatoes = critics.rottenTomatoes;
    meta.metascore = critics.metascore;
  }

  const personal = await getPersonalContext(supabase, user.id, collectionId);
  const report = buildVerdict({ meta, providers, personal, similar });

  // Optional AI prose (no-op unless OPENAI_API_KEY is set). Never alters scores.
  try {
    report.oneLiner = await enhanceOneLiner(report);
  } catch {
    /* deterministic one-liner already in place */
  }

  // Persist to history (best-effort; never blocks the page).
  try {
    await supabase.from('verdicts').upsert(
      {
        user_id: user.id,
        tmdb_id: meta.id,
        media_type: mediaType,
        title: meta.title,
        year: meta.year,
        poster_path: meta.posterPath,
        general_score: report.general.score,
        personal_score: report.personal.score,
        tier: report.tier,
        disposition: report.watchlistDisposition,
        report: report as unknown as Record<string, unknown>,
      },
      { onConflict: 'user_id,tmdb_id,media_type' },
    );
  } catch {
    /* history persistence is non-critical */
  }

  return { report, region };
}
