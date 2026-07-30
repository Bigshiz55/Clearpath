import { notFound } from 'next/navigation';
import { OnTvGuide } from '@/components/OnTvGuide';
import type { Airing } from '@/lib/onTv';

/**
 * ON TV harness (gated by MOBILE_HARNESS=1).
 *
 * `/dev/live-tv` mounts `LiveScheduleView` — a different component on a
 * different data contract — so the On TV guide's HIGHLIGHT STRIP had no harness
 * at all. Three separate layout fixes to that strip shipped unmeasured because
 * of it, and the last one arrived back as a screenshot of the buttons
 * overflowing their card on an iPhone.
 *
 * This mounts the real `OnTvGuide` over static `Airing` fixtures so the strip
 * can be measured at phone widths. Fixtures on purpose: TVmaze/Gracenote are
 * unreachable from the harness, and a layout test wants a fixed worst case
 * anyway — the longest show name, the widest network tag, an unmatched listing,
 * and a double bill that exercises the "also at" line.
 *
 * A 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

/**
 * Anchored to the REAL clock, per request: the strip now drops anything no
 * longer worth tuning into, so a frozen past instant would empty it — and a
 * module-level `Date.now()` would age out under a long-lived test server. The
 * OFFSETS from now (upcoming / just started / nearly over) are what the
 * assertions care about, and those are fixed per render.
 */
function airing(base: number, i: number, over: Partial<Airing>): Airing {
  const start = base + 30 * 60_000 + i * 1_800_000;
  return {
    id: 900 + i,
    time: '20:00',
    minutes: 20 * 60 + i * 30,
    airstamp: new Date(start).toISOString(),
    runtime: 120,
    network: 'AMC',
    showName: 'A Show',
    showId: 500 + i,
    episodeName: null,
    season: null,
    number: null,
    showType: 'Movie',
    genres: ['Drama'],
    rating: 7.9,
    image: null,
    summary: null,
    imdb: null,
    criticRt: 88,
    criticImdb: 7.6,
    tmdbId: 1000 + i,
    mediaType: 'movie',
    posterPath: null,
    year: 2004,
    ...over,
  };
}

function buildAirings(base: number): Airing[] {
  const a = (i: number, over: Partial<Airing>) => airing(base, i, over);
  return [
    a(0, { showName: 'Cinderella Man', network: 'AMC' }),
    // The worst case the screenshot showed: a long name over a long channel name.
    a(1, {
      showName: 'The Lord of the Rings: The Fellowship of the Ring',
      network: 'Paramount Network HD',
      rating: 8.8,
      criticRt: 91,
    }),
    // Same show twice, thirty minutes apart — one card, with "also at". Same
    // TMDB id on both, as the resolver would give them: that is the key the
    // strip groups on.
    a(2, { showName: 'World War II with Tom Hanks', showId: 777, tmdbId: 4242, network: 'History' }),
    a(3, { showName: 'World War II with Tom Hanks', showId: 777, tmdbId: 4242, network: 'History' }),
    // Not matched to TMDB: no verdict pair, no W, no DNA — but the same height.
    a(4, {
      showName: 'Some Local Broadcast',
      network: 'WGN',
      tmdbId: null,
      mediaType: null,
      criticRt: null,
      criticImdb: null,
    }),
    a(5, { showName: 'Gone', network: 'FX', rating: 6.2, criticRt: 38, criticImdb: null }),
    a(6, { showName: 'Heat', network: 'TNT', rating: 8.3 }),
    a(7, { showName: 'Se7en', network: 'IFC', rating: 8.6, criticImdb: 8.6 }),
    // Already running, twenty minutes in — the card must say "On now", not
    // print a start time that has passed.
    a(8, {
      showName: 'Started Twenty Minutes Ago',
      network: 'Hallmark',
      airstamp: new Date(base - 20 * 60_000).toISOString(),
      runtime: 120,
    }),
    // The screenshot bug: started nearly four hours ago in a four-hour slot.
    // Still "on" by the schedule — and must NOT be offered as a highlight.
    a(9, {
      showName: 'Nearly Over Movie',
      network: 'HDNet Movies',
      airstamp: new Date(base - 228 * 60_000).toISOString(),
      runtime: 240,
    }),
  ];
}

export default function OnTvHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <main className="container-page py-6" data-testid="on-tv-harness">
      <h1 className="mb-4 text-xl font-black text-white">On TV — highlight strip</h1>
      <OnTvGuide airings={buildAirings(Date.now())} dateLabel="Monday, 27 July" country="US" windowHours={6} />
    </main>
  );
}
