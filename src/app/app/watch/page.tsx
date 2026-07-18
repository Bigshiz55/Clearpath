import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getReadyToWatch, getFreeToWatch } from '@/lib/watchNow';
import { getBrowseProviders } from '@/lib/browse';
import { rankByDna } from '@/lib/dna';
import { getMyServices, getProfile, regionFor } from '@/lib/profile';
import { WatchNowGrid } from '@/components/WatchNowGrid';
import { WatchTabs } from '@/components/WatchTabs';
import { BrowseCatalog } from '@/components/BrowseCatalog';
import { PosterCard } from '@/components/PosterCard';
import { SaveButton } from '@/components/SaveButton';
import { tmdbImage } from '@/lib/tmdb/image';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Watch now · WatchVerdict' };

export default async function WatchNowPage({ searchParams }: { searchParams?: { type?: string } }) {
  // Deep link from the simple version: /app/watch?type=tv opens straight into the
  // Browse tab filtered to the chosen media type.
  const wantType = searchParams?.type === 'tv' ? 'tv' : searchParams?.type === 'movie' ? 'movie' : null;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? '';

  const region = regionFor(user ? await getProfile(supabase, uid) : null);
  const [ready, free, services, providers] = await Promise.all([
    getReadyToWatch(supabase, uid),
    getFreeToWatch(supabase, uid),
    getMyServices(supabase, uid),
    getBrowseProviders(region),
  ]);

  const onMine = ready.filter((r) => r.kind === 'mine');
  const onFree = ready.filter((r) => r.kind === 'free');

  // Titles the user has flagged (dropped / seen) never resurface in picks.
  const { data: handledRows } = uid
    ? await supabase.from('watchlist_items').select('tmdb_id, media_type').eq('user_id', uid).in('status', ['dropped', 'watched'])
    : { data: null };
  const handled = new Set((handledRows ?? []).map((r) => `${r.media_type === 'tv' ? 'tv' : 'movie'}-${r.tmdb_id}`));
  const freePool = free.filter((f) => !handled.has(`${f.mediaType}-${f.id}`));

  // Rank every Watch Now pool by the user's Taste-DNA (best fit first) so the
  // whole page delivers on its DNA promise. rankByDna no-ops (original order,
  // personalized:false) for guests or users without enough rating history yet.
  const [rankedMine, rankedOnFree, rankedFree] = await Promise.all([
    rankByDna(supabase, uid, onMine),
    rankByDna(supabase, uid, onFree),
    rankByDna(supabase, uid, freePool),
  ]);

  const readyContent = (
    <div className="space-y-8">
      {rankedMine.items.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-white">
            {rankedMine.personalized ? '🧬 On your services — ranked by your DNA' : '✅ On your services'}
          </h2>
          <p className="mb-3 text-xs text-slate-400">From your watchlist, included in a plan you already have.</p>
          <WatchNowGrid items={rankedMine.items} />
        </section>
      )}
      {rankedOnFree.items.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-white">
            {rankedOnFree.personalized ? '🧬 Free right now — ranked by your DNA' : '🆓 Free right now'}
          </h2>
          <p className="mb-3 text-xs text-slate-400">From your watchlist, streaming free (with ads) today.</p>
          <WatchNowGrid items={rankedOnFree.items} />
        </section>
      )}
      {rankedFree.items.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-white">
            {rankedFree.personalized ? '🧬 Your DNA picks — free tonight' : '🍿 Free to watch tonight'}
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            {rankedFree.personalized
              ? 'Free, ad-supported titles — ranked by how well they fit your Taste-DNA. No subscription needed.'
              : 'Popular right now on the free, ad-supported services — no subscription needed.'}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {rankedFree.items.map((t) => (
              <PosterCard
                key={`${t.mediaType}-${t.id}`}
                href={`/app/title/${t.mediaType}/${t.id}`}
                title={t.title}
                year={t.year}
                mediaType={t.mediaType}
                posterUrl={tmdbImage(t.posterPath, 'w342')}
                overlay={<SaveButton tmdbId={t.id} mediaType={t.mediaType} title={t.title} year={t.year} posterPath={t.posterPath} />}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">▶ Watch now</h1>
        <p className="mt-2 text-sm text-slate-300">
          Find something to watch by where it’s streaming — filtered to any service, in any price tier — with your
          personalized verdict on every result. <span className="font-semibold text-white">Ready to watch</span> is
          your list, already streamable; <span className="font-semibold text-white">Browse everything</span> is the
          whole catalog.
        </p>
      </section>

      <WatchTabs
        ready={readyContent}
        initialTab={wantType ? 'browse' : 'ready'}
        browse={<BrowseCatalog providers={providers.map((p) => ({ id: p.id, name: p.name, logoPath: p.logoPath }))} myServiceIds={services} initialType={wantType ?? 'movie'} />}
      />

      <p className="text-[11px] text-slate-500">
        Availability from TMDB / JustWatch for {region} — real data, refreshed periodically, never guaranteed
        current. We only show titles we can confirm are watchable.
      </p>
    </div>
  );
}
