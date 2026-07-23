import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/profile';
import { getFollowingFeed } from '@/lib/social';
import { FindPeople } from '@/components/social/FindPeople';
import { VerdictBadge } from '@/components/VerdictBadge';
import { tmdbImage } from '@/lib/tmdb/image';
import { getServerI18n } from '@/i18n/server';
import type { VerdictTier } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Friends · WatchVerdict' };

function timeAgo(iso: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 3600) return t('account.friends.minAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('account.friends.hrAgo', { n: Math.floor(s / 3600) });
  return t('account.friends.dayAgo', { n: Math.floor(s / 86400) });
}

export default async function FriendsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? '';
  const profile = uid ? await getProfile(supabase, uid) : null;
  const feed = await getFollowingFeed(supabase);
  const { t } = getServerI18n();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">👥 {t('account.friends.heading')}</h1>
        <p className="mt-2 text-sm text-slate-400">
          {t('account.friends.subtitle')}
        </p>
        <div className="mt-4">
          <FindPeople />
        </div>
        {profile?.username ? (
          <p className="mt-2 text-xs text-slate-500">
            {t('account.friends.handleIntro')} <span className="font-semibold text-slate-300">@{profile.username}</span> {t('account.friends.handleShareCta')}{' '}
            <Link href="/app/settings" className="text-brand-300 underline">{t('account.friends.settings')}</Link> {t('account.friends.handleShareTail')}
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            {t('account.friends.setUsernamePre')} <Link href="/app/settings" className="text-brand-300 underline">{t('account.friends.settings')}</Link> {t('account.friends.setUsernamePost')}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">{t('account.friends.latestHeading')}</h2>
        {feed.kind === 'needs_migration' ? (
          <p className="text-sm text-amber-300">
            {t('account.friends.needsMigration')}
          </p>
        ) : feed.items.length === 0 ? (
          <div className="card p-6 text-center">
            <div className="text-3xl">🫥</div>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
              {t('account.friends.empty')}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {feed.items.map((v, i) => (
              <li key={`${v.userId}-${v.mediaType}-${v.tmdbId}-${i}`}>
                <Link
                  href={`/app/title/${v.mediaType}/${v.tmdbId}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10"
                >
                  <div className="h-16 w-11 flex-none overflow-hidden rounded-md border border-white/10">
                    {tmdbImage(v.posterPath, 'w185') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={tmdbImage(v.posterPath, 'w185')!} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-white/5 text-[10px] text-slate-500">
                        {v.mediaType === 'tv' ? 'TV' : '🎬'}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-400">
                      <Link href={`/app/u/${v.username}`} className="font-semibold text-brand-300 hover:underline">
                        @{v.username ?? t('account.friends.someone')}
                      </Link>{' '}
                      · {timeAgo(v.createdAt, t)}
                    </div>
                    <div className="line-clamp-1 text-sm font-semibold text-white">
                      {v.title} {v.year ? <span className="font-normal text-slate-400">({v.year})</span> : null}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <VerdictBadge tier={v.tier as VerdictTier} size="sm" />
                      <span className="text-xs font-bold tabular-nums text-slate-300">{v.personalScore}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
