import { notFound } from 'next/navigation';
import { ChannelGuide } from '@/components/ChannelGuide';
import type { Airing } from '@/lib/onTv';

/**
 * CHANNEL GUIDE harness (gated by MOBILE_HARNESS=1) — the real ChannelGuide
 * fed a fixed grid shaped like the stored Gracenote lineup: cable movies
 * (Hallmark, Lifetime, TCM), series, sports, a channel with only upcoming
 * listings, and one whose airings have all ended. A fixed `nowMs` so the
 * on-now / up-next split is deterministic. A 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

const NOW = Date.parse('2026-07-28T20:30:00Z');

let seq = 0;
function a(over: Partial<Airing> & Pick<Airing, 'network' | 'showName' | 'airstamp'>): Airing {
  seq++;
  return {
    id: seq,
    time: '20:00',
    minutes: 1200,
    runtime: 60,
    showId: 1000 + seq,
    episodeName: null,
    season: null,
    number: null,
    showType: 'Series',
    genres: [],
    rating: null,
    image: null,
    summary: null,
    imdb: null,
    ...over,
  };
}

const GRID: Airing[] = [
  a({ network: 'Hallmark', showName: 'Autumn in the City', airstamp: '2026-07-28T20:00:00Z', runtime: 120, showType: 'Movie', year: 2022 }),
  a({ network: 'Hallmark', showName: 'A Second Chance Christmas', airstamp: '2026-07-28T22:00:00Z', showType: 'Movie' }),
  a({ network: 'Lifetime', showName: 'A Dangerous Affair', airstamp: '2026-07-28T21:00:00Z', showType: 'Movie' }),
  // East/west feed duplicate — same broadcast, second satellite. Must collapse.
  a({ network: 'Lifetime', showName: 'A Dangerous Affair', airstamp: '2026-07-28T21:00:00Z', showType: 'Movie' }),
  a({ network: 'Lifetime', showName: 'The Perfect Stranger', airstamp: '2026-07-28T23:00:00Z', showType: 'Movie' }),
  a({ network: 'TCM', showName: 'Casablanca', airstamp: '2026-07-28T19:45:00Z', runtime: 90, showType: 'Movie', year: 1942 }),
  a({ network: 'ESPN', showName: 'Monday Night Football', airstamp: '2026-07-28T20:00:00Z', runtime: 180 }),
  a({ network: 'Food Network', showName: 'Chopped', airstamp: '2026-07-28T20:00:00Z', runtime: 60 }),
  a({ network: 'Food Network', showName: 'Beat Bobby Flay', airstamp: '2026-07-28T21:00:00Z' }),
  a({ network: 'History', showName: 'The Proof Is Out There', airstamp: '2026-07-28T20:02:00Z', runtime: 58 }),
  a({ network: 'Dead Channel', showName: 'Already Over', airstamp: '2026-07-28T17:00:00Z', runtime: 30 }),
  // A true-crime block: on now and the 10 o'clock rerun are the SAME episode
  // (season/number match) — a viewer should be told it's a repeat, not a new
  // case. The 11 o'clock slot is a genuinely different episode with a higher
  // score, which must still show its own badge even though the show is the same.
  a({
    network: 'ID', showName: 'Cold Case Files', airstamp: '2026-07-28T20:00:00Z', runtime: 60, showType: 'Documentary',
    showId: 9001, season: 4, number: 10, episodeName: 'The Lake House Murder', tmdbId: 501, mediaType: 'tv', match: 83,
  }),
  a({
    network: 'ID', showName: 'Cold Case Files', airstamp: '2026-07-28T22:00:00Z', runtime: 60, showType: 'Documentary',
    showId: 9001, season: 4, number: 10, episodeName: 'The Lake House Murder', tmdbId: 501, mediaType: 'tv', match: 83,
  }),
  a({
    network: 'ID', showName: 'Cold Case Files', airstamp: '2026-07-28T23:00:00Z', runtime: 60, showType: 'Documentary',
    showId: 9001, season: 4, number: 11, episodeName: 'The Missing Heir', tmdbId: 501, mediaType: 'tv', match: 91,
  }),
  // Same show, no season/episode number on either side — genuinely can't say
  // whether the 9 o'clock airing repeats the 8 o'clock one.
  a({
    network: 'Court TV', showName: 'Body Cam', airstamp: '2026-07-28T20:00:00Z', runtime: 60, showType: 'Documentary',
    showId: 9002, season: null, number: null, episodeName: 'Traffic Stop Gone Wrong', match: 76,
  }),
  a({
    network: 'Court TV', showName: 'Body Cam', airstamp: '2026-07-28T21:00:00Z', runtime: 60, showType: 'Documentary',
    showId: 9002, season: null, number: null, episodeName: 'Traffic Stop Gone Wrong', match: 76,
  }),
];

// `?taste=1` — the DNA-ordered variant: a viewer whose rules love classic noir
// and Lifetime thrillers. TCM should lead the live group; ESPN stays neutral.
const TASTE = [
  { trait: 'noir', weight: 15 },
  { trait: 'domestic_thriller', weight: 6 },
];

// `?scored=1` — the per-programme variant: the engine has scored Casablanca 88
// for this viewer and Chopped 34, exactly as `scoreGuideAirings` would attach
// them. Casablanca's programme score must beat TCM's mere channel identity,
// and Food Network must sink below the neutral channels.
function withScores(grid: Airing[]): Airing[] {
  return grid.map((x) => {
    if (x.showName === 'Casablanca') return { ...x, tmdbId: 289, mediaType: 'movie' as const, match: 88 };
    if (x.showName === 'Chopped') return { ...x, tmdbId: 55, mediaType: 'tv' as const, match: 34 };
    return x;
  });
}

// `?grid=noMovies` — listings exist, none classified as a movie: the exact
// window the Movies-zero honesty states describe. Drives the coverage
// distinction end to end in a real browser.
const NO_MOVIES_GRID: Airing[] = [
  a({ network: 'Bravo', showName: 'Below Deck', airstamp: '2026-07-28T20:00:00Z', runtime: 60 }),
  a({ network: 'CNN', showName: 'The Situation Room', airstamp: '2026-07-28T20:00:00Z', runtime: 60, showType: 'News' }),
  a({ network: 'ESPN', showName: 'Monday Night Football', airstamp: '2026-07-28T20:00:00Z', runtime: 180, showType: 'Sports' }),
];

export default function ChannelGuideHarness({ searchParams }: { searchParams?: { taste?: string; scored?: string; grid?: string; coverage?: string } }) {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  const taste = searchParams?.taste === '1' ? TASTE : [];
  const grid = searchParams?.grid === 'noMovies' ? NO_MOVIES_GRID : searchParams?.scored === '1' ? withScores(GRID) : GRID;
  // `?coverage=1` — render as if a licensed full grid were supplying, so the
  // "that's the schedule" arm is drivable too; default mirrors production
  // reality (episode database only → coverage never provable).
  const coverageProvable = searchParams?.coverage === '1';
  return (
    <main className="container-page space-y-4 py-6" data-testid="guide-harness">
      <h1 className="text-xl font-black text-white">Harness — full channel guide</h1>
      <ChannelGuide airings={grid} nowMs={NOW} taste={taste} coverageProvable={coverageProvable} />
    </main>
  );
}
