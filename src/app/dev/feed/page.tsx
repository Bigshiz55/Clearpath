import { notFound } from 'next/navigation';
import { RulingFeed } from '@/components/RulingFeed';
import { QuickSearch } from '@/components/QuickSearch';
import { QuickSearchTrigger } from '@/components/QuickSearch';

/**
 * RULING FEED + QUICK SEARCH harness (MOBILE_HARNESS=1).
 *
 * `/app/watch` needs a session, so neither the feed that "stepped at 12" nor
 * the search control that has to be reachable from every screen could be driven
 * from a browser test. This mounts both over a fixed first deal.
 *
 * There is no signed-in user here, so a deal returns nothing — which is the
 * state most worth pinning: the feed must keep every card it already had and
 * only claim the end after several consecutive empty deals, never after one.
 *
 * A 404 in any normal build.
 */
export const dynamic = 'force-dynamic';

const FIRST_DEAL = Array.from({ length: 12 }, (_, i) => ({
  id: 1000 + i,
  mediaType: (i % 3 === 0 ? 'tv' : 'movie') as 'movie' | 'tv',
  title: `Dealt Title ${i + 1}`,
  year: 2000 + i,
  posterPath: null,
}));

export default function FeedHarness() {
  if (process.env.MOBILE_HARNESS !== '1') notFound();
  return (
    <>
      {/* Stand in for the app header, which carries the same trigger. */}
      <header className="border-b border-white/10 py-3">
        <div className="container-page flex items-center justify-between">
          <span className="font-black text-white">Harness header</span>
          <QuickSearchTrigger />
        </div>
      </header>
      <main className="container-page py-6" data-testid="feed-harness">
        <h1 className="mb-4 text-xl font-black text-white">Ruling feed — deal, append, never repeat</h1>
        <RulingFeed initial={FIRST_DEAL} />
      </main>
      <QuickSearch />
    </>
  );
}
