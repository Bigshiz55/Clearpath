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

  // Titles the user has flagged (dropped / seen) never resurface in picks.
  const { data: handledRows } = uid
    ? await supabase.from('watchlist_items').select('tmdb_id, media_type').eq('user_id', uid).in('status', ['dropped', 'watched'])
    : { data: null };
  const handled = new Set((handledRows ?? []).map((r) => `${r.media_type === 'tv' ? 'tv' : 'movie'}-${r.tmdb_id}`));
  const morePool = free.filter((f) => !handled.has(`${f.mediaType}-${f.id}`));

  // Rank by the user's Taste-DNA (best fit first). rankByDna no-ops (original
  // order, personalized:false) for guests or users without enough history yet.
  const [rankedReady, rankedMore] = await Promise.all([
    rankByDna(supabase, uid, ready),
    rankByDna(supabase, uid, morePool),
  ]);

  const readyContent = (
    <div className="space-y-8">
      {rankedReady.items.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-white">
            {rankedReady.personalized ? '🧬 Ready to watch — ranked by your DNA' : '▶ Ready to watch'}
          </h2>
          <p className="mb-3 text-xs text-slate-400">From your watchlist — where each one’s streaming right now.</p>
          <WatchNowGrid items={rankedReady.items} />
        </section>
      )}
      {rankedMore.items.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-white">
            {rankedMore.personalized ? '🧬 Recommended for you' : '🍿 Popular right now'}
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            {rankedMore.personalized
              ? 'Ranked by your Taste-DNA — tap any to see where to watch.'
              : 'Trending titles you can stream right now — tap any for where to watch.'}
          </p>
          <div className="poster-grid">
            {rankedMore.items.map((t) => (
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
          What you can actually watch right now — with where it’s streaming and your DNA Score on every title.
          <span className="font-semibold text-white"> Ready to watch</span> is your list, streamable now;
          <span className="font-semibold text-white"> Browse everything</span> is the whole catalog.
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
