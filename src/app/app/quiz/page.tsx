import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { QuizModes } from '@/components/QuizModes';
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Complete My Case File · WatchVerdict',
};

export default async function QuizPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let totalRated = 0;
  if (user) {
    const { count } = await supabase
      .from('watchlist_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('rating', 'is', null);
    totalRated = count ?? 0;
  }

  const { t } = getServerI18n();

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">{t('ask.qp.heading')}</h1>
      <p className="mt-2 text-sm text-slate-400">
        {t('ask.qp.introBefore')}<span className="font-semibold text-emerald-200">{t('ask.yes')}</span>{t('ask.qp.listSep')}
        <span className="font-semibold text-red-200">{t('ask.no')}</span>{t('ask.qp.listSep')}<span className="font-semibold text-amber-200">{t('ask.maybe')}</span>{t('ask.qp.introEnd')}
      </p>
      <QuizModes totalRated={totalRated} />
    </div>
  );
}
