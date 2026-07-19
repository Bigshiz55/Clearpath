import { createClient } from '@/lib/supabase/server';
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
    .select('id, tmdb_id, media_type, title, year, poster_path, status, rating, notes, priority, added_at, watched_at')
    .eq('user_id', user?.id ?? '')
    .order('added_at', { ascending: false });

  const items = (data as WatchlistItem[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Your watchlist</h1>
        <p className="mt-1 text-sm text-slate-400">Everything you’ve saved — search it, sort it, and ⭐ star your Favorites.</p>
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
