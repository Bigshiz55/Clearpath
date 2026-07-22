import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getProfile, regionFor } from '@/lib/profile';
import { getOnTvToday, getUpcomingTv, enrichAiringsWithCritics, enrichAiringsWithTmdb } from '@/lib/onTv';
import { OnTvGuide } from '@/components/OnTvGuide';
import { MyReminders, type ReminderRow } from '@/components/MyReminders';
import { TvDetective } from '@/components/TvDetective';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'On TV today · WatchVerdict' };

const HOUR_MS = 60 * 60 * 1000;

/** Parse ?within=N (hours) into a clamped 1–48h horizon, or null. */
function parseWithin(v: string | string[] | undefined): number | null {
  const raw = Array.isArray(v) ? v[0] : v;
  const n = raw != null ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? Math.max(1, Math.min(48, n)) : null;
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function friendlyDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default async function OnTvPage({
  searchParams,
}: {
  searchParams?: { within?: string | string[]; genre?: string | string[] };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const region = regionFor(user ? await getProfile(supabase, user.id) : null);

  const now = new Date();
  const date = isoDate(now);
  const withinHours = parseWithin(searchParams?.within);
  const genreRaw = Array.isArray(searchParams?.genre) ? searchParams?.genre[0] : searchParams?.genre;
  const genre = genreRaw ? genreRaw.slice(0, 24) : null;

  const airingsRaw = await getOnTvToday(region, date);
  // Add IMDb / Rotten Tomatoes / Metacritic to the placards (cached, bounded).
  const airings = await enrichAiringsWithCritics(airingsRaw).then((a) => enrichAiringsWithTmdb(a));

  // When asked for a specific window ("comedies coming on in the next N hours"),
  // build the real time- and genre-filtered set and enrich it the same way.
  const enrich = (a: Awaited<ReturnType<typeof getUpcomingTv>>) => enrichAiringsWithCritics(a).then(enrichAiringsWithTmdb);
  let windowed =
    withinHours != null
      ? await enrich(await getUpcomingTv(region, now.getTime(), withinHours * HOUR_MS, genre))
      : null;
  // Genre named but nothing in that genre is on in-window — fall back to
  // everything on, labeled honestly, rather than an empty screen.
  let genreEmpty = false;
  if (withinHours != null && genre && windowed && windowed.length === 0) {
    genreEmpty = true;
    windowed = await enrich(await getUpcomingTv(region, now.getTime(), withinHours * HOUR_MS, null));
  }

  // Which airings this user already has a reminder for (guarded pre-migration),
  // plus the upcoming ones to list at the top.
  let remindedIds: number[] = [];
  let upcoming: ReminderRow[] = [];
  if (user) {
    const { data } = await supabase
      .from('tv_reminders')
      .select('airing_id, show_name, network, airstamp')
      .eq('user_id', user.id)
      .order('airstamp', { ascending: true });
    const rows = data ?? [];
    remindedIds = rows.map((r) => r.airing_id as number);
    upcoming = rows
      .filter((r) => Date.parse(r.airstamp as string) >= now.getTime())
      .map((r) => ({ airingId: r.airing_id as number, showName: r.show_name as string, network: (r.network as string | null) ?? null, airstamp: r.airstamp as string }));
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">
          {withinHours != null
            ? `📺 ${genre && !genreEmpty ? `${genre} ` : ''}coming on in the next ${withinHours} hours`
            : '📺 On TV today'}
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          {withinHours != null ? (
            <>
              Real listings for {region} between now and {withinHours} hours from now — channel, time, and rating.
              Hit <span className="font-semibold text-white">Remind me</span> to get pinged{' '}
              <span className="font-semibold text-white">1 hour and 5 minutes before</span> a show starts.
            </>
          ) : (
            <>
              What’s on live in {region} — channel, time, and rating. Filter to prime time, sort by rating, and hit{' '}
              <span className="font-semibold text-white">Remind me</span> to get a phone/PC notification{' '}
              <span className="font-semibold text-white">1 hour and 5 minutes before</span> it airs.
            </>
          )}
        </p>
      </section>

      <TvDetective />

      {upcoming.length > 0 && <MyReminders initial={upcoming} />}

      {withinHours != null && windowed ? (
        <>
          {genreEmpty && (
            <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-100">
              No {genre?.toLowerCase()} on major {region} networks in the next {withinHours} hours — here’s everything that’s coming on instead.
            </p>
          )}
          <OnTvGuide airings={windowed} dateLabel={`Next ${withinHours} hours`} country={region} mode="broadcast" remindedIds={remindedIds} windowHours={withinHours} />
          <p className="text-sm">
            <Link href="/app/tv" className="font-semibold text-brand-300 hover:underline">See the full day’s guide →</Link>
          </p>
        </>
      ) : (
        <OnTvGuide airings={airings} dateLabel={friendlyDate(now)} country={region} mode="broadcast" remindedIds={remindedIds} />
      )}

      <p className="text-[11px] text-slate-500">
        Listings from TVmaze’s community broadcast guide — real schedules, refreshed hourly. Coverage is best for
        major {region} networks; we never invent a listing, so a channel with no data simply won’t appear.
      </p>
    </div>
  );
}
