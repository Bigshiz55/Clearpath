import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getProfile, getPreferenceRules, regionFor } from '@/lib/profile';
import { getOnTvToday, getUpcomingTv, enrichAiringsWithCritics, enrichAiringsWithTmdb, enrichAiringsWithTmdbByTitle, usBroadcastDate, type Airing } from '@/lib/onTv';
import { scoreGuideAirings } from '@/lib/tv/scoreGuide';
import { getIngestedGuideAirings } from '@/lib/tv/ingestedGuide';
import { OnTvGuide } from '@/components/OnTvGuide';
import { ChannelGuide } from '@/components/ChannelGuide';
import { MyReminders, type ReminderRow } from '@/components/MyReminders';
import { hasFullGridProvider, isTvMediaConfigured } from '@/lib/viewing/liveTv';
import { TvDetective } from '@/components/TvDetective';
import { CoverageNote } from '@/components/tv/CoverageNote';
import { Antenna, Film, Sparkles } from 'lucide-react';
import { DNA_PERSONAL_MIN } from '@/lib/verdict/confidence';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'On TV today · WatchVerd1ct' };

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

/**
 * SERVER-SIDE FALLBACK ONLY. This renders in the SERVER's zone (UTC on
 * Vercel), which at 6pm in California is already the next calendar day — the
 * header used to print "Tuesday, Jul 29" directly above rows labelled "Today".
 * The real label is computed in the browser from `dateIso` (see
 * `longDayLabel` in OnTvGuide); this string only ever shows in the instant
 * before hydration, and for non-JS crawlers.
 */
function friendlyDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default async function OnTvPage({
  searchParams,
}: {
  searchParams?: { within?: string | string[]; genre?: string | string[]; network?: string | string[]; type?: string | string[]; view?: string | string[] };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const region = regionFor(user ? await getProfile(supabase, user.id) : null);

  const now = new Date();
  const date = usBroadcastDate(now.getTime());
  const withinHours = parseWithin(searchParams?.within);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const genre = one(searchParams?.genre)?.slice(0, 24) ?? null;
  const network = one(searchParams?.network)?.slice(0, 24) ?? null;
  const movieOnly = one(searchParams?.type) === 'movie';
  // ?view=guide — the full by-channel guide, from the whole ingested lineup.
  const guideView = one(searchParams?.view) === 'guide' && region === 'US';
  const hasFilter = !!(genre || network || movieOnly);
  const titleCase = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());
  // A human label for the filters: "Lifetime comedy movies".
  const filterLabel = [network ? titleCase(network) : null, genre?.toLowerCase(), movieOnly ? 'movies' : null].filter(Boolean).join(' ');
  const official = officialScheduleFor(network);
  // Whether a full listings grid is connected. Drives both the coverage banner
  // and the empty-state wording, so the two can never disagree.
  const gridConnected = hasFullGridProvider();

  const airingsRaw = guideView ? [] : await getOnTvToday(region, date);
  // Add IMDb / Rotten Tomatoes / Metacritic to the placards (cached, bounded).
  const airings = await enrichAiringsWithCritics(airingsRaw).then((a) => enrichAiringsWithTmdb(a));

  // THE FULL GUIDE — every channel, by channel, for the next 6 hours. Real
  // rows only, from the same TVmaze-ingested tables that back the Packs
  // feature (see src/lib/viewing/ingest/ and src/lib/tv/ingestedGuide.ts) —
  // NOT the old Gracenote public grid, which is retired (WAF-blocked, not
  // worked around; see docs/SCHEDULE_PROVIDERS.md). Only the handful of
  // channels configured for that ingest can ever appear here; the coverage
  // banner below reflects that narrowness from this same real data, not a flag.
  let guideAirings: Airing[] = guideView
    ? await getIngestedGuideAirings(supabase, now.getTime(), 6 * HOUR_MS).catch(() => [])
    : [];
  // PER-PROGRAMME SCORES. A bounded set of the window's programmes (on-now
  // first) is resolved to real titles and run through the SAME deterministic
  // engine as every card, with this user's rules — so "this movie suits you
  // 84" outranks the channel it happens to be on. Cached across users
  // (resolution 7d, hydration 12h); fail-open, never a broken guide.
  if (guideView && user && guideAirings.length > 0) {
    guideAirings = await scoreGuideAirings(supabase, user.id, guideAirings, now.getTime(), region);
  }
  // The user's own preference rules, serialized down to what the guide needs —
  // the channel ordering runs on the SAME weights that score every title.
  const tasteRules =
    guideView && user
      ? (await getPreferenceRules(supabase, user.id).catch(() => [])).map((r) => ({ trait: r.trait as string, weight: r.weight }))
      : [];
  // "YOUR 93" IS ONLY TRUE ONCE THE ENGINE HAS LEARNED YOU. Under the same
  // floor every personal claim uses (DNA_PERSONAL_MIN rated titles), guide
  // badges render as neutral baseline scores instead — never a personalized
  // label on a non-personalized number. Count query is cheap and fail-open.
  let guidePersonalized = false;
  if (guideView && user) {
    const { count } = await supabase
      .from('watchlist_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('rating', 'is', null);
    guidePersonalized = (count ?? 0) >= DNA_PERSONAL_MIN;
  }

  // COVERAGE HONESTY, FROM THE DATA — NOT FROM A CONFIG FLAG. `guideAirings`
  // is always empty for now (see above), so this reduces to `gridConnected` —
  // kept as its own value rather than inlined so the banner's condition still
  // reads as "is there real grid data", not "is a specific provider's flag set".
  const gridProbe = guideAirings;
  const gridLive = gridConnected || gridProbe.length > 0;

  // When asked for a specific window ("Lifetime movies coming on tonight"), build
  // the real time/genre/network/type-filtered set and enrich it the same way.
  // Most airings resolve TMDB via their imdb id; any movie missing one also
  // gets resolved by an exact title+year search — that's what gives every
  // movie card a Save button and a DNA score, imdb id or not.
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
    <div className="space-y-5">
      {/* ONE H1, ONE LINE UNDER IT, AND THE COVERAGE CAVEAT AT CAPTION WEIGHT.
          This heading block used to spend ~340px before the first listing: a
          three-line intro, a full amber banner restating coverage, and then
          the SAME "coming on" heading again inside the guide with its own
          explainer. The page's purpose is the listings; everything above them
          now fits in two short rows, and the first card row is on screen at
          1440×900 without scrolling. */}
      <section>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            {guideView
              ? 'Full channel guide'
              : withinHours != null
                ? genreEmpty
                  ? `${filterLabel ? `${titleCase(filterLabel)} ` : ''}on live TV`
                  : `${filterLabel ? `${titleCase(filterLabel)} ` : ''}Coming on in the next ${withinHours} hours`
                : 'On TV today'}
          </h1>
          {!gridLive && <CoverageNote />}
        </div>
        {/* Max one line, ≤90 characters — the details live on the controls
            themselves (the reminder bell explains the reminder). */}
        <p className="mt-1 text-sm text-slate-400">
          {guideView
            ? 'Every channel, next 6 hours — search by channel or by what’s playing.'
            : withinHours != null
              ? 'What’s on now and next — local times, ratings, and one-tap reminders.'
              : `What’s on live in ${region} — filter, sort by rating, set reminders.`}
        </p>
      </section>

      {/* THREE WAYS INTO THE SAME SCHEDULE. Highlights is the curated view;
          the full guide is the cable box (every channel, by channel); movies
          is the whole lineup filtered to films — the "there must be Hallmark
          movies on somewhere" question, answered as a tab instead of a typed
          query. US-only because the ingested grid is the US national lineup. */}
      {region === 'US' && (
        <nav className="flex flex-wrap gap-1.5" aria-label="Guide views" data-testid="tv-views">
          {[
            { href: '/app/tv', label: 'Highlights', Icon: Sparkles, active: !guideView && withinHours == null },
            { href: '/app/tv?view=guide', label: 'Full guide', Icon: Antenna, active: guideView },
            { href: '/app/tv?within=12&type=movie', label: 'Movies on now', Icon: Film, active: !guideView && movieOnly },
          ].map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? 'page' : undefined}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition ${
                t.active
                  ? 'border-brand-300 bg-brand-500/25 text-white'
                  : 'border-white/15 bg-white/[0.06] text-slate-300 hover:border-brand-300 hover:text-white'
              }`}
            >
              <t.Icon size={16} aria-hidden />
              {t.label}
            </Link>
          ))}
        </nav>
      )}

      {upcoming.length > 0 && <MyReminders initial={upcoming} />}

      {guideView && <ChannelGuide airings={guideAirings} nowMs={now.getTime()} remindedIds={remindedIds} taste={tasteRules} personalized={guidePersonalized} />}

      {guideView ? null : withinHours != null && windowed ? (
        <>
          {genreEmpty ? (
            <>
              {/* Honest empty-state.
                  The distinction that matters: this is NOT "there is nothing on
                  Lifetime tonight" — it is "we cannot see Lifetime from here".
                  The previous copy described the gap as how the guide works,
                  which read as a permanent product limit and would still have
                  been on screen after a full provider was connected. It now
                  names the real cause and changes on its own once one is. */}
              <div className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.07] p-4 text-center sm:p-5">
                                <h2 className="mt-1 text-lg font-bold text-white">
                  {gridLive
                    ? `No ${filterLabel || 'matches'} on live TV in the next ${withinHours}h`
                    : `We can’t see ${network ? titleCase(network) : 'that channel'}’s listings yet`}
                </h2>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-300">
                  {gridLive ? (
                    <>
                      We checked every channel in your lineup for the next {withinHours} hours and
                      found nothing matching. That’s a real result, not a gap in our data.
                    </>
                  ) : (
                    <>
                      This deployment has no full TV listings provider connected, so we can only see
                      first-run episodes on a handful of national networks — not{' '}
                      {network ? titleCase(network) : 'cable'}
                      {movieOnly ? ' movies' : ''}, reruns or most cable. This is missing data on our
                      side, not an empty schedule: {network ? titleCase(network) : 'that channel'} may
                      well be showing exactly what you asked for. Rather than guess, we only show what
                      we can actually confirm.
                    </>
                  )}
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {official && (
                    <a
                      href={official.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-400"
                    >
                      See {official.name}’s live schedule →
                    </a>
                  )}
                  <Link href="/app/finder" className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${official ? 'border border-white/15 text-slate-200 hover:bg-white/10' : 'bg-brand-500 text-white hover:bg-brand-400'}`}>
                    Find {movieOnly ? 'movies' : 'titles'} by streaming service
                  </Link>
                  <Link href="/app/watch" className="rounded-lg border border-white/15 px-3.5 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10">
                    State a new case
                  </Link>
                </div>
              </div>
              <h2 className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Meanwhile — actually coming on live TV
              </h2>
              <OnTvGuide airings={windowed} dateLabel={`Next ${withinHours} hours`} country={region} mode="broadcast" remindedIds={remindedIds} windowHours={withinHours} />
            </>
          ) : (
            <OnTvGuide airings={windowed} dateLabel={`Next ${withinHours} hours`} country={region} mode="broadcast" remindedIds={remindedIds} windowHours={withinHours} />
          )}
          <p className="text-sm">
            <Link href="/app/tv" className="font-semibold text-brand-300 hover:underline">See the full day’s guide →</Link>
          </p>
        </>
      ) : (
        <OnTvGuide airings={airings} dateLabel={friendlyDate(now)} dateIso={now.toISOString()} country={region} mode="broadcast" remindedIds={remindedIds} />
      )}

      {/* THE DETECTIVE IS A TOOL, NOT THE PAGE. It sat between the heading and
          the listings, which pushed the actual schedule below the fold to
          promote a secondary feature. The listings are why anyone is here;
          the deep-scan tool waits under them. */}
      {!guideView && <TvDetective />}

      {/* TV Media attribution — required by their terms only while their data
          is actually in use, so it's gated on isTvMediaConfigured() rather
          than always shown. No logo: TV Media's brand-kit asset URL isn't
          verified yet (see docs/SCHEDULE_PROVIDERS.md), and hotlinking a
          guessed one would be exactly the kind of fabrication this codebase
          avoids — a text credit is the compliant minimum until a real asset
          URL is confirmed. */}
      {isTvMediaConfigured() && (
        <p className="text-[11px] text-slate-500">
          Full channel listings from{' '}
          <a href="https://www.tvmedia.ca" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
            TV Media
          </a>
          .
        </p>
      )}
      {/* TVmaze API attribution — a clickable link to tvmaze.com, per their
          terms. Every surface on this page that shows TVmaze-sourced listings
          shares this one credit; do not add a second, differently-worded one
          elsewhere without checking here first. */}
      <p className="text-[11px] text-slate-500">
        Listings from{' '}
        <a href="https://www.tvmaze.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
          TVmaze
        </a>
        ’s community broadcast guide — real schedules, refreshed hourly. Coverage is best for major {region}{' '}
        networks; we never invent a listing, so a channel with no data simply won’t appear.
      </p>
    </div>
  );
}
