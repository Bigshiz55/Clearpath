import { notFound } from 'next/navigation';
import { WhatsOnToday } from '@/components/WhatsOnToday';
import type { Airing } from '@/lib/onTv';

/**
 * WHAT'S ON TODAY harness (MOBILE_HARNESS=1 only) — the real component over a
 * fixed stored-shape day, so the browser suite can prove the sections render
 * from STORED rows with zero provider requests. A 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

// 2026-08-15T18:00:00Z = 14:00 EDT.
const NOW = Date.parse('2026-08-15T18:00:00Z');

let seq = 0;
const a = (over: Partial<Airing> & Pick<Airing, 'showName' | 'airstamp'>): Airing => ({
  id: ++seq, time: '12:00', minutes: 720, runtime: 60, network: `Channel ${seq}`,
  showId: 9000 + seq, episodeName: null, season: null, number: null,
  showType: 'Scripted', genres: [], rating: null, image: null, summary: null, imdb: null,
  ...over,
});

const DAY: Airing[] = [
  a({ showName: 'Running Matinee', airstamp: '2026-08-15T17:30:00Z', runtime: 120, showType: 'Movie', network: 'FMN' }),
  a({ showName: 'Prime Time Film', airstamp: '2026-08-16T00:00:00Z', runtime: 120, showType: 'Movie', network: 'FMN', match: 88 }),
  a({ showName: 'Evening Kickoff', airstamp: '2026-08-15T23:30:00Z', runtime: 180, showType: 'Sports', network: 'Sports One' }),
  a({ showName: 'Flagged Premiere', airstamp: '2026-08-15T22:00:00Z', isPremiere: true, network: 'Drama Net' }),
  a({ showName: 'Unscored Drama', airstamp: '2026-08-15T21:00:00Z', network: 'Drama Net' }),
  a({ showName: 'Scored Sitcom', airstamp: '2026-08-15T23:00:00Z', network: 'Laughs', match: 73 }),
];

export default function WhatsOnTodayHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <main className="container-page space-y-4 py-6" data-testid="wot-harness">
      <h1 className="text-xl font-black text-white">Harness — What’s on today</h1>
      <WhatsOnToday airings={DAY} nowMs={NOW} personalized />
    </main>
  );
}
