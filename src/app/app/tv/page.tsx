import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getProfile, regionFor } from '@/lib/profile';
import { getOnTvToday } from '@/lib/onTv';
import { OnTvGuide } from '@/components/OnTvGuide';

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
  const airings = await getOnTvToday(region, date);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">📺 On TV today</h1>
        <p className="mt-2 text-sm text-slate-300">
          Live broadcast listings for {region} — what’s on, which channel, and when. Filter to prime time or a
          channel, sort by rating, and hit <span className="font-semibold text-white">Remind me</span> to drop it
          on your calendar so you can record it or tune in.
        </p>
      </section>

      <OnTvGuide airings={airings} dateLabel={friendlyDate(now)} country={region} />

      <p className="text-[11px] text-slate-500">
        Listings from TVmaze’s community broadcast guide — real schedules, refreshed hourly. Coverage is best for
        major {region} networks; we never invent a listing, so a channel with no data simply won’t appear.
      </p>
    </div>
  );
}
