'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getRecommendations } from '@/lib/recommend';
import { tmdbImage } from '@/lib/tmdb/image';
import { recordImpressions, recordOutcome } from '@/lib/reco/store';
import { ALGO_VERSION, type OutcomeKind } from '@/lib/reco/accuracy';
import { confidenceOf, cohortOf } from '@/lib/reco/experiments';
import { loadDnaConfidence } from '@/lib/preference/dnaSignals';

/**
 * REFRESH RECOMMENDATIONS (PART 7) + recommendation VALIDATION (PART 9).
 *
 * A refresh NEVER touches the user's DNA — it re-ranks from the SAME learned
 * profile, skips titles already shown this run (no duplicates), and logs every
 * title it surfaces as an IMPRESSION carrying the DNA snapshot, algorithm
 * version, predicted score, confidence and reasoning. Every reaction is logged
 * as an OUTCOME. All logging is fail-open (a missing 0024 table never breaks the
 * slate). Deterministic engine untouched — this only reads its output.
 */

export interface SlateItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  predicted: number;
  confidence: 'low' | 'medium' | 'high';
  because: string | null;
  matchReason: string | null;
}

const slateSchema = z.object({
  surface: z.string().max(40).default('refresh'),
  sessionId: z.string().max(80).optional(),
  /** Keys ("movie:603") already shown this run — excluded so refresh has no dupes. */
  excludeKeys: z.array(z.string().max(40)).max(400).default([]),
  limit: z.number().int().min(1).max(40).default(12),
});

export async function buildRecommendationSlate(
  input: z.infer<typeof slateSchema>,
): Promise<{ ok: boolean; items: SlateItem[]; algoVersion: string; dnaConfidence: number; error?: string }> {
  const parsed = slateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, items: [], algoVersion: ALGO_VERSION, dnaConfidence: 0, error: 'Invalid input.' };
  const { surface, sessionId, excludeKeys, limit } = parsed.data;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, items: [], algoVersion: ALGO_VERSION, dnaConfidence: 0, error: 'Not signed in.' };

  // DNA snapshot (compact, serializable) — the state used to produce this slate.
  const { tally, confidence: confResult } = await loadDnaConfidence(supabase, user.id, sessionId ? { sessionId } : {});
  const confidencePct = confResult.percent;
  const ratedCount = tally.calibrationAnswers + tally.ratings + tally.watched;
  const cohort = cohortOf(ratedCount);

  // Pull a generous pool so we can skip what's already been shown and still fill.
  const pool = await getRecommendations(supabase, user.id, { limit: limit + excludeKeys.length + 12 }).catch(() => []);
  const skip = new Set(excludeKeys);
  const fresh = pool.filter((r) => !skip.has(`${r.mediaType}:${r.id}`)).slice(0, limit);

  const items: SlateItem[] = fresh.map((r) => ({
    id: r.id,
    mediaType: r.mediaType,
    title: r.title,
    year: r.year,
    posterUrl: tmdbImage(r.posterPath, 'w342'),
    predicted: r.personalScore,
    confidence: confidenceOf(r.personalScore),
    because: r.because,
    matchReason: r.matchReason,
  }));

  // Log impressions with the DNA snapshot + reasoning (fail-open).
  await recordImpressions(
    supabase,
    user.id,
    items.map((it) => ({
      tmdbId: it.id,
      mediaType: it.mediaType,
      surface,
      predicted: it.predicted,
      confidence: it.confidence,
      reasoning: { because: it.because, matchReason: it.matchReason },
      dnaSnapshot: { confidence: confidencePct, tally },
      cohort,
      sessionId,
    })),
  ).catch(() => 0);

  return { ok: true, items, algoVersion: ALGO_VERSION, dnaConfidence: confidencePct };
}

const outcomeSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
  kind: z.enum(['watched', 'saved', 'skipped', 'dismissed', 'corrected', 'rated_up', 'rated_down']),
  predicted: z.number().min(0).max(100).optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  sessionId: z.string().max(80).optional(),
});

/** Record what the user did with a recommendation (feeds accuracy + confidence). */
export async function recordRecommendationOutcome(input: z.infer<typeof outcomeSchema>): Promise<{ ok: boolean }> {
  const parsed = outcomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const a = parsed.data;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const ok = await recordOutcome(supabase, user.id, {
    tmdbId: a.tmdbId,
    mediaType: a.mediaType,
    kind: a.kind as OutcomeKind,
    predicted: a.predicted,
    confidence: a.confidence,
    sessionId: a.sessionId,
  });
  return { ok };
}
