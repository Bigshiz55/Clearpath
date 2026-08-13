import { notFound } from 'next/navigation';
import type { ShowdownPayoff } from '@/lib/actions/showdown';
import { PayoffViewer } from './Viewer';

/**
 * RESULTS-SCREEN harness (MOBILE_HARNESS=1) — the REAL `ShowdownResults`, with
 * a supplied payoff.
 *
 * WHY THIS ROUTE HAS TO EXIST. The real-ranking section only appears for a
 * signed-in player, after a server round-trip that needs Supabase and TMDB.
 * Neither the Playwright harness nor an anonymous request can reach it, so
 * without this page the one part of the screen that makes a claim about the
 * product's recommendations is the one part nobody can look at.
 *
 * IT IS A VIEWER, NOT A DEMO. The session is played by the real engine, the
 * component is the shipped one, and the only thing supplied is the payoff
 * object the server would have returned — because the point is to see the three
 * states side by side:
 *
 *   ?state=none    the server has not answered (or the player is a guest)
 *   ?state=flat    measured, and nothing crossed the ranker's floor
 *   ?state=moved   measured, and titles climbed
 *
 * `notFound()` outside the harness, exactly like `/dev/court`.
 */
export const dynamic = 'force-dynamic';

const ROWS: ShowdownPayoff['top'] = [
  { id: 'movie-1', title: 'The Long Walk Home', year: 2019, was: 9, now: 1, moved: 8 },
  { id: 'movie-2', title: 'Nightshift', year: 2021, was: 2, now: 2, moved: 0 },
  { id: 'movie-3', title: 'A Quiet Kind of Ruin', year: 2017, was: 11, now: 3, moved: 8 },
  { id: 'movie-4', title: 'Harbourmaster', year: 2023, was: 3, now: 4, moved: -1 },
  { id: 'movie-5', title: 'Ten Cent Pistol', year: 2015, was: 4, now: 5, moved: -1 },
];

export default function ShowdownPayoffHarness({
  searchParams,
}: {
  searchParams?: { state?: string };
}) {
  if (process.env.MOBILE_HARNESS !== '1') notFound();

  const which = searchParams?.state ?? 'moved';
  const payoff: ShowdownPayoff | null =
    which === 'none'
      ? null
      : which === 'flat'
        ? { measured: true, movement: 0, top: [], climbed: [] }
        : { measured: true, movement: 26, top: ROWS, climbed: [ROWS[0]!, ROWS[2]!] };

  return (
    <main className="min-h-screen bg-cinema-radial">
      <PayoffViewer payoff={payoff} />
    </main>
  );
}
