'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/admin';
import { collectCalibrationSamples, collectRerankSamples } from '@/lib/scoreSamples';
import { fitWeights, precisionAtK } from '@/lib/scoring/calibrateStandardScore';
import { STANDARD_WEIGHTS } from '@/lib/scoring/standardWeights';
import type { StandardWeights } from '@/lib/scoring/standardScore';
import { fitReranker, type RerankModel } from '@/lib/scoring/reranker';
import { RERANK_MODEL } from '@/lib/scoring/rerankerWeights';

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

export type RerankerReport =
  | {
      ok: true;
      total: number;
      usable: number;
      users: number;
      liked: number;
      trainSize: number;
      testSize: number;
      fitted: RerankModel;
      hitRate: number; // fitted model on held-out test (precision@K)
      baseline: number; // objective-only ranking on the same test
      current: RerankModel; // the shipped model
    }
  | { ok: false; error: string };

/**
 * Fit the learned re-ranker (objective quality + content-fingerprint fit →
 * liked) to real outcomes and report the honest hit-rate vs an objective-only
 * baseline. Admin-only; reads across users via the service role. Never mutates
 * the live model — a human promotes `fitted` into `rerankerWeights.ts` once it
 * clears the baseline on held-out data.
 */
export async function runReranker(): Promise<RerankerReport> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return { ok: false, error: 'Not authorized.' };

  const admin = createAdminClient();
  const collected = await collectRerankSamples(admin);
  if ('error' in collected) return { ok: false, error: collected.error };

  const { samples, stats } = collected;
  if (samples.length < 20) {
    return {
      ok: false,
      error: `Only ${samples.length} usable rows (need ≈20+). Usable rows require the title to be fingerprinted — rate more, and let the classify backfill run.`,
    };
  }

  const fit = fitReranker(samples);
  return {
    ok: true,
    total: stats.total,
    usable: stats.usable,
    users: stats.users,
    liked: stats.liked,
    trainSize: fit.trainSize,
    testSize: fit.testSize,
    fitted: fit.model,
    hitRate: fit.hitRate,
    baseline: fit.baseline,
    current: RERANK_MODEL,
  };
}
