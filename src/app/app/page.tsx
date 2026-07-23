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
import { BuildCaseBox } from '@/components/BuildCaseBox';
import { Tagline } from '@/components/Tagline';
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

  const { data: recent } = await supabase
    .from('verdicts')
    .select('tmdb_id, media_type, title, year, poster_path, personal_score, tier')
    .order('created_at', { ascending: false })
    .limit(12);

  const verdicts = (recent as RecentVerdict[] | null) ?? [];

  // A quick 48-hour scan of what's coming on TV, folded into recommendations.
  const upcomingTv = (await getUpcomingTv(regionFor(profile), Date.now()).catch(() => [])).slice(0, 12);

  return (
    <div className="space-y-8">
      {/* The promise — a calm supporting strip so it frames the hero ask below
          rather than competing with it for attention. */}
      <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-2.5 text-center">
        <p className="text-sm font-semibold tracking-tight text-sky-100 sm:text-base">
          We earn your subscription. We don’t trick you into one.
        </p>
      </div>

      {/* App-install nudge for testers — self-hides once installed/dismissed. */}
      <InstallHint />

      {/* Welcome + 30-second tour, right at the top. (Vintage Mode now lives in
          the top nav, where the Simple-view toggle used to be.) */}
      <TonightHome tonight={tonight} />

      {/* HERO — decide right here: search, ask, and every tool on one screen. */}
      <section className="animate-fade-up space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold leading-[0.95] tracking-tight text-white sm:text-6xl">
            Stop scrolling.{' '}
            <span className="bg-gradient-to-r from-brand-300 to-gold-400 bg-clip-text text-transparent">Get rolling.</span>
          </h1>
          <Tagline className="mt-4 text-2xl sm:text-4xl" />
        </div>

        {/* PRIMARY move — State Your Case: the plain-English ask is the hero. */}
        <BuildCaseBox hero />

        {/* SECONDARY — already know the title? A quiet, smaller search. */}
        <div className="mx-auto max-w-xl">
          <label className="mb-1.5 block text-center text-sm font-semibold text-slate-400">
            Already know what you want? Search a title, actor, or platform
          </label>
          <SearchBar />
        </div>

        {/* Decide Together (Live Court) — a supporting strip. It also lives in
            the primary nav now, so it no longer needs hero-scale billing here;
            kept as a compact, on-brand entry so the ask box stays dominant. */}
        <Link
          href="/app/together"
          style={{
            '--accent': '244,63,94',
            background: 'linear-gradient(120deg, rgba(255,46,154,0.16), rgba(168,85,247,0.12) 55%, rgba(9,11,18,0.5))',
            borderColor: 'rgba(255,46,154,0.32)',
          } as React.CSSProperties}
          className="group relative flex items-center gap-3 overflow-hidden rounded-xl border p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25 active:scale-[0.99] sm:gap-4"
        >
          <TileIcon name="together" className="h-11 w-11 flex-none drop-shadow-[0_8px_18px_rgba(0,0,0,0.5)] transition-transform duration-300 group-hover:scale-[1.06] sm:h-12 sm:w-12" />
          <span className="min-w-0 flex-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-brand-100">⚖️ Live Court</span>
            <span className="block text-base font-black tracking-tight text-white sm:text-lg">Decide Together</span>
            <span className="line-clamp-1 block text-xs text-slate-300 sm:text-sm">One verdict for the whole room — everyone votes from their own phone.</span>
          </span>
          <span aria-hidden className="pointer-events-none flex-none text-xl font-black text-brand-300 transition-transform duration-300 group-hover:translate-x-0.5">→</span>
        </Link>

        {/* Big, clear tiles — every area of the app, tap to go deeper. Cleaned to
            distinct destinations (no Ask/Easy-Mode dupes), bigger glowing icons. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {([
            // Core loop
            { href: '/app/watch', icon: 'watch', title: 'Watch Now', sub: 'Your VERD1CT DNA picks', rgb: '244,63,94' },
            { href: '/app/quiz', icon: 'quiz', title: 'Take the Taste Quiz', sub: 'Rate a few · about 5 min', rgb: '168,85,247' },
            { href: '/app/finder', icon: 'search', title: 'Forensic Search', sub: 'Filter by genre, rating, length…', rgb: '99,102,241' },
            // Discovery
            { href: '/app/new', icon: 'new', title: 'New Releases', sub: 'Fresh, matched to you', rgb: '59,130,246' },
            { href: '/app/tv', icon: 'tv', title: 'On TV Now', sub: 'What’s live — next 12/24/48h', rgb: '16,185,129' },
            // Your stuff
            { href: '/app/watchlist', icon: 'watchlist', title: 'Watchlist', sub: 'Everything you saved', rgb: '14,165,233' },
            { href: '/app/subscriptions', icon: 'money', title: 'Subscription Check', sub: 'Where you overpay for streaming', rgb: '16,185,129' },
          ] as const).map((t) => (
            <Link
              key={t.href}
              href={t.href}
              style={{
                '--accent': t.rgb,
                background: 'linear-gradient(150deg, rgba(var(--accent),0.18), rgba(9,11,18,0.55))',
                borderColor: 'rgba(var(--accent),0.32)',
              } as React.CSSProperties}
              className="group relative flex min-h-[168px] flex-col justify-between overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-1 hover:border-white/25 active:scale-[0.98] sm:min-h-[200px] sm:p-5"
            >
              <span className="relative inline-flex flex-none">
                {/* Soft accent glow so the icon pops. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-3 rounded-full opacity-45 blur-2xl transition-opacity duration-300 group-hover:opacity-70"
                  style={{ background: 'radial-gradient(circle, rgba(var(--accent),0.65), transparent 70%)' }}
                />
                <TileIcon
                  name={t.icon}
                  className="relative h-[72px] w-[72px] drop-shadow-[0_10px_22px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-[1.08] sm:h-24 sm:w-24"
                />
              </span>
              <span className="mt-3">
                <span className="block text-xl font-black leading-tight tracking-tight text-white sm:text-2xl">{t.title}</span>
                <span className="mt-0.5 block text-sm font-semibold text-slate-300">{t.sub}</span>
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
