import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getProfile, regionFor } from '@/lib/profile';
import { getOnTvToday, getUpcomingTv, enrichAiringsWithCritics, enrichAiringsWithTmdb, enrichAiringsWithTmdbByTitle } from '@/lib/onTv';
import { OnTvGuide } from '@/components/OnTvGuide';
import { MyReminders, type ReminderRow } from '@/components/MyReminders';
import { TvDetective } from '@/components/TvDetective';
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'On TV today · WatchVerdict' };

const HOUR_MS = 60 * 60 * 1000;

/** Parse ?within=N (hours) into a clamped 1–48h horizon, or null. */
function parseWithin(v: string | string[] | undefined): number | null {
  const raw = Array.isArray(v) ? v[0] : v;
  const n = raw != null ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? Math.max(1, Math.min(48, n)) : null;
}

// Cable networks TVmaze can't see, but that publish their own public live
// schedule. When we can't confirm a listing, we send people straight to the
// source instead of pretending — honest and immediately useful.
const NETWORK_SCHEDULES: { test: RegExp; name: string; url: string }[] = [
  { test: /\b(lmn|lifetime movie)/, name: 'LMN (Lifetime Movies)', url: 'https://www.mylifetime.com/lmn/schedule' },
  { test: /lifetime/, name: 'Lifetime', url: 'https://www.mylifetime.com/schedule' },
  { test: /hallmark/, name: 'Hallmark', url: 'https://www.hallmarkchannel.com/schedule' },
  { test: /\bamc\b/, name: 'AMC', url: 'https://www.amc.com/schedule' },
  { test: /\busa\b/, name: 'USA Network', url: 'https://www.usanetwork.com/schedule' },
  { test: /bravo/, name: 'Bravo', url: 'https://www.bravotv.com/schedule' },
];
function officialScheduleFor(net: string | null): { name: string; url: string } | null {
  if (!net) return null;
  const n = net.toLowerCase();
  return NETWORK_SCHEDULES.find((s) => s.test.test(n)) ?? null;
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
  searchParams?: { within?: string | string[]; genre?: string | string[]; network?: string | string[]; type?: string | string[] };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const region = regionFor(user ? await getProfile(supabase, user.id) : null);
  const { t } = getServerI18n();

  const now = new Date();
  const date = isoDate(now);
  const withinHours = parseWithin(searchParams?.within);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const genre = one(searchParams?.genre)?.slice(0, 24) ?? null;
  const network = one(searchParams?.network)?.slice(0, 24) ?? null;
  const movieOnly = one(searchParams?.type) === 'movie';
  const hasFilter = !!(genre || network || movieOnly);
  const titleCase = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());
  // A human label for the filters: "Lifetime comedy movies".
  const filterLabel = [network ? titleCase(network) : null, genre?.toLowerCase(), movieOnly ? 'movies' : null].filter(Boolean).join(' ');
  const official = officialScheduleFor(network);

  const airingsRaw = await getOnTvToday(region, date);
  // Add IMDb / Rotten Tomatoes / Metacritic to the placards (cached, bounded).
  const airings = await enrichAiringsWithCritics(airingsRaw).then((a) => enrichAiringsWithTmdb(a));

  // When asked for a specific window ("Lifetime movies coming on tonight"), build
  // the real time/genre/network/type-filtered set and enrich it the same way.
  // Broadcast airings resolve TMDB via their imdb id; the Gracenote cable movies
  // have no imdb id, so also resolve those by an exact title+year search — that's
  // what gives the cable placards a Save button and a DNA score.
  const enrich = (a: Awaited<ReturnType<typeof getUpcomingTv>>) =>
    enrichAiringsWithCritics(a).then(enrichAiringsWithTmdb).then(enrichAiringsWithTmdbByTitle);
  let windowed =
    withinHours != null
      ? await enrich(await getUpcomingTv(region, now.getTime(), withinHours * HOUR_MS, genre, network, movieOnly))
      : null;
  // Filters named but nothing matched in-window — fall back to everything on,
  // labeled honestly, rather than an empty screen.
  let genreEmpty = false;
  if (withinHours != null && hasFilter && windowed && windowed.length === 0) {
    genreEmpty = true;
    windowed = await enrich(await getUpcomingTv(region, now.getTime(), withinHours * HOUR_MS, null, null, false));
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
            ? genreEmpty
              ? filterLabel
                ? t('discover.onTv.headingLiveLabeled', { label: titleCase(filterLabel) })
                : t('discover.onTv.headingLive')
              : filterLabel
                ? t('discover.onTv.headingWindowLabeled', { label: filterLabel, hours: withinHours })
                : t('discover.onTv.headingWindow', { hours: withinHours })
            : t('discover.onTv.headingToday')}
        </h1>
        <p className="mt-2 text-sm text-slate-300">
          {withinHours != null ? (
            <>
              {t('discover.onTv.subWindowA', { region, hours: withinHours })}
              <span className="font-semibold text-white">{t('discover.onTv.remindMe')}</span>
              {t('discover.onTv.subWindowB')}
              <span className="font-semibold text-white">{t('discover.onTv.beforeStarts')}</span>
              {t('discover.onTv.subWindowC')}
            </>
          ) : (
            <>
              {t('discover.onTv.subTodayA', { region })}
              <span className="font-semibold text-white">{t('discover.onTv.remindMe')}</span>
              {t('discover.onTv.subTodayB')}
              <span className="font-semibold text-white">{t('discover.onTv.beforeStarts')}</span>
              {t('discover.onTv.subTodayC')}
            </>
          )}
        </p>
      </section>

      <TvDetective />

      {upcoming.length > 0 && <MyReminders initial={upcoming} />}

      {withinHours != null && windowed ? (
        <>
          {genreEmpty ? (
            <>
              {/* Honest empty-state: our live guide reads TVmaze's community
                  broadcast schedule (strong for the big US networks, thin/none for
                  cable and TV-movies). Don't dump unrelated shows as if they were
                  the answer — say why, then point somewhere that can actually help. */}
              <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.07] p-4 text-center sm:p-5">
                <div className="text-2xl" aria-hidden>📭</div>
                <h2 className="mt-1 text-lg font-bold text-white">
                  {t('discover.onTv.noneHeading', { label: filterLabel || t('discover.onTv.matchesWord'), hours: withinHours })}
                </h2>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-300">
                  {t('discover.onTv.noneBody', {
                    region,
                    what: (() => {
                      const base = network ? titleCase(network) : t('discover.onTv.cable');
                      return movieOnly ? t('discover.onTv.whatMovies', { base }) : base;
                    })(),
                  })}
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {official && (
                    <a
                      href={official.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-400"
                    >
                      {t('discover.onTv.seeSchedule', { name: official.name })}
                    </a>
                  )}
                  <Link href="/app/finder" className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${official ? 'border border-white/15 text-slate-200 hover:bg-white/10' : 'bg-brand-500 text-white hover:bg-brand-400'}`}>
                    {t('discover.onTv.findByService', { what: movieOnly ? t('discover.onTv.moviesWord') : t('discover.onTv.titlesWord') })}
                  </Link>
                  <Link href="/app/watch" className="rounded-lg border border-white/15 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10">
                    {t('discover.onTv.stateNewCase')}
                  </Link>
                </div>
              </div>
              <h2 className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('discover.onTv.meanwhile')}
              </h2>
              <OnTvGuide airings={windowed} dateLabel={t('discover.onTv.nextHours', { hours: withinHours })} country={region} mode="broadcast" remindedIds={remindedIds} windowHours={withinHours} />
            </>
          ) : (
            <OnTvGuide airings={windowed} dateLabel={t('discover.onTv.nextHours', { hours: withinHours })} country={region} mode="broadcast" remindedIds={remindedIds} windowHours={withinHours} />
          )}
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
