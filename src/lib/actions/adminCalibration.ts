'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/admin';
import { collectCalibrationSamples } from '@/lib/scoreSamples';
import { fitWeights, precisionAtK } from '@/lib/scoring/calibrateStandardScore';
import { STANDARD_WEIGHTS } from '@/lib/scoring/standardWeights';
import type { StandardWeights } from '@/lib/scoring/standardScore';

export type CalibrationReport =
  | {
      ok: true;
      sampleSize: number;
      liked: number;
      withCritics: number;
      trainSize: number;
      testSize: number;
      fitted: StandardWeights;
      hitRate: number; // fitted weights on held-out test
      baseline: number; // uniform weights on held-out test
      currentWeights: StandardWeights;
      currentHitRate: number; // shipped weights on the full set (reference)
    }
  | { ok: false; error: string };

/**
 * Fit the Standard Score weights to real rating outcomes and report the honest
 * hit-rate. Admin-only; reads across users via the service role. Never mutates
 * the live weights — a human promotes the result into standardWeights.ts.
 */
export async function runCalibration(): Promise<CalibrationReport> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return { ok: false, error: 'Not authorized.' };

  const admin = createAdminClient();
  const collected = await collectCalibrationSamples(admin);
  if ('error' in collected) return { ok: false, error: collected.error };

  const { samples, stats } = collected;
  if (samples.length < 10) {
    return { ok: false, error: `Only ${samples.length} training rows so far. Rate more titles (≈10+ needed) before the fit means anything.` };
  }

  const res = fitWeights(samples);
  return {
    ok: true,
    sampleSize: stats.total,
    liked: stats.liked,
    withCritics: stats.withCritics,
    trainSize: res.trainSize,
    testSize: res.testSize,
    fitted: res.weights,
    hitRate: res.hitRate,
    baseline: res.baseline,
    currentWeights: STANDARD_WEIGHTS,
    currentHitRate: precisionAtK(samples, STANDARD_WEIGHTS),
  };
}
