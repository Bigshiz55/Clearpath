import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PACKS, packSource } from '@/lib/preference/packs';
import { countAnswersBySource, loadDnaConfidence } from '@/lib/preference/dnaSignals';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'DNA boosters · WatchVerdict' };

/**
 * Optional calibration packs. Each booster sharpens DNA Confidence for a
 * category — it never affects onboarding Quiz Progress. We show live per-pack
 * completion so the user knows what's left.
 */
export default async function PacksPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id ?? '';

  const [confidence, counts] = await Promise.all([
    uid ? loadDnaConfidence(supabase, uid).then((r) => r.confidence.percent) : Promise.resolve(0),
    Promise.all(PACKS.map((p) => (uid ? countAnswersBySource(supabase, uid, packSource(p.key)) : Promise.resolve(0)))),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white sm:text-3xl">🎯 DNA boosters</h1>
          <p className="mt-1 text-sm text-slate-400">
            Optional mini-calibrations. Each one sharpens your Watch DNA for a category — they raise your{' '}
            <span className="font-semibold text-emerald-300">DNA Confidence</span>, never your onboarding progress.
          </p>
        </div>
        <div className="flex-none rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-center">
          <div className="text-2xl font-black tabular-nums text-emerald-300">{confidence}%</div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">DNA Confidence</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PACKS.map((p, i) => {
          const done = counts[i] ?? 0;
          const complete = done >= p.size;
          return (
            <Link
              key={p.key}
              href={`/app/dna/packs/${p.key}`}
              className="card flex items-center gap-3 p-4 transition hover:border-white/25"
            >
              <span className="text-2xl" aria-hidden>{p.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-bold text-white">{p.name}</span>
                  {complete && <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-200">Done</span>}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-400">{p.description}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">{done}/{p.size} rated</span>
              </span>
              <span className="flex-none text-brand-300">→</span>
            </Link>
          );
        })}
      </div>

      <Link href="/app/dna" className="inline-flex text-sm font-semibold text-brand-300 hover:text-brand-200">← Back to Watch DNA</Link>
    </div>
  );
}
