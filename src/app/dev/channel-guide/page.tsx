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
];

export default function ChannelGuideHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <main className="container-page space-y-4 py-6" data-testid="guide-harness">
      <h1 className="text-xl font-black text-white">Harness — full channel guide</h1>
      <ChannelGuide airings={GRID} nowMs={NOW} />
    </main>
  );
}
