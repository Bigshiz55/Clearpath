import type { Metadata } from 'next';
import { ImportForm } from '@/components/ImportForm';
import { getServerI18n } from '@/i18n/server';

export const metadata: Metadata = {
  title: 'Import your history · WatchVerdict',
};

export default function ImportPage() {
  const { t } = getServerI18n();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">{t('misc.importPage.heading')}</h1>
      <p className="mt-2 text-sm text-slate-400">
        {t('misc.importPage.intro1')} <span className="text-slate-200">{t('misc.importPage.csvExport')}</span> {t('misc.importPage.intro2')}
      </p>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-xs leading-relaxed text-slate-400">
        <span className="text-slate-300">{t('misc.importPage.worksWith')}</span> Letterboxd, Trakt, Simkl, TV Time, Netflix {t('misc.importPage.worksWithRest')}
        <div className="mt-2 text-slate-300">{t('misc.importPage.orJustPaste')}</div>
        Prisoners (2013) - 9
        <br />
        Mare of Easttown 9
        <br />
        The Fall
      </div>

      <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-xs text-amber-100">
        <span className="font-semibold">{t('misc.importPage.tvTimeRefugee')}</span> {t('misc.importPage.zipHint1')} <code className="rounded bg-black/30 px-1">.zip</code>{t('misc.importPage.zipHint2')} <code className="rounded bg-black/30 px-1">.csv</code> {t('misc.importPage.zipHint3')}
      </div>

      <ImportForm />
    </div>
  );
}
