import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getNewOnServices, getEpisodesWaiting } from '@/lib/servicesFeed';
import { getMyServices } from '@/lib/profile';
import { STREAMING_SERVICES } from '@/lib/services';
import { PosterCard } from '@/components/PosterCard';
import { SaveButton } from '@/components/SaveButton';
import { tmdbImage } from '@/lib/tmdb/image';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New for your plans · WatchVerdict' };

export default async function NewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? '';

  const services = await getMyServices(supabase, uid);
  const [feed, waiting] = await Promise.all([
    getNewOnServices(supabase, uid),
    getEpisodesWaiting(supabase, uid, Date.now()),
  ]);

  const serviceNames = services
    .map((id) => STREAMING_SERVICES.find((s) => s.id === id || s.ids.includes(id))?.name)
    .filter(Boolean);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">🆕 New for your plans</h1>
        <p className="mt-2 text-sm text-slate-400">
          Fresh arrivals you can actually stream — filtered to the services you pay for. Every title is
          one tap from its verdict.
        </p>
        {serviceNames.length > 0 && (
          <div className="mt-2 text-xs text-slate-500">Watching: {serviceNames.join(' · ')}</div>
        )}
      </section>

      {services.length === 0 ? (
        <div className="card p-6 text-center">
          <div className="text-3xl">📺</div>
          <h2 className="mt-3 text-lg font-semibold text-white">Tell us your streaming services</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            Pick what you subscribe to and this page fills with new titles you can start tonight — no rentals,
            no dead ends.
          </p>
          <Link href="/app/settings" className="btn-primary mt-4 inline-flex">
            Pick my services
          </Link>
        </div>
      ) : (
        <>
          {waiting.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-white">📺 Waiting for you</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {waiting.map((w) => (
                  <Link
                    key={w.id}
                    href={`/app/title/tv/${w.id}`}
                    className="group flex gap-3 rounded-xl border border-white/10 bg-white/5 p-2.5 transition hover:bg-white/10"
                  >
                    <div className="h-20 w-14 flex-none overflow-hidden rounded-md border border-white/10">
                      {tmdbImage(w.posterPath, 'w185') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={tmdbImage(w.posterPath, 'w185')!} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="grid h-full w-full place-items-center bg-white/5 text-[10px] text-slate-500">TV</div>
                      )}
                    </div>
                    <div className="min-w-0 self-center">
                      <div className="line-clamp-2 text-sm font-semibold text-white">{w.title}</div>
                      <div className={`mt-1 text-xs ${w.soon ? 'text-emerald-300' : 'text-slate-400'}`}>{w.note}</div>
                    </div>
                  </Link>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Based on real TMDB air dates for shows on your watchlist — we never invent an episode count.
              </p>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-semibold text-white">Just added on your services</h2>
            {feed.items.length === 0 ? (
              <p className="text-sm text-slate-400">
                Nothing new turned up on your services in the last few months. Check back soon, or{' '}
                <Link href="/app/mood" className="text-brand-300 underline">browse by mood</Link>.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {feed.items.map((t) => (
                  <PosterCard
                    key={`${t.mediaType}-${t.id}`}
                    href={`/app/title/${t.mediaType}/${t.id}`}
                    title={t.title}
                    year={t.year}
                    mediaType={t.mediaType}
                    posterUrl={tmdbImage(t.posterPath, 'w342')}
                    overlay={
                      <SaveButton tmdbId={t.id} mediaType={t.mediaType} title={t.title} year={t.year} posterPath={t.posterPath} />
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
