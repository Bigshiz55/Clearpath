import type { Metadata } from 'next';
import { AskTheJudge } from '@/components/AskTheJudge';
import { TakeToCourtCard } from '@/components/TakeToCourtCard';
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ask the Judge · WatchVerdict' };

export default async function AskPage({ searchParams }: { searchParams: { q?: string } }) {
  const seed = typeof searchParams.q === 'string' ? searchParams.q.slice(0, 300) : null;
  const { t } = getServerI18n();

  return (
    <div className="mx-auto max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{t('ask.page.heading')}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {t('ask.page.intro')}
        </p>
      </div>
      <div className="mt-5">
        <AskTheJudge seedQuery={seed} />
      </div>

      <div className="mt-6">
        <TakeToCourtCard />
      </div>
    </div>
  );
}
