import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { MyReminders, type ReminderRow } from '@/components/MyReminders';

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

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">🔔 My reminders</h1>
        <p className="mt-2 text-sm text-slate-300">
          Live-TV shows you asked to be reminded about. We’ll send a phone/PC notification 1 hour and 5 minutes before
          each one airs.
        </p>
      </section>

      {upcoming.length > 0 ? (
        <MyReminders initial={upcoming} />
      ) : (
        <div className="card p-8 text-center">
          <div className="text-3xl">📺</div>
          <h2 className="mt-3 text-lg font-semibold text-white">No reminders yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            Find something on live TV and tap <span className="font-semibold text-white">🔔 Remind me</span> — it’ll show
            up here, and we’ll ping you before it starts.
          </p>
          <Link href="/app/tv" className="btn-primary mt-4 inline-flex">Browse On TV →</Link>
        </div>
      )}
    </div>
  );
}
