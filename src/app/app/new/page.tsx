import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getEpisodesWaiting } from '@/lib/servicesFeed';
import { getMyServices } from '@/lib/profile';
import { STREAMING_SERVICES } from '@/lib/services';
import { ReleaseWall, type WallService } from '@/components/ReleaseWall';
import { tmdbImage } from '@/lib/tmdb/image';
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New releases · WatchVerdict' };

// Providers offered as platform filters on the wall (the full catalog we track).
const WALL_SERVICES: WallService[] = STREAMING_SERVICES.map((s) => ({ id: s.id, name: s.name, emoji: s.emoji }));

export default async function NewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? '';
  const { t } = getServerI18n();

  const [services, waiting] = await Promise.all([
    getMyServices(supabase, uid),
    getEpisodesWaiting(supabase, uid, Date.now()),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{t('discover.new.heading')}</h1>
        <p className="mt-2 text-sm text-slate-300">{t('discover.new.intro')}</p>
      </section>

      {/* Upcoming/just-dropped episodes for shows the user already follows. */}
      {waiting.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">{t('discover.new.waitingHeading')}</h2>
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
                    <div className="grid h-full w-full place-items-center bg-white/5 text-[10px] text-slate-400">{t('discover.common.tvBadge')}</div>
                  )}
                </div>
                <div className="min-w-0 self-center">
                  <div className="line-clamp-2 text-sm font-semibold text-white">{w.title}</div>
                  <div className={`mt-1 text-xs ${w.soon ? 'text-emerald-300' : 'text-slate-300'}`}>{w.note}</div>
                </div>
              </Link>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{t('discover.new.waitingNote')}</p>
        </section>
      )}

      {/* The wall — filterable, always full, quick-look on tap. */}
      <ReleaseWall services={WALL_SERVICES} myServiceIds={services} />

      {/* Gentle personalization nudge — never blocks the content above. */}
      {services.length === 0 && (
        <section className="card flex flex-col items-start gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">{t('discover.new.makeYours')}</h2>
            <p className="mt-0.5 text-sm text-slate-300">{t('discover.new.makeYoursBody')}</p>
          </div>
          <Link href="/app/settings" className="btn-primary flex-none">{t('discover.new.pickServices')}</Link>
        </section>
      )}
    </div>
  );
}
