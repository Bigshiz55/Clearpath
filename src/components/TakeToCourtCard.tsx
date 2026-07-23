'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useT } from '@/i18n/I18nProvider';

/**
 * The headline group-decision entry: "Can't decide? Take it to court." Starts a
 * Live Taste Court — friends join from their own phones, each one's real taste
 * syncs in, and the judge returns one verdict the whole room is happy with.
 */
export function TakeToCourtCard({ className = '' }: { className?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('court_create', { p_media_type: 'any' });
    if (error) {
      setLoading(false);
      setError(error.code === '42P01' ? t('together.liveCourtSetupNeeded') : error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const code = row?.code as string;
    const token = row?.host_token as string;
    if (!code) {
      setLoading(false);
      setError(t('together.couldNotCreateCourtroom'));
      return;
    }
    try {
      localStorage.setItem(`court_host_${code}`, token);
    } catch {
      /* ignore */
    }
    router.push(`/court/${code}`);
  }

  return (
    <section className={`overflow-hidden rounded-2xl border border-gold-400/30 bg-gradient-to-br from-gold-500/10 to-brand-500/10 p-6 ${className}`}>
      <div className="flex items-start gap-4">
        <span className="text-5xl" aria-hidden>⚖️</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-black leading-tight text-white sm:text-3xl">
            {t('together.takeCardHeadline')}{' '}
            <span className="bg-gradient-to-r from-gold-300 to-brand-300 bg-clip-text text-transparent">{t('together.takeCardHeadlineEm')}</span>
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-200">
            {t('together.takeCardP1')}<span className="font-semibold text-white">{t('together.takeCardQr')}</span>{t('together.takeCardP2')}{' '}
            <span className="font-semibold text-white">{t('together.takeCardP3')}</span>
          </p>

          <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-300">
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1">📱 {t('together.chipScanQr')}</span>
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1">🙋 {t('together.chipEveryoneVotes')}</span>
            <span className="rounded-full border border-white/12 bg-white/5 px-3 py-1">⚖️ {t('together.chipOneVerdict')}</span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={start} disabled={loading} className="btn-primary px-6 py-3 text-lg disabled:opacity-60">
              {loading ? t('together.openingCourtroom') : `⚖️ ${t('together.takeThemToCourtBtn')}`}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        </div>
      </div>
    </section>
  );
}
