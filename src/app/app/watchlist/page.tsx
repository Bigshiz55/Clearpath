import { createClient } from '@/lib/supabase/server';
import { isEvidenceOnly, reconcile, type ListProvenance } from '@/lib/watchlist/provenance';
import { WatchlistManager, type WatchlistItem } from '@/components/watchlist/WatchlistManager';
import { EmptyState } from '@/components/EmptyState';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Watchlist' };

export default async function WatchlistPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from('watchlist_items')
    .select('id, tmdb_id, media_type, title, year, poster_path, status, rating, notes, priority, added_at, watched_at, provenance')
    .eq('user_id', user?.id ?? '')
    .order('added_at', { ascending: false });

  const all = (data as (WatchlistItem & { provenance?: ListProvenance | null })[] | null) ?? [];

  /* THE PAGE SHOWS WHAT THE USER PUT HERE.
     A real account carried ~525 rows, ~518 of them `watched`, almost none
     recognised — because every rating from the endless Docket game wrote a
     watched list entry. Those ratings are real and still feed recommendations;
     they were never a request to add something to a collection, and presenting
     them as one is what made the page untrustworthy.
     NOTHING IS DELETED. Evidence-only rows are filtered out of the view and
     counted below, so the user can see the number and decide, rather than
     having a heuristic silently discard their history. */
  const items = all.filter((i) => !isEvidenceOnly(i.provenance));
  const report = reconcile(all.map((i) => ({ status: i.status, provenance: i.provenance })));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Your watchlist</h1>
        <p className="mt-1 text-sm text-slate-400">Everything you’ve saved — search it, sort it, and star your Favorites.</p>
        {report.evidenceOnly > 0 && (
          /* Stated plainly rather than hidden. The ratings are the user's and
             they still shape recommendations; they are just not a watchlist. */
          <p className="mt-2 text-xs text-slate-500">
            {report.evidenceOnly} more {report.evidenceOnly === 1 ? 'title is' : 'titles are'} rated from taste games.
            Those tune your recommendations but aren&rsquo;t saved here.
          </p>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Your watchlist is empty"
          description="Find something worth watching and add it here."
          icon={<span className="text-2xl">📺</span>}
          action={
            <Link href="/app" className="btn-primary">
              Discover titles
            </Link>
          }
        />
      ) : (
        <WatchlistManager items={items} />
      )}
    </div>
  );
}
