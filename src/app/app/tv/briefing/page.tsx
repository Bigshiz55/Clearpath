import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getProfile, regionFor } from '@/lib/profile';
import { getIngestedDayAirings } from '@/lib/tv/ingestedGuide';
import { scoreGuideAirings } from '@/lib/tv/scoreGuide';
import { xmltvCoverageEvidence } from '@/lib/tv/xmltvCoverage';
import { DNA_PERSONAL_MIN } from '@/lib/verdict/confidence';
import { CaseBriefing, BriefingUnavailable } from '@/components/CaseBriefing';
import {
  DEFAULT_BRIEFING_TZ,
  localDayWindow,
  safeTimeZone,
  selectCaseBriefing,
  type CaseBriefingSections,
} from '@/lib/tv/caseBriefing';
import type { Airing } from '@/lib/onTv';

/**
 * TODAY'S CASE BRIEFING — the route.
 *
 * One evaluated set, four canonical owners, nothing else:
 *   schedule truth   getIngestedDayAirings — the stored imported day, whole
 *   coverage honesty xmltvCoverageEvidence — no proven window, no briefing
 *   personalization  scoreGuideAirings — the ONE engine, run ONCE per request
 *   selection        selectCaseBriefing — pure, tested, shared with harness
 *
 * The day is the VIEWER'S local calendar day (`?tz=`, corrected client-side
 * on first paint; Eastern fallback before that — see caseBriefing.ts for the
 * documented convention). `?channel=` deep-links a single channel's edition.
 * Nothing in this request path calls a listings provider.
 */

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Today’s Case Briefing · WatchVerd1ct' };

const HOUR_MS = 60 * 60 * 1000;
/** On-now lookback: a programme that started up to 6h ago can still be
 *  running (same allowance every guide surface uses). */
const LOOKBACK_MS = 6 * HOUR_MS;
/** Client-payload cap on synopsis text — the sheet shows a briefing, not a
 *  novel; the full text lives one tap away on the title page. */
const SUMMARY_CAP = 500;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

const trimSummary = (a: Airing): Airing =>
  a.summary && a.summary.length > SUMMARY_CAP ? { ...a, summary: `${a.summary.slice(0, SUMMARY_CAP)}…` } : a;

function trimBriefing(b: CaseBriefingSections): CaseBriefingSections {
  return {
    ...b,
    leadCase: b.leadCase ? trimSummary(b.leadCase) : null,
    wildcard: b.wildcard ? trimSummary(b.wildcard) : null,
    topCases: b.topCases.map(trimSummary),
    tonightsDocket: b.tonightsDocket.map(trimSummary),
    moviesOnTheDocket: b.moviesOnTheDocket.map(trimSummary),
    liveAndSports: b.liveAndSports.map(trimSummary),
    newAndPremieres: b.newAndPremieres.map(trimSummary),
    worthWatching: b.worthWatching.map(trimSummary),
    lateNightFile: b.lateNightFile.map(trimSummary),
  };
}

export default async function BriefingPage({
  searchParams,
}: {
  searchParams?: { channel?: string | string[]; tz?: string | string[] };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const region = regionFor(user ? await getProfile(supabase, user.id) : null);

  const tz = safeTimeZone(one(searchParams?.tz)) ?? DEFAULT_BRIEFING_TZ;
  const channel = one(searchParams?.channel)?.slice(0, 80) ?? null;
  const now = Date.now();
  const day = localDayWindow(now, tz);
  const dateLine = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(now));

  // COVERAGE FIRST. No proven imported window covering now → the honest
  // unavailable state, not a thinner briefing.
  const xmltv = await xmltvCoverageEvidence(supabase, now);
  if (!xmltv.live) {
    return <BriefingUnavailable reason="no-coverage" dateLine={dateLine} />;
  }

  // THE DAY, WHOLE: from local midnight (less the on-now lookback, clamped to
  // the day when the morning is young) to local midnight tonight — paged, so
  // a full national lineup's evening never silently truncates.
  const rangeStart = Math.max(day.startMs, now - LOOKBACK_MS);
  let airings = await getIngestedDayAirings(supabase, rangeStart, day.endMs).catch(() => [] as Airing[]);
  if (airings.length === 0) {
    return <BriefingUnavailable reason="no-rows" dateLine={dateLine} />;
  }

  // SCORED ONCE, for the signed-in reader, by the one engine every card
  // already uses (bounded budget, cached, fail-open). Every section below is
  // constructed from this single evaluated set.
  if (user) {
    airings = await scoreGuideAirings(supabase, user.id, airings, now, region);
  }

  // "YOUR VERDICT" is only claimed once the engine has actually learned this
  // user — the same DNA floor every personal surface applies.
  let personalized = false;
  if (user) {
    const { count } = await supabase
      .from('watchlist_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('rating', 'is', null);
    personalized = (count ?? 0) >= DNA_PERSONAL_MIN;
  }

  const briefing = trimBriefing(selectCaseBriefing(airings, now, tz, { channel, personalized }));

  return (
    <div className="space-y-5">
      <CaseBriefing briefing={briefing} tz={tz} nowMs={now} personalized={personalized} dateLine={dateLine} />
      <p className="text-[11px] text-slate-500">
        Full channel listings from{' '}
        <a href="https://www.tvmedia.ca" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
          TV Media
        </a>
        . Times shown in your local time zone. Verdict scores are computed by WatchVerd1ct’s own engine from your
        ratings — when a programme can’t be matched to a title, it appears without a score rather than with a guess.
      </p>
    </div>
  );
}
