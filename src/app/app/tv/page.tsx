import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getProfile, regionFor } from '@/lib/profile';
import { getOnTvToday, getStreamingToday } from '@/lib/onTv';
import { OnTvTabs } from '@/components/OnTvTabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'On TV today · WatchVerdict' };

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function friendlyDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default async function OnTvPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const region = regionFor(user ? await getProfile(supabase, user.id) : null);

  const now = new Date();
  const date = isoDate(now);
  const [airings, streaming] = await Promise.all([getOnTvToday(region, date), getStreamingToday(date)]);

  // Which airings this user already has a reminder for (guarded pre-migration).
  let remindedIds: number[] = [];
  if (user) {
    const { data } = await supabase.from('tv_reminders').select('airing_id').eq('user_id', user.id);
    remindedIds = (data ?? []).map((r) => r.airing_id as number);
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">📺 On TV today</h1>
        <p className="mt-2 text-sm text-slate-300">
          What’s on live in {region} and what just dropped on streaming — channel, time, and rating. Filter to prime
          time or a platform, sort by rating, and hit <span className="font-semibold text-white">Remind me</span> to get
          a phone/PC notification <span className="font-semibold text-white">1 hour and 5 minutes before</span> it airs.
        </p>
      </section>

      <OnTvTabs broadcast={airings} streaming={streaming} dateLabel={friendlyDate(now)} country={region} remindedIds={remindedIds} />

      <p className="text-[11px] text-slate-500">
        Listings from TVmaze’s community broadcast guide — real schedules, refreshed hourly. Coverage is best for
        major {region} networks; we never invent a listing, so a channel with no data simply won’t appear.
      </p>
    </div>
  );
}
