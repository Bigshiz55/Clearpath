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

  /* THE COLUMN MAY NOT BE THERE YET, AND A BLANK WATCHLIST IS WORSE THAN AN
     UNFILTERED ONE.
     PostgREST rejects the WHOLE select when one column is unknown, so a deploy
     that lands before migration 0047 would not degrade — it would return null
     and render "Your watchlist is empty" to someone with 500 saved titles. That
     is exactly the failure mode that shipped a broken TV diagnostic earlier in
     this codebase (a select naming a column that did not exist, returning 200
     with an error body nobody read).
     So the query is attempted with `provenance` and retried without it. Missing
     column means every row reads as `unknown_legacy`, which is honest: before
     the migration we genuinely do not know where any row came from. */
  const COLUMNS = 'id, tmdb_id, media_type, title, year, poster_path, status, rating, notes, priority, added_at, watched_at';
  const uid = user?.id ?? '';
  type Row = WatchlistItem & { provenance?: ListProvenance | null };
  const fetchRows = (columns: string) =>
    supabase
      .from('watchlist_items')
      .select(columns)
      .eq('user_id', uid)
      .order('added_at', { ascending: false });

  let provenanceAvailable = true;
  let data: Row[] | null = null;
  const withProvenance = await fetchRows(`${COLUMNS}, provenance`);
  if (withProvenance.error) {
    provenanceAvailable = false;
    const without = await fetchRows(COLUMNS);
    data = (without.data as unknown as Row[] | null) ?? null;
  } else {
    data = (withProvenance.data as unknown as Row[] | null) ?? null;
  }

  const all: Row[] = data ?? [];

  /* THE PAGE SHOWS WHAT THE USER PUT HERE.
     A real account carried ~525 rows, ~518 of them `watched`, almost none
     recognised — because every rating from the endless Docket game wrote a
     watched list entry. Those ratings are real and still feed recommendations;
     they were never a request to add something to a collection, and presenting
     them as one is what made the page untrustworthy.
     NOTHING IS DELETED. Evidence-only rows are filtered out of the view and
     counted below, so the user can see the number and decide, rather than
     having a heuristic silently discard their history. */
  /* Without the column there is nothing to filter ON, and filtering by a value
     we do not have would hide rows for no reason. Show everything and say
     nothing about provenance until the migration lands. */
  const items = provenanceAvailable ? all.filter((i) => !isEvidenceOnly(i.provenance)) : all;
  const report = reconcile(all.map((i) => ({ status: i.status, provenance: i.provenance })));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Your watchlist</h1>
        <p className="mt-1 text-sm text-slate-400">Everything you’ve saved — search it, sort it, and star your Favorites.</p>
        {provenanceAvailable && report.evidenceOnly > 0 && (
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
