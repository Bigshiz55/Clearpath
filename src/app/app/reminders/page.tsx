import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { MyReminders, type ReminderRow } from '@/components/MyReminders';
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My reminders · WatchVerdict' };

export default async function RemindersPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let upcoming: ReminderRow[] = [];
  if (user) {
    const { data } = await supabase
      .from('tv_reminders')
      .select('airing_id, show_name, network, airstamp')
      .eq('user_id', user.id)
      .order('airstamp', { ascending: true });
    upcoming = (data ?? [])
      .filter((r) => Date.parse(r.airstamp as string) >= Date.now())
      .map((r) => ({
        airingId: r.airing_id as number,
        showName: r.show_name as string,
        network: (r.network as string | null) ?? null,
        airstamp: r.airstamp as string,
      }));
  }

  const { t } = getServerI18n();

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">🔔 {t('account.reminders.heading')}</h1>
        <p className="mt-2 text-sm text-slate-300">
          {t('account.reminders.subtitle')}
        </p>
      </section>

      {upcoming.length > 0 ? (
        <MyReminders initial={upcoming} />
      ) : (
        <div className="card p-8 text-center">
          <div className="text-3xl">📺</div>
          <h2 className="mt-3 text-lg font-semibold text-white">{t('account.reminders.emptyTitle')}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            {t('account.reminders.emptyBody1')} <span className="font-semibold text-white">🔔 {t('account.reminders.remindMe')}</span> {t('account.reminders.emptyBody2')}
          </p>
          <Link href="/app/tv" className="btn-primary mt-4 inline-flex">{t('account.reminders.browseTv')}</Link>
        </div>
      )}
    </div>
  );
}
