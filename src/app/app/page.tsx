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
import { HomeRecommendations } from '@/components/HomeRecommendations';
import { BuildCaseBox } from '@/components/BuildCaseBox';
import { SaveButton } from '@/components/SaveButton';
import { TonightHome } from '@/components/TonightHome';
import { UpcomingTvRail } from '@/components/UpcomingTvRail';
import { InstallHint } from '@/components/InstallHint';
import { TourHint } from '@/components/onboarding/TourHint';
import { FirstRunExplainer } from '@/components/onboarding/FirstRunExplainer';
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

  /* FIRST-RUN IS A FACT, NOT A FLAG: a user with any real preference signal
     has already run. Only the genuinely-unbuilt see the explainer, and the
     component adds its own skip/don't-show-again on top. Fail-open to
     "has DNA" so a database hiccup can never nag a veteran. */
  let firstRun = false;
  if (user) {
    try {
      const { count, error } = await supabase
        .from('preference_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      firstRun = !error && (count ?? 0) === 0;
    } catch {
      firstRun = false;
    }
  }

  const { data: recent } = await supabase
    .from('verdicts')
    .select('tmdb_id, media_type, title, year, poster_path, personal_score, tier')
    .order('created_at', { ascending: false })
    .limit(12);

  const verdicts = (recent as RecentVerdict[] | null) ?? [];

  // A quick 48-hour scan of what's coming on TV, folded into recommendations.
  const upcomingTv = (await getUpcomingTv(regionFor(profile), Date.now()).catch(() => [])).slice(0, 12);

  return (
    <div className="space-y-6">
      {/* PRIMARY ASK — first thing on the screen so the input is reachable
          without scrolling on a phone. Compact hero, then the ask, then a quiet
          secondary search. */}
      <section className="animate-fade-up space-y-3">
        <h1 className="text-center text-2xl font-black leading-tight tracking-tight text-white sm:text-4xl">
          What should we watch?
        </h1>

        {/* PRIMARY move — State Your Case: the plain-English ask is the hero. */}
        <BuildCaseBox hero />

        {/* SECONDARY — already know the title? The input's own placeholder says
            what it takes, so the label above it was the same sentence twice. */}
        <div className="mx-auto max-w-xl">
          <SearchBar />
        </div>
      </section>

      {/* First-run: "60 seconds — let's build your DNA." Server-gated to
          users with no preference signal; the component carries Skip
          (session) and Don't-show-again (permanent). */}
      {firstRun && <FirstRunExplainer />}

      {/* App-install nudge for testers — self-hides once installed/dismissed. */}
      <InstallHint />

      {/* One-time pointer to the full walkthrough — self-hides once opened
          or dismissed, never returns. See TourHint.tsx. */}
      <TourHint />

      {/* Welcome + 30-second tour. */}
      <TonightHome tonight={tonight} />

      <section className="space-y-6">
        {/* Featured — The Verdict Room: the group "wow", given top billing as a
            wide, prominent card above the rest of the tiles. One product name
            only — "Live Court" used to sit here as a second, competing name
            for the same feature; the eyebrow below is purely descriptive now. */}
        <Link
          href="/app/together"
          style={{
            '--accent': '244,63,94',
            background: 'linear-gradient(120deg, rgba(255,46,154,0.22), rgba(168,85,247,0.16) 55%, rgba(9,11,18,0.6))',
            borderColor: 'rgba(255,46,154,0.4)',
          } as React.CSSProperties}
          className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/30 active:scale-[0.99] sm:gap-6 sm:p-6"
        >
          <span className="relative flex-none">
            <span aria-hidden className="pointer-events-none absolute -inset-3 rounded-full opacity-60 blur-2xl" style={{ background: 'radial-gradient(circle, rgba(255,46,154,0.7), transparent 70%)' }} />
            <TileIcon name="together" className="relative h-20 w-20 drop-shadow-[0_12px_26px_rgba(0,0,0,0.55)] transition-transform duration-300 group-hover:scale-[1.06] sm:h-24 sm:w-24" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-100">⚖️ Group decision, live</span>
            <span className="mt-1.5 block text-2xl font-black tracking-tight text-white sm:text-3xl">The Verdict Room</span>
            <span className="mt-0.5 block text-sm text-slate-200 sm:text-base">Everyone weighs in. One title wins.</span>
          </span>
          <span aria-hidden className="pointer-events-none flex-none text-2xl font-black text-brand-300 transition-transform duration-300 group-hover:translate-x-0.5 sm:text-3xl">→</span>
        </Link>

        {/* Big, clear tiles — every area of the app, tap to go deeper. Cleaned to
            distinct destinations (no Ask/Easy-Mode dupes), bigger glowing icons. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {([
            // Core loop
            { href: '/app/watch', icon: 'watch', title: 'Watch Now', sub: 'Your VERD1CT DNA picks', rgb: '244,63,94' },
            { href: '/app/taste-quiz', icon: 'quiz', title: 'Take the Taste Quiz', sub: 'Rate a few · about 5 min', rgb: '168,85,247' },
            { href: '/app/finder', icon: 'search', title: 'Forensic Search', sub: 'Filter by genre, rating, length…', rgb: '99,102,241' },
            // Discovery
            { href: '/app/new', icon: 'new', title: 'New Releases', sub: 'Fresh, matched to you', rgb: '59,130,246' },
            { href: '/app/tv', icon: 'tv', title: 'On TV Now', sub: 'What’s live — next 12/24/48h', rgb: '16,185,129' },
            { href: '/packs', icon: 'packs', title: 'Packs', sub: 'Hallmark, Lifetime & true crime', rgb: '124,58,237' },
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

      {/* The ranked shape, on the surface people actually browse — with the
          arithmetic behind every number one tap away, and "Recommended for
          you" continuing from #11 rather than repeating the same 10 titles
          twice on one screen. One fetch, no empty rail on a brand-new account. */}
      <HomeRecommendations label={label} />

      {/* Times are computed in the browser, in the viewer's own zone — see
          UpcomingTvRail. Rendering them here would print the server's clock. */}
      <UpcomingTvRail
        airings={upcomingTv.map((a) => ({
          id: a.id,
          showName: a.showName,
          network: a.network,
          image: a.image,
          rating: a.rating,
          airstamp: a.airstamp,
          time: a.time,
          runtime: a.runtime,
        }))}
      />

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
