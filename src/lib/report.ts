import 'server-only';
import type { MediaType, VerdictReport } from '@/lib/types';
import { buildVerdict } from '@/lib/scoring';
import { createClient } from '@/lib/supabase/server';
import { getProfile, getPersonalContext, regionFor } from '@/lib/profile';
import { enhanceOneLiner } from '@/lib/ai';
import { getSharedTitleData } from '@/lib/titleData';
import type { Briefing } from '@/lib/briefing';

export interface ReportResult {
  report: VerdictReport;
  region: string;
  /** The Dossier, hydrated from the shared cache — so the page doesn't refetch. */
  briefing: Briefing;
}

/**
 * Build a full verdict report for the current user and persist it to their
 * verdict history (best-effort). The expensive, user-agnostic hydration
 * (metadata, ratings, providers, franchise, similar, dossier) comes from a
 * shared 12h cache; only the deterministic personal scoring runs per user.
 * Throws TmdbError/ConfigError on data problems so callers can render precisely.
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

  // One cached hydration serves every user who opens this title.
  const { meta, providers, collectionId, similar, briefing } = await getSharedTitleData(mediaType, id, region);

  // Per-user scoring layer (cheap, deterministic, not cached).
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

  return { report, region, briefing };
}
