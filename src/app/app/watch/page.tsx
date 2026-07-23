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
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Watch now · WatchVerdict' };

export default async function WatchNowPage({ searchParams }: { searchParams?: { type?: string } }) {
  // Deep link from the simple version: /app/watch?type=tv opens straight into the
  // Browse tab filtered to the chosen media type.
  const wantType = searchParams?.type === 'tv' ? 'tv' : searchParams?.type === 'movie' ? 'movie' : null;
  const { t } = getServerI18n();
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
            {rankedReady.personalized ? t('discover.watch.readyRanked') : t('discover.watch.ready')}
          </h2>
          <p className="mb-3 text-xs text-slate-400">{t('discover.watch.readyNote')}</p>
          <WatchNowGrid items={rankedReady.items} />
        </section>
      )}
      {recs.length > 0 ? (
        <section>
          <h2 className="mb-1 text-lg font-semibold text-white">{t('discover.watch.recommended')}</h2>
          <p className="mb-3 text-xs text-slate-400">
            {t('discover.watch.recSeededA')}
            <Link href="/app/quiz" className="text-brand-300 hover:underline">{t('discover.watch.tasteQuiz')}</Link>{t('discover.watch.recSeededB')}
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
              {rankedMore.personalized ? t('discover.watch.recommended') : t('discover.watch.popularNow')}
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              {rankedMore.personalized
                ? t('discover.watch.rankedDna')
                : t('discover.watch.trending')}
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
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{t('discover.watch.heading')}</h1>
        <p className="mt-2 text-sm text-slate-300">
          {t('discover.watch.subA')}
          <span className="font-semibold text-white">{t('discover.watch.readyToWatch')}</span>{t('discover.watch.subB')}
          <span className="font-semibold text-white">{t('discover.watch.browseEverything')}</span>{t('discover.watch.subC')}
        </p>
      </section>

      <WatchTabs
        ready={readyContent}
        initialTab={wantType ? 'browse' : 'ready'}
        browse={<BrowseCatalog providers={providers.map((p) => ({ id: p.id, name: p.name, logoPath: p.logoPath }))} myServiceIds={services} initialType={wantType ?? 'movie'} />}
      />

      <p className="text-[11px] text-slate-500">
        {t('discover.watch.footer', { region })}
      </p>
    </div>
  );
}
