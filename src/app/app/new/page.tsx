import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getNewOnServices, getEpisodesWaiting, getNewReleaseWall } from '@/lib/servicesFeed';
import { getMyServices } from '@/lib/profile';
import { STREAMING_SERVICES } from '@/lib/services';
import { PosterCard } from '@/components/PosterCard';
import { SaveButton } from '@/components/SaveButton';
import { tmdbImage } from '@/lib/tmdb/image';
import type { FeedItem } from '@/lib/servicesFeed';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New releases · WatchVerdict' };

function Wall({ items }: { items: FeedItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {items.map((t) => (
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
  );
}

export default async function NewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? '';

  const services = await getMyServices(supabase, uid);
  const [wall, feed, waiting] = await Promise.all([
    getNewReleaseWall(supabase, uid),
    getNewOnServices(supabase, uid),
    getEpisodesWaiting(supabase, uid, Date.now()),
  ]);

  const serviceNames = services
    .map((id) => STREAMING_SERVICES.find((s) => s.id === id || s.ids.includes(id))?.name)
    .filter(Boolean);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">🆕 New releases</h1>
        <p className="mt-2 text-sm text-slate-300">
          The freshest movies and shows out now — every poster is one tap from its verdict.
          {services.length === 0 && ' Add your services to spotlight the ones you can stream tonight.'}
        </p>
        {serviceNames.length > 0 && (
          <div className="mt-2 text-xs text-slate-400">Spotlighting: {serviceNames.join(' · ')}</div>
        )}
      </section>

      {/* Upcoming/just-dropped episodes for shows the user is already following. */}
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
                    <div className="grid h-full w-full place-items-center bg-white/5 text-[10px] text-slate-400">TV</div>
                  )}
                </div>
                <div className="min-w-0 self-center">
                  <div className="line-clamp-2 text-sm font-semibold text-white">{w.title}</div>
                  <div className={`mt-1 text-xs ${w.soon ? 'text-emerald-300' : 'text-slate-300'}`}>{w.note}</div>
                </div>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Based on real TMDB air dates for shows on your watchlist — we never invent an episode count.
          </p>
        </section>
      )}

      {/* On your services — only when services are set and something new is there. */}
      {feed.items.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">✅ New on your services</h2>
          <Wall items={feed.items} />
        </section>
      )}

      {/* The wall — always present, gated by nothing. */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">
          {feed.items.length > 0 ? 'Everything new right now' : 'Fresh this season'}
        </h2>
        {wall.length > 0 ? (
          <Wall items={wall} />
        ) : (
          <p className="text-sm text-slate-400">
            Couldn’t reach the release feed just now. Try again shortly, or{' '}
            <Link href="/app/mood" className="text-brand-300 underline">browse by mood</Link>.
          </p>
        )}
      </section>

      {/* Gentle personalization nudge — never blocks the content above. */}
      {services.length === 0 && (
        <section className="card flex flex-col items-start gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Make this yours</h2>
            <p className="mt-0.5 text-sm text-slate-300">
              Tell us your streaming services and we’ll spotlight the new titles you can start tonight — no rentals, no dead ends.
            </p>
          </div>
          <Link href="/app/settings" className="btn-primary flex-none">Pick my services</Link>
        </section>
      )}
    </div>
  );
}
