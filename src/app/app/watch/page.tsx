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

  // Rank the free-tonight pool by the user's Taste-DNA (best fit first) so
  // "Watch Now" delivers on its DNA promise. Falls back to the original order
  // for users without enough rating history yet.
  const { items: rankedFree, personalized: freeByDna } = user
    ? await rankByDna(supabase, uid, free)
    : { items: free.map((f) => ({ ...f, dnaFit: null })), personalized: false };

  const readyContent = (
    <div className="space-y-8">
      {onMine.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-white">✅ On your services</h2>
          <p className="mb-3 text-xs text-slate-400">From your watchlist, included in a plan you already have.</p>
          <WatchNowGrid items={onMine} />
        </section>
      )}
      {onFree.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-white">🆓 Free right now</h2>
          <p className="mb-3 text-xs text-slate-400">From your watchlist, streaming free (with ads) today.</p>
          <WatchNowGrid items={onFree} />
        </section>
      )}
      {rankedFree.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-white">
            {freeByDna ? '🧬 Your DNA picks — free tonight' : '🍿 Free to watch tonight'}
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            {freeByDna
              ? 'Free, ad-supported titles — ranked by how well they fit your Taste-DNA. No subscription needed.'
              : 'Popular right now on the free, ad-supported services — no subscription needed.'}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {rankedFree.map((t) => (
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
