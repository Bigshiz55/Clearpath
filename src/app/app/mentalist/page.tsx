import type { Metadata } from 'next';
import { Mentalist } from '@/components/Mentalist';
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Build Your Case · WatchVerdict' };

export default function MentalistPage() {
  const { t } = getServerI18n();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">{t('ask.mp.heading')}</h1>
      <p className="mt-2 text-sm text-slate-300">
        {t('ask.mp.intro')}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">{t('ask.mp.powered')}</p>
      <div className="mt-6">
        <Mentalist />
      </div>
    </div>
  );
}
