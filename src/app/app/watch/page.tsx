import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getReadyToWatch, getFreeToWatch } from '@/lib/watchNow';
import { getBrowseProviders } from '@/lib/browse';
import { getRecommendations, type Recommendation } from '@/lib/recommend';
import { recommendationHeading } from '@/lib/verdict/confidence';
import { getUserTasteDna, rankByDna } from '@/lib/dna';
import { getMyServices, getProfile, regionFor } from '@/lib/profile';
import { WatchNowGrid } from '@/components/WatchNowGrid';
import { WatchTabs } from '@/components/WatchTabs';
import { BrowseCatalog } from '@/components/BrowseCatalog';
import { PosterCard } from '@/components/PosterCard';
import { SaveButton } from '@/components/SaveButton';
import { RulingFeed } from '@/components/RulingFeed';
import { BATCH, minScoreFor } from '@/lib/reco/deck';
import { tmdbImage } from '@/lib/tmdb/image';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Watch now · WatchVerd1ct' };

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
    // The deck's first deal, with the same knobs `dealRulingBatch` uses, so
    // deal two continues deal one instead of being a differently-seeded list
    // that happens to overlap it.
    uid
      ? getRecommendations(supabase, uid, {
          limit: BATCH,
          candidatePool: BATCH + 36,
          seedLimit: 10,
          minScore: minScoreFor(1),
        })
      : Promise.resolve([] as Recommendation[]),
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
  // HOW MUCH OF THIS USER WE ACTUALLY KNOW. Drives the honest heading below —
  // the row says "Popular picks while we learn your taste" until there is
  // genuinely enough signal to call it personal. Fail-open to 0 (the most
  // conservative claim) rather than letting a DNA read break the page.
  const ratedCount = uid ? await getUserTasteDna(supabase, uid).then((d) => d.sampleSize).catch(() => 0) : 0;
  const recsHeading = recommendationHeading(ratedCount, recs.length > 0);

  // NEVER A SILENT BLANK TAB. Every branch below is conditional on real data
  // — a TMDB outage the free-titles lookup fails open into (discoverTitles
  // swallows its own errors and returns []), or a brand-new guest with an
  // empty watchlist and no recommendations yet, could previously leave this
  // whole tab rendering nothing at all: no heading, no message, no way
  // forward. This is the one explicit fallback for that case.
  const readyIsEmpty = rankedReady.items.length === 0 && recs.length === 0 && (!rankedMore || rankedMore.items.length === 0);

  const readyContent = (
    <div className="space-y-8">
      {readyIsEmpty && (
        <section className="card p-6 text-center" data-testid="watch-now-empty">
          <p className="text-sm font-semibold text-white">We couldn&rsquo;t put together picks right now.</p>
          <p className="mt-1 text-sm text-slate-400">
            This is usually a temporary hiccup reaching our title data, not an empty catalog.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <a href="/app/watch" className="btn-secondary inline-flex">
              ↻ Try again
            </a>
            <Link href="/app/taste-quiz" className="btn-secondary inline-flex">
              Build your Watch DNA
            </Link>
          </div>
        </section>
      )}
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
          {/* HONEST HEADING. "Recommended for you" over a list built from four
              ratings is the single most common lie a recommender tells. The
              heading and the note come from `recommendationHeading`, which
              reads the user's REAL rated count and says what the row actually
              is — plus exactly how many more ratings unlock the personal
              match. It upgrades itself the moment the threshold is crossed. */}
          <h2 className="mb-1 text-lg font-semibold text-white" data-testid="recs-heading">
            🧬 {recsHeading.heading}
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            {recsHeading.note}{' '}
            <Link href="/app/taste-quiz" className="text-brand-300 hover:underline">Rate a few in the Taste Quiz</Link>{' '}
            to sharpen it. Tap any for where to watch.
          </p>
          {/* A DECK, NOT A PAGE. This used to be a fixed slice of twelve that
              re-sorted itself every time the user's own taps changed their
              profile, and that could re-deal a title it had already shown.
              The feed appends, never reorders, and keeps going. */}
          <RulingFeed
            initial={recs.map((r) => ({ id: r.id, mediaType: r.mediaType, title: r.title, year: r.year, posterPath: r.posterPath }))}
          />
        </section>
      ) : (
        rankedMore && rankedMore.items.length > 0 && (
          <section>
            {/* Same honest gate on the fallback row: a popularity ranking never
                claims to be personal, and a thin model says how thin it is. */}
            <h2 className="mb-1 text-lg font-semibold text-white" data-testid="recs-heading">
              {rankedMore.personalized ? '🧬' : '🍿'}{' '}
              {recommendationHeading(ratedCount, rankedMore.personalized).heading}
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              {recommendationHeading(ratedCount, rankedMore.personalized).note} Tap any to see where to watch.
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
