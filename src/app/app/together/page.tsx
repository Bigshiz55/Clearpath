import type { Metadata } from 'next';
import { CloudCrews } from '@/components/CloudCrews';
import { TogetherPlanner } from '@/components/TogetherPlanner';
import { StartLiveCourt } from '@/components/StartLiveCourt';
import { JudgeBench } from '@/components/JudgeBench';
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Tonight, Together · WatchVerdict',
};

export default async function TogetherPage() {
  const { t } = getServerI18n();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">👪 {t('together.pageTitle')}</h1>
      <p className="mt-2 text-sm text-slate-400">
        {t('together.subtitleBefore')}<em>{t('together.subtitleEveryone')}</em>{t('together.subtitleAfter')}
      </p>

      <div className="mt-5">
        <JudgeBench
          big
          nowPresiding={t('together.bench.nowPresiding')}
          judgeName={t('together.bench.judgeName')}
          blurb={t('together.bench.blurb')}
          blurbEm={t('together.bench.blurbEm')}
        />
      </div>

      <section className="mt-6 rounded-2xl border border-brand-400/30 bg-brand-500/10 p-4">
        <h2 className="text-sm font-bold text-white">⚖️ {t('together.liveTasteCourt')}</h2>
        <p className="mt-1 text-xs text-slate-300">
          {t('together.liveCourtBlurb')}
        </p>
        <div className="mt-3">
          <StartLiveCourt />
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-brand-300">{t('together.syncedJuries')}</h2>
        <p className="mt-1 text-xs text-slate-400">
          {t('together.syncedJuriesBlurb')}
        </p>
        <div className="mt-3">
          <CloudCrews />
        </div>
      </section>

      <section className="mt-8 border-t border-white/10 pt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">{t('together.onThisDevice')}</h2>
        <p className="mt-1 text-xs text-slate-500">{t('together.onThisDeviceBlurb')}</p>
        <TogetherPlanner />
      </section>
    </div>
  );
}
