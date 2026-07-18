import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile, personalLabelFor, regionFor } from '@/lib/profile';
import { SearchBar } from '@/components/SearchBar';
import { getUpcomingTv } from '@/lib/onTv';
import { PosterCard } from '@/components/PosterCard';
import { EmptyState } from '@/components/EmptyState';
import { tmdbImage } from '@/lib/tmdb/client';
import { VerdictBadge } from '@/components/VerdictBadge';
import { RecommendedForYou } from '@/components/RecommendedForYou';
import { SaveButton } from '@/components/SaveButton';
import { TonightHome } from '@/components/TonightHome';
import { InstallHint } from '@/components/InstallHint';
import { getTonight } from '@/lib/tonight';
import type { VerdictTier } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface RecentVerdict {
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  year: number | null;
  poster_path: string | null;
  personal_score: number;
  tier: string;
}

export default async function DiscoverPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user ? await getProfile(supabase, user.id) : null;
  const label = profile ? personalLabelFor(profile) : 'Your match';
  const tonight = await getTonight(supabase, user?.id ?? '', new Date());
  const isGuest = user?.is_anonymous === true;

  const { data: recent } = await supabase
    .from('verdicts')
    .select('tmdb_id, media_type, title, year, poster_path, personal_score, tier')
    .order('created_at', { ascending: false })
    .limit(12);

  const verdicts = (recent as RecentVerdict[] | null) ?? [];

  // Total titles this account has reviewed — shown on the taste game.
  const { count: reviewedCount } = await supabase
    .from('verdicts')
    .select('id', { count: 'exact', head: true });

  // A quick 48-hour scan of what's coming on TV, folded into recommendations.
  const upcomingTv = (await getUpcomingTv(regionFor(profile), Date.now(), 2).catch(() => [])).slice(0, 12);

  return (
    <div className="space-y-8">
      {/* App-install nudge for testers — self-hides once installed/dismissed. */}
      <InstallHint />

      {/* Welcome + 30-second tour, right at the top. (Vintage Mode now lives in
          the top nav, where the Simple-view toggle used to be.) */}
      <TonightHome tonight={tonight} isGuest={isGuest} />

      {/* HERO — decide right here: search, ask, and every tool on one screen. */}
      <section className="animate-fade-up space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold leading-[0.95] tracking-tight text-white sm:text-6xl">
            Stop scrolling.{' '}
            <span className="bg-gradient-to-r from-brand-300 to-gold-400 bg-clip-text text-transparent">Get rolling.</span>
          </h1>
        </div>

        {/* Quick search — a title, or a plain-English ask. */}
        <div className="mx-auto max-w-2xl">
          <label className="mb-2 block text-center text-xl font-bold text-white sm:text-2xl">🔎 Search a title — or tell the judge what you want</label>
          <SearchBar />
        </div>

        {/* Big, clear tiles — every area of the app, tap to go deeper. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {[
            // Row 1
            { href: '/app/ask', icon: '⚖️', title: 'Ask the Judge', sub: 'Say what you want to see', tint: 'from-gold-500/25' },
            { href: '/app/finder', icon: '🎛️', title: 'Custom Search', sub: 'Filter by genre, rating, length…', tint: 'from-brand-500/25' },
            { href: '/app/watch', icon: '🎬', title: 'Watch Now', sub: '🧬 Your DNA picks, ranked', tint: 'from-pink-500/25' },
            // Row 2
            { href: '/app/quiz', icon: '🎮', title: 'Taste Quiz', sub: `${reviewedCount ?? 0} rated — teach your taste`, tint: 'from-gold-500/25' },
            { href: '/app/new', icon: '🆕', title: 'New Releases', sub: 'Fresh, matched to you', tint: 'from-brand-500/20' },
            { href: '/app/tv', icon: '📺', title: 'TV Guide Decoder', sub: 'What’s on live — next 48h', tint: 'from-emerald-500/20' },
            // Row 3
            { href: '/app/together', icon: '🍿', title: 'Decide Together', sub: 'One verdict for the room', tint: 'from-pink-500/25' },
            { href: '/app/watchlist', icon: '📋', title: 'Watchlist', sub: 'Everything you saved', tint: 'from-brand-500/20' },
            { href: '/app/vintage', icon: '🧓', title: 'Vintage Mode', sub: 'Big & simple to read', tint: 'from-amber-500/20' },
          ].map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`group flex min-h-[128px] flex-col justify-between rounded-2xl border border-white/12 bg-gradient-to-br ${t.tint} to-transparent p-4 transition hover:border-white/30 hover:shadow-glow sm:min-h-[150px] sm:p-5`}
            >
              <span className="text-4xl sm:text-5xl" aria-hidden>{t.icon}</span>
              <span className="mt-2">
                <span className="block text-lg font-bold text-white sm:text-xl">{t.title}</span>
                <span className="block text-sm text-slate-300">{t.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <RecommendedForYou label={label} />

      {upcomingTv.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">📺 Coming up on TV — next 48 hours</h2>
            <Link href="/app/tv" className="text-sm text-brand-300 hover:underline">
              Full guide →
            </Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {upcomingTv.map((a) => {
              const d = new Date(a.airstamp);
              const when = d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              return (
                <div key={a.id} className="w-40 flex-none rounded-xl border border-white/10 bg-white/[0.04] p-2">
                  <div className="aspect-[2/3] overflow-hidden rounded-lg bg-ink-800">
                    {a.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center p-2 text-center text-xs text-slate-400">{a.showName}</div>
                    )}
                  </div>
                  <div className="mt-1.5 line-clamp-1 text-sm font-bold text-white">{a.showName}</div>
                  <div className="text-xs font-semibold text-brand-200">{when}</div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="truncate">{a.network}</span>
                    {a.rating != null && <span className="flex-none font-bold text-gold-300">★ {a.rating.toFixed(1)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Your recent verdicts</h2>
          <Link href="/app/watchlist" className="text-sm text-brand-300 hover:underline">
            View watchlist →
          </Link>
        </div>

        {verdicts.length === 0 ? (
          <EmptyState
            title="No verdicts yet"
            description="Search above to generate your first verdict — or import everything you’ve already watched and rated in one go."
            icon={<span className="text-2xl">🍿</span>}
            action={
              <Link href="/app/import" className="btn-primary">
                Import your history
              </Link>
            }
          />
        ) : (
          <div className="poster-grid">
            {verdicts.map((v) => (
              <PosterCard
                key={`${v.media_type}-${v.tmdb_id}`}
                href={`/app/title/${v.media_type}/${v.tmdb_id}`}
                title={v.title}
                year={v.year}
                mediaType={v.media_type}
                posterUrl={tmdbImage(v.poster_path, 'w342')}
                overlay={
                  <SaveButton
                    wide
                    tmdbId={v.tmdb_id}
                    mediaType={v.media_type}
                    title={v.title}
                    year={v.year}
                    posterPath={v.poster_path}
                  />
                }
              >
                <div className="mt-2 flex items-center justify-between">
                  <VerdictBadge tier={v.tier as VerdictTier} size="sm" />
                  <span className="text-xs font-bold tabular-nums text-slate-200">{v.personal_score}</span>
                </div>
              </PosterCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
