import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { RapidFireLive } from '@/components/RapidFireLive';
import { TitleGridCalibration } from '@/components/TitleGridCalibration';
import { buildQueue, BATCH_SIZE } from '@/lib/import/rapidFire';
import { historyToObservations, type HistoryRow } from '@/lib/import/historyObservations';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Rapid Fire · WatchVerd1ct' };

/**
 * RAPID FIRE — seeded from the user's REAL history.
 *
 * When imported/marked history exists (watchlist rows whose status says
 * watched or stopped-watching), the questions are about THOSE titles — the
 * queue is the same pure `buildQueue` the demo uses, fed by
 * `historyToObservations`, so abandoned titles still go first and nothing is
 * asked that the data cannot evidence. Titles already answered in a previous
 * sitting are excluded via their rapid-fire events (including the zero-DNA
 * asked-markers), so "answer 20 more" always means twenty NEW questions.
 *
 * FALLBACK: with no usable history there is nothing honest to ask "how was
 * it?" about — so the page serves the current normal quiz pool (the same
 * titles-grid instrument the Taste Quiz runs), which asks pre-watch
 * questions that never imply the user watched anything.
 */
export default async function RapidFirePage({
  searchParams,
}: {
  searchParams?: { session?: string };
}) {
  const sessionId = searchParams?.session || undefined;

  let queue: ReturnType<typeof buildQueue> = [];
  let refs: Array<[string, { tmdbId: number; mediaType: 'movie' | 'tv'; title: string }]> = [];
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const [{ data: rows }, { data: askedRows }] = await Promise.all([
        supabase
          .from('watchlist_items')
          .select('tmdb_id, media_type, title, status, rating, watched_at')
          .eq('user_id', user.id)
          .in('status', ['watched', 'dropped'])
          .order('watched_at', { ascending: false, nullsFirst: false })
          .limit(500),
        supabase
          .from('preference_events')
          .select('tmdb_id, media_type')
          .eq('user_id', user.id)
          .eq('source', 'rapid-fire')
          .limit(2000),
      ]);

      const asked = new Set(
        (askedRows ?? [])
          .filter((r) => r.tmdb_id != null && r.media_type != null)
          .map((r) => `${r.media_type}:${r.tmdb_id}`),
      );
      const fresh = ((rows ?? []) as HistoryRow[]).filter(
        (r) => !asked.has(`${r.media_type}:${r.tmdb_id}`),
      );

      const mapped = historyToObservations(fresh);
      queue = buildQueue(mapped.observations, { now: Date.now(), limit: BATCH_SIZE });
      refs = [...mapped.refs.entries()].filter(([key]) => queue.some((q) => q.key === key));
    }
  } catch {
    queue = [];
    refs = [];
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Rapid Fire</h1>
        <p className="mt-1 text-base leading-relaxed text-slate-300">
          {queue.length > 0
            ? 'Your history knows you watched these. It has no idea whether you liked them — one title, one tap, a couple of minutes.'
            : 'An import knows you watched something. It has no idea whether you liked it. This is how that gets fixed — one title, one tap, a couple of minutes.'}
        </p>
      </div>

      {queue.length > 0 ? (
        <RapidFireLive queue={queue} refs={refs} sessionId={sessionId} />
      ) : (
        <div className="space-y-4" data-testid="rapid-fire-fallback">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm leading-relaxed text-slate-300">
              No imported or marked history to ask about yet — so here are the normal quiz questions
              instead. They never assume you watched anything.{' '}
              <Link href="/import-taste" className="font-semibold text-brand-300 underline underline-offset-2">
                Import your real history
              </Link>{' '}
              and Rapid Fire will ask about what you actually watched. Netflix, and any tracker that
              exports CSV.
            </p>
          </div>
          <TitleGridCalibration sessionId={sessionId} />
        </div>
      )}
    </div>
  );
}
