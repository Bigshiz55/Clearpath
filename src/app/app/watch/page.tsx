import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getReadyToWatch, getFreeToWatch } from '@/lib/watchNow';
import { getBrowseProviders } from '@/lib/browse';
import { getRecommendations, type Recommendation } from '@/lib/recommend';
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
  const [ready, free, services, providers, recs] = await Promise.all([
    getReadyToWatch(supabase, uid),
    getFreeToWatch(supabase, uid),
    getMyServices(supabase, uid),
    getBrowseProviders(region),
    // Taste-seeded picks ("because you liked …"), built from what the user has
    // rated — including the Taste Quiz. This is what actually changes after the
    // quiz, so it's the primary "for you" row (popular is the cold-start fallback).
    uid ? getRecommendations(supabase, uid) : Promise.resolve([] as Recommendation[]),
  ]);

  // Titles the user has flagged (dropped / seen) never resurface in picks.
  const { data: handledRows } = uid
    ? await supabase.from('watchlist_items').select('tmdb_id, media_type').eq('user_id', uid).in('status', ['dropped', 'watched'])
    : { data: null };
  const handled = new Set((handledRows ?? []).map((r) => `${r.media_type === 'tv' ? 'tv' : 'movie'}-${r.tmdb_id}`));
  const morePool = free.filter((f) => !handled.has(`${f.mediaType}-${f.id}`));

  // Rank the watchlist "ready" row by Taste-DNA (best fit first). The second row
  // is the taste-seeded recommender when the user has rated anything; only fall
  // back to the popularity-ranked free pool for brand-new / guest users, so the
  // list genuinely reflects the quiz instead of the same top-of-the-charts titles.
  const rankedReady = await rankByDna(supabase, uid, ready);
  const rankedMore = recs.length > 0 ? null : await rankByDna(supabase, uid, morePool);

  const readyContent = (
    <div className="space-y-8">
      {rankedReady.items.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-white">
            {rankedReady.personalized ? '🧬 Ready to watch — ranked by your VERD1CT DNA' : '▶ Ready to watch'}
          </h2>
          <p className="mb-3 text-xs text-slate-400">From your watchlist — where each one’s streaming right now.</p>
          <WatchNowGrid items={rankedReady.items} />
        </section>
      )}
      {recs.length > 0 ? (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-white">🧬 Recommended for you</h2>
          <p className="mb-3 text-xs text-slate-400">
            Seeded from the titles you rated highest — the more you rate in the{' '}
            <Link href="/app/quiz" className="text-brand-300 hover:underline">Taste Quiz</Link>, the sharper this gets. Tap any for where to watch.
          </p>
          <div className="poster-grid">
            {recs.map((r) => (
              <PosterCard
                key={`${r.mediaType}-${r.id}`}
                href={`/app/title/${r.mediaType}/${r.id}`}
                title={r.title}
                year={r.year}
                mediaType={r.mediaType}
                posterUrl={tmdbImage(r.posterPath, 'w342')}
                overlay={<SaveButton wide removeOnSave tmdbId={r.id} mediaType={r.mediaType} title={r.title} year={r.year} posterPath={r.posterPath} />}
              />
            ))}
          </div>
        </section>
      ) : (
        rankedMore && rankedMore.items.length > 0 && (
          <section>
            <h2 className="mb-1 text-lg font-semibold text-white">
              {rankedMore.personalized ? '🧬 Recommended for you' : '🍿 Popular right now'}
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              {rankedMore.personalized
                ? 'Ranked by your VERD1CT DNA — tap any to see where to watch.'
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
                  overlay={<SaveButton wide tmdbId={t.id} mediaType={t.mediaType} title={t.title} year={t.year} posterPath={t.posterPath} />}
                />
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">▶ Watch now</h1>
        <p className="mt-2 text-sm text-slate-300">
          What you can actually watch right now — with where it’s streaming and your VERD1CT score on every title.
          <span className="font-semibold text-white"> Ready to watch</span> is your list, streamable now;
          <span className="font-semibold text-white"> Browse everything</span> lets you pick any service and see what’s on it, ranked for your taste — so you know if it’s worth keeping.
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
