import { notFound } from 'next/navigation';
import { Showdown } from '@/components/showdown/Showdown';
import { FIXTURE_POOL } from '@/lib/showdown/fixtures';

/**
 * Dev harness — the real component on a fixed pool, no auth and no TMDB.
 *
 * The pool is a fixture so browser tests exercise layout, flow and the answer
 * rules deterministically, without depending on a live catalogue or on which
 * titles happen to have been classified. 404 in production.
 */
export const dynamic = 'force-dynamic';

export default function ShowdownHarness() {
  if ((process.env.VERCEL_ENV ?? 'development') === 'production') notFound();
  return (
    <main className="min-h-screen bg-cinema-radial">
      <Showdown pool={FIXTURE_POOL} />
    </main>
  );
}
