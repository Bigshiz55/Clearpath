import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/admin';
import { STANDARD_WEIGHTS_META } from '@/lib/scoring/standardWeights';
import { CalibrationAdmin, RerankerAdmin } from '@/components/admin/CalibrationAdmin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Score Calibration · Admin' };

export default async function CalibrationPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">⚖️ Standard Score calibration</h1>
      <p className="mt-2 text-sm text-slate-400">
        Fits the rating-source weights to real user ratings and reports how often the blend puts genuinely-liked
        titles on top (precision@K), against a uniform baseline. It never changes a live score — you promote the
        fitted weights by editing the code.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Currently shipped: <span className="text-slate-300">{STANDARD_WEIGHTS_META.version}</span>
        {STANDARD_WEIGHTS_META.trainedAt ? ` · trained ${STANDARD_WEIGHTS_META.trainedAt}` : ' · not yet calibrated'}
        {STANDARD_WEIGHTS_META.hitRate != null ? ` · hit-rate ${Math.round(STANDARD_WEIGHTS_META.hitRate * 100)}%` : ''}
      </p>
      <CalibrationAdmin />
      <RerankerAdmin />
    </div>
  );
}
