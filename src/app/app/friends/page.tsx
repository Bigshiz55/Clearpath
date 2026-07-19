import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/profile';
import { getFollowingFeed } from '@/lib/social';
import { FindPeople } from '@/components/social/FindPeople';
import { VerdictBadge } from '@/components/VerdictBadge';
import { tmdbImage } from '@/lib/tmdb/image';
import type { VerdictTier } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Friends · WatchVrdikt' };

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default async function FriendsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? '';
  const profile = uid ? await getProfile(supabase, uid) : null;
  const feed = await getFollowingFeed(supabase);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">👥 Friends</h1>
        <p className="mt-2 text-sm text-slate-400">
          Follow people and see what they’ve been getting verdicts on. Look someone up by their username.
        </p>
        <div className="mt-4">
          <FindPeople />
        </div>
        {profile?.username ? (
          <p className="mt-2 text-xs text-slate-500">
            Your handle is <span className="font-semibold text-slate-300">@{profile.username}</span> — share it so
            friends can follow you. Turn on “public activity” in{' '}
            <Link href="/app/settings" className="text-brand-300 underline">Settings</Link> to let them see your verdicts.
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            Set a username in <Link href="/app/settings" className="text-brand-300 underline">Settings</Link> so friends can find you.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Latest from people you follow</h2>
        {feed.kind === 'needs_migration' ? (
          <p className="text-sm text-amber-300">
            The friends feed needs migration 0007 applied to the database. Once it’s in, verdicts from people you
            follow show up here.
          </p>
        ) : feed.items.length === 0 ? (
          <div className="card p-6 text-center">
            <div className="text-3xl">🫥</div>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
              Nothing here yet. Follow a few people (search above) who’ve turned on public activity, and their
              latest verdicts will land here.
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
                        @{v.username ?? 'someone'}
                      </Link>{' '}
                      · {timeAgo(v.createdAt)}
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
