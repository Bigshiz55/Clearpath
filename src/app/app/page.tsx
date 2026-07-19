import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile, personalLabelFor, regionFor } from '@/lib/profile';
import { SearchBar } from '@/components/SearchBar';
import { TileIcon } from '@/components/TileIcon';
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
  const upcomingTv = (await getUpcomingTv(regionFor(profile), Date.now()).catch(() => [])).slice(0, 12);

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
          {([
            // Row 1 — rgb = the tile's accent colour, drives glow/halo/spotlight.
            { href: '/app/watch', icon: 'watch', title: 'Watch Now', sub: 'Your DNA picks, ranked', chip: 'from-pink-500 to-rose-600', rgb: '244,63,94' },
            { href: '/app/ask', icon: 'judge', title: 'Ask the Judge', sub: 'Say what you want to see', chip: 'from-amber-400 to-orange-600', rgb: '245,158,11' },
            { href: '/app/finder', icon: 'search', title: 'Custom Search', sub: 'Filter by genre, rating, length…', chip: 'from-indigo-500 to-blue-600', rgb: '99,102,241' },
            // Row 2
            { href: '/app/quiz', icon: 'quiz', title: 'Taste Quiz', sub: `${reviewedCount ?? 0} rated — teach your taste`, chip: 'from-violet-500 to-fuchsia-600', rgb: '168,85,247' },
            { href: '/app/new', icon: 'new', title: 'New Releases', sub: 'Fresh, matched to you', chip: 'from-blue-500 to-indigo-600', rgb: '59,130,246' },
            { href: '/app/tv', icon: 'tv', title: 'TV Guide Decoder', sub: 'What’s on live — next 48h', chip: 'from-emerald-500 to-teal-600', rgb: '16,185,129' },
            // Row 3
            { href: '/app/together', icon: 'together', title: 'Decide Together', sub: 'One verdict for the room', chip: 'from-rose-500 to-pink-600', rgb: '244,63,94' },
            { href: '/app/watchlist', icon: 'watchlist', title: 'Watchlist', sub: 'Everything you saved', chip: 'from-sky-500 to-blue-600', rgb: '14,165,233' },
            { href: '/app/vintage', icon: 'easy', title: 'Easy Mode', sub: 'Big & simple to read', chip: 'from-amber-400 to-orange-600', rgb: '245,158,11' },
          ] as const).map((t) => (
            <Link
              key={t.href}
              href={t.href}
              style={{ '--accent': t.rgb } as React.CSSProperties}
              className="group relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-ink-900/60 p-4 transition-all duration-300 hover:-translate-y-1.5 hover:border-white/25 hover:shadow-[0_24px_60px_-18px_rgba(var(--accent),0.55)] sm:min-h-[172px] sm:p-5"
            >
              {/* Corner colour spotlight — brightens on hover. */}
              <span
                aria-hidden
                className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full opacity-40 blur-2xl transition-opacity duration-500 group-hover:opacity-90"
                style={{ background: 'radial-gradient(circle, rgba(var(--accent),0.6), transparent 70%)' }}
              />
              {/* Base tint wash. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-70 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: 'linear-gradient(135deg, rgba(var(--accent),0.16), transparent 60%)' }}
              />
              {/* Diagonal shine sweep on hover. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 -left-3/4 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/12 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[280%]"
              />

              <span
                className={`relative grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-2xl bg-gradient-to-br ${t.chip} text-white ring-1 ring-inset ring-white/30 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-110 sm:h-16 sm:w-16`}
                style={{ boxShadow: '0 10px 26px -6px rgba(var(--accent),0.7)' }}
              >
                {/* Top gloss highlight. */}
                <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent" />
                <TileIcon name={t.icon} className="relative h-7 w-7 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] sm:h-8 sm:w-8" />
              </span>

              <span className="relative mt-3">
                <span className="block text-lg font-extrabold tracking-tight text-white sm:text-xl">{t.title}</span>
                <span className="block text-sm text-slate-400">{t.sub}</span>
              </span>

              {/* Hover chevron. */}
              <span
                aria-hidden
                className="pointer-events-none absolute bottom-4 right-4 translate-x-1 text-lg font-black opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 sm:bottom-5 sm:right-5"
                style={{ color: 'rgb(var(--accent))' }}
              >
                →
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
