import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile, personalLabelFor, getMyServices, regionFor } from '@/lib/profile';
import { SearchBar } from '@/components/SearchBar';
import { FinderUI, type WatcherOption } from '@/components/FinderUI';
import { listCrews } from '@/lib/actions/crews';
import { getBrowseProviders } from '@/lib/browse';
import { getUpcomingTv } from '@/lib/onTv';
import { PosterCard } from '@/components/PosterCard';
import { EmptyState } from '@/components/EmptyState';
import { tmdbImage } from '@/lib/tmdb/client';
import { VerdictBadge } from '@/components/VerdictBadge';
import { RecommendedForYou } from '@/components/RecommendedForYou';
import { SaveButton } from '@/components/SaveButton';
import { TonightHome } from '@/components/TonightHome';
import { getTonight } from '@/lib/tonight';
import { CourtroomDoors } from '@/components/CourtroomDoors';
import { TvDetective } from '@/components/TvDetective';
import { getActiveJudge, type Judge } from '@/lib/sponsors';
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

  let judge: Judge | null = null;
  if (user) {
    try {
      judge = await getActiveJudge(supabase, { region: regionFor(profile), nowMs: Date.now() });
    } catch {
      /* sponsors optional / pre-migration */
    }
  }

  // For the on-home finder tools: the user's services (for "only on my services")
  // and any crew members to score against ("who's watching").
  const services = user ? await getMyServices(supabase, user.id) : [];
  const providerCatalog = await getBrowseProviders(regionFor(profile)).catch(() => []);
  const topProviders = providerCatalog.slice(0, 60).map((p) => ({ id: p.id, name: p.name }));
  const watchers: WatcherOption[] = [];
  try {
    const { crews } = await listCrews();
    const seen = new Set<string>();
    for (const c of crews ?? []) {
      for (const p of c.people) {
        const key = p.name.toLowerCase();
        if (seen.has(key) || (p.love.length === 0 && p.avoid.length === 0)) continue;
        seen.add(key);
        watchers.push({ name: p.name, love: p.love, avoid: p.avoid });
      }
    }
  } catch {
    /* crews optional */
  }

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
      {/* Vintage Mode — a genuinely simple one-page experience for seniors. */}
      <div className="flex justify-center">
        <Link
          href="/app/vintage"
          className="inline-flex items-center gap-3 rounded-full border-2 border-amber-400/50 bg-amber-500/10 px-6 py-3 text-lg font-bold text-amber-100 transition hover:bg-amber-500/20"
        >
          <span className="text-2xl" aria-hidden>🧓</span> Vintage Mode — big &amp; simple
        </Link>
      </div>

      {/* Welcome + 30-second tour, right at the top. */}
      <TonightHome tonight={tonight} isGuest={isGuest} />

      {/* HERO — decide right here: search, ask, and every tool on one screen. */}
      <section className="animate-fade-up space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold leading-[0.95] tracking-tight text-white sm:text-6xl">
            Stop scrolling.{' '}
            <span className="bg-gradient-to-r from-brand-300 to-gold-400 bg-clip-text text-transparent">Get rolling.</span>
          </h1>
        </div>

        {/* Judge avatar (left) · Search titles (center, narrower) · Prepare-for-Court game (right) */}
        <div className="mx-auto flex max-w-4xl flex-col items-stretch gap-4 md:flex-row md:items-center">
          <span
            className="mx-auto grid h-16 w-16 flex-none place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-gold-500 text-4xl shadow-glow ring-2 ring-gold-300/60 md:mx-0"
            aria-label="The judge"
          >
            ⚖️
          </span>
          <div className="min-w-0 flex-1">
            <label className="mb-2 block text-center text-2xl font-extrabold text-white">🔎 Search titles</label>
            <SearchBar />
          </div>
          <Link
            href="/app/quiz"
            className="flex flex-none items-center gap-3 rounded-2xl border border-gold-400/50 bg-gradient-to-br from-gold-500/20 to-brand-500/10 px-5 py-4 text-left transition hover:border-gold-400/80 md:max-w-[210px] md:flex-col md:text-center"
          >
            <span className="text-3xl" aria-hidden>🎬</span>
            <span>
              <span className="block text-base font-black text-white">The Taste Game</span>
              <span className="block text-xs text-slate-300">Rate fast — teach the judge your taste</span>
              <span className="mt-1 block text-sm font-bold text-gold-300">{reviewedCount ?? 0} reviewed</span>
            </span>
          </Link>
        </div>

        {/* Ask the judge — bigger */}
        <div>
          <div className="mb-3 flex items-center gap-2 text-2xl font-extrabold text-white sm:text-3xl">
            <span aria-hidden>⚖️</span> Ask the judge
          </div>
          <FinderUI embedded hasServices={services.length > 0} watchers={watchers} initialJudge={judge} providers={topProviders} />
        </div>

        {/* TV Guide Detective (left) + Can't-decide court (right) — big, side by side */}
        <div className="grid gap-6 lg:grid-cols-2">
          <TvDetective />
          <CourtroomDoors initialJudge={judge} />
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
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
