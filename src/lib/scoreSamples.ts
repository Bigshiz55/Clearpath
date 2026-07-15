import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MediaType } from '@/lib/types';
import { getScoringData } from '@/lib/titleData';
import { standardReadings } from '@/lib/scoring/general';
import type { SourceReading } from '@/lib/scoring/standardScore';
import type { CalibrationSample } from '@/lib/scoring/calibrateStandardScore';

/** True when migration 0012 hasn't been applied yet. */
function missingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42P01' || /score_samples/.test(err.message ?? '');
}

// Infinity doesn't survive JSON, so editorial (countless) sources are stored as
// -1 and read back as Infinity.
function encodeReadings(readings: SourceReading[]): { key: string; value: number; sampleSize: number }[] {
  return readings.map((r) => ({ key: r.key, value: r.value, sampleSize: Number.isFinite(r.sampleSize) ? r.sampleSize : -1 }));
}
function decodeReadings(raw: unknown): SourceReading[] {
  if (!Array.isArray(raw)) return [];
  const out: SourceReading[] = [];
  for (const r of raw as { key?: string; value?: number; sampleSize?: number }[]) {
    if (!r || typeof r.value !== 'number') continue;
    const key = r.key as SourceReading['key'];
    if (key !== 'tmdbAudience' && key !== 'imdb' && key !== 'rottenTomatoes' && key !== 'metacritic') continue;
    out.push({ key, value: r.value, sampleSize: r.sampleSize != null && r.sampleSize >= 0 ? r.sampleSize : Number.POSITIVE_INFINITY });
  }
  return out;
}

/**
 * Snapshot the title's rating-source readings paired with the user's rating —
 * one training row for the calibration brain. Best-effort and self-contained: a
 * failure (or a pre-migration DB) never affects the rating that triggered it.
 */
export async function recordScoreSample(
  supabase: SupabaseClient,
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
  region: string,
  rating: number,
): Promise<void> {
  try {
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) return;
    const { meta } = await getScoringData(mediaType, tmdbId, region);
    const readings = standardReadings(meta);
    if (readings.length === 0) return; // no signal worth training on
    await supabase.from('score_samples').upsert(
      {
        user_id: userId,
        tmdb_id: tmdbId,
        media_type: mediaType,
        readings: encodeReadings(readings),
        rating,
      },
      { onConflict: 'user_id,tmdb_id,media_type' },
    );
  } catch {
    /* calibration is best-effort; never break the rating path */
  }
}

export interface SampleStats {
  total: number;
  liked: number;
  withCritics: number;
}

/**
 * Read every training row (admin/service-role client) into the calibrator's
 * shape. `liked` = rating ≥ the threshold (default 7/10).
 */
export async function collectCalibrationSamples(
  adminClient: SupabaseClient,
  likedThreshold = 7,
): Promise<{ samples: CalibrationSample[]; stats: SampleStats } | { error: string }> {
  const { data, error } = await adminClient
    .from('score_samples')
    .select('readings, rating')
    .limit(50000);
  if (error) {
    if (missingTable(error)) return { error: 'Migration 0012 (score_samples) isn’t applied yet.' };
    return { error: error.message };
  }

  const samples: CalibrationSample[] = [];
  let liked = 0;
  let withCritics = 0;
  for (const row of (data ?? []) as { readings: unknown; rating: number }[]) {
    const readings = decodeReadings(row.readings);
    if (readings.length === 0) continue;
    const isLiked = row.rating >= likedThreshold;
    if (isLiked) liked++;
    if (readings.some((r) => r.key !== 'tmdbAudience')) withCritics++;
    samples.push({ readings, liked: isLiked });
  }
  return { samples, stats: { total: samples.length, liked, withCritics } };
}
