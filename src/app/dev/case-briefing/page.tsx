import { notFound } from 'next/navigation';
import { CaseBriefing, BriefingUnavailable } from '@/components/CaseBriefing';
import { selectCaseBriefing } from '@/lib/tv/caseBriefing';
import type { Airing } from '@/lib/onTv';

/**
 * TODAY'S CASE BRIEFING harness (MOBILE_HARNESS=1 only) — the REAL component
 * over the REAL selector, fed a fixed stored-shape day pinned to a fixed
 * zone, so the browser suite can prove the editorial page renders, filters
 * and taps through from stored rows with zero provider requests. A 404 in
 * any normal build.
 *
 *   ?channel=<name>    channel-filtered edition (mirrors the real route)
 *   ?personalized=0    the schedule-only edition (no personal sections)
 *   ?empty=1 / 2       the honest no-coverage / no-rows states
 */
export const dynamic = 'force-dynamic';

// 2026-08-15T18:00:00Z = 14:00 EDT — the fixture day is US-Eastern.
const NOW = Date.parse('2026-08-15T18:00:00Z');
const TZ = 'America/New_York';
const DATE_LINE = 'Friday, August 15, 2026';

let seq = 0;
const a = (over: Partial<Airing> & Pick<Airing, 'showName' | 'airstamp' | 'network'>): Airing => ({
  id: ++seq,
  time: '12:00',
  minutes: 720,
  runtime: 60,
  showId: 9000 + seq,
  episodeName: null,
  season: null,
  number: null,
  showType: 'Scripted',
  genres: [],
  rating: null,
  image: null,
  summary: null,
  imdb: null,
  ...over,
});

const DAY: Airing[] = [
  // The lead case: engine-scored 94, matched to a title (tap → QuickLook).
  a({
    showName: 'The Verdict Hour', airstamp: '2026-08-16T00:00:00Z', network: 'A&E', match: 94,
    matchWhy: 'Standard score 81 · +8 Courtroom dramas · +5 Slow-burn pacing', matchPersonalized: true,
    tmdbId: 501, mediaType: 'tv',
    genres: ['Crime', 'Drama'], summary: 'A retired judge reopens the cases that never sat right with her.',
  }),
  // Top cases (matched, descending).
  a({ showName: 'Midnight Confession', airstamp: '2026-08-16T03:30:00Z', network: 'TCM', match: 88, matchWhy: 'Standard score 80 · +8 Noir', matchPersonalized: true, tmdbId: 502, mediaType: 'movie', year: 1949, showType: 'Movie', runtime: 95, genres: ['Crime', 'Film Noir'] }),
  // OBJECTIVE-ONLY, deliberately: a real engine score that nothing about this
  // reader produced. It must render as "Standard score", never "Your verdict".
  a({ showName: 'The Long Cross-Examination', airstamp: '2026-08-16T01:00:00Z', network: 'A&E', match: 84, matchWhy: 'Standard score 84 · no personal signal for this title yet', tmdbId: 503, mediaType: 'tv', genres: ['Crime'] }),
  a({ showName: 'Records Room', airstamp: '2026-08-16T00:30:00Z', network: 'ID', match: 80, tmdbId: 504, mediaType: 'tv', genres: ['Crime', 'Documentary'] }),
  a({ showName: 'Habeas Corpus', airstamp: '2026-08-16T02:00:00Z', network: 'ID', match: 78, tmdbId: 505, mediaType: 'tv', genres: ['Drama'] }),
  a({ showName: 'The Appeal', airstamp: '2026-08-15T23:30:00Z', network: 'Laughs', match: 76, tmdbId: 506, mediaType: 'tv', genres: ['Drama'] }),
  a({ showName: 'Bench Notes', airstamp: '2026-08-15T22:30:00Z', network: 'ID', match: 74, tmdbId: 507, mediaType: 'tv', genres: ['Crime'] }),
  // Scored overflow → Worth Watching; the animation title → the wildcard.
  a({ showName: 'Cold Case Review', airstamp: '2026-08-15T23:00:00Z', network: 'ID', match: 71, tmdbId: 508, mediaType: 'tv', genres: ['Crime'] }),
  a({ showName: 'Animated Antics', airstamp: '2026-08-16T00:00:00Z', network: 'Toon', match: 68, tmdbId: 509, mediaType: 'tv', genres: ['Animation'] }),
  a({ showName: 'Second Opinion', airstamp: '2026-08-16T01:30:00Z', network: 'Laughs', match: 66, tmdbId: 510, mediaType: 'tv', genres: ['Comedy', 'Drama'] }),
  // Unmatched programmes — legitimate unscored entries (tap → schedule detail).
  a({
    showName: 'Forgotten Reels', airstamp: '2026-08-16T01:00:00Z', network: 'TCM', showType: 'Movie', runtime: 110,
    genres: ['Silent', 'Drama'], season: null, number: null,
    summary: 'A restored program of silent-era shorts, presented with a new score.',
  }),
  a({ showName: 'Championship Night', airstamp: '2026-08-16T00:30:00Z', network: 'ESPN', showType: 'Sports', runtime: 180, genres: ['Sports'] }),
  a({ showName: 'Fresh Case Files', airstamp: '2026-08-16T01:00:00Z', network: 'NBC', isPremiere: true, episodeName: 'The First File', season: 1, number: 1 }),
  a({ showName: 'Static After Dark', airstamp: '2026-08-16T03:00:00Z', network: 'Laughs', genres: ['Talk'] }),
  // On now (started 17:30Z, 120 min) — still briefable.
  a({ showName: 'Afternoon Matinee', airstamp: '2026-08-15T17:30:00Z', network: 'AMC', showType: 'Movie', runtime: 120, genres: ['Western'] }),
  // Already over — must never appear.
  a({ showName: 'Morning Gone', airstamp: '2026-08-15T10:00:00Z', network: 'AMC' }),
];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default function CaseBriefingHarness({
  searchParams,
}: {
  searchParams?: { channel?: string | string[]; personalized?: string | string[]; empty?: string | string[] };
}) {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  const empty = one(searchParams?.empty);
  if (empty) {
    return (
      <main className="container-page space-y-4 py-6" data-testid="briefing-harness">
        <BriefingUnavailable reason={empty === '2' ? 'no-rows' : 'no-coverage'} dateLine={DATE_LINE} />
      </main>
    );
  }
  const channel = one(searchParams?.channel);
  const personalized = one(searchParams?.personalized) !== '0';
  const briefing = selectCaseBriefing(DAY, NOW, TZ, { channel, personalized });
  return (
    <main className="container-page space-y-4 py-6" data-testid="briefing-harness">
      <CaseBriefing briefing={briefing} tz={TZ} tzLock nowMs={NOW} personalized={personalized} dateLine={DATE_LINE} />
    </main>
  );
}
