import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile, personalLabelFor, getMyServices, regionFor } from '@/lib/profile';
import { SearchBar } from '@/components/SearchBar';
import { FinderUI, type WatcherOption } from '@/components/FinderUI';
import { listCrews } from '@/lib/actions/crews';
import { PosterCard } from '@/components/PosterCard';
import { EmptyState } from '@/components/EmptyState';
import { tmdbImage } from '@/lib/tmdb/client';
import { VerdictBadge } from '@/components/VerdictBadge';
import { NewForYou, type DigestItem } from '@/components/NewForYou';
import { RecommendedForYou } from '@/components/RecommendedForYou';
import { SaveButton } from '@/components/SaveButton';
import { TonightHome } from '@/components/TonightHome';
import { getTonight } from '@/lib/tonight';
import { CourtroomDoors } from '@/components/CourtroomDoors';
import { QuickRuling } from '@/components/QuickRuling';
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

  const { data: digest } = await supabase
    .from('digest_items')
    .select('id, tmdb_id, media_type, title, year, poster_path, personal_score, primary_call, reason')
    .eq('dismissed', false)
    .order('personal_score', { ascending: false })
    .limit(8);

  const digestItems = (digest as DigestItem[] | null) ?? [];

  return (
    <div className="space-y-8">
      {/* HERO — decide right here: search, ask, and every tool on one screen. */}
      <section className="animate-fade-up space-y-6">
        <div>
          <h1 className="text-4xl font-extrabold leading-[0.95] tracking-tight text-white sm:text-6xl">
            Stop scrolling.{' '}
            <span className="bg-gradient-to-r from-brand-300 to-gold-400 bg-clip-text text-transparent">
              Get rolling.
            </span>
          </h1>
          <p className="mt-3 text-base text-slate-400 sm:text-lg">
            Search a title, ask the judge, or dial in exactly what you want — scored for {label.toLowerCase()}.
          </p>
        </div>

        {/* 1 · Search titles — top, full width */}
        <div className="max-w-3xl">
          <label className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
            <span aria-hidden>🔎</span> Search titles
          </label>
          <SearchBar />
        </div>

        {/* Tools on the left, the court on the right */}
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
              <span aria-hidden>⚖️</span> Ask the judge — or dial in every detail
            </div>
            {/* All the search tools & sliders, inline: genre, length, released-since,
                ratings, match, pace, English-audio, all-episodes-out, and Upcoming. */}
            <FinderUI embedded hasServices={services.length > 0} watchers={watchers} initialJudge={judge} />
          </div>

          <div className="space-y-4 lg:pl-1">
            {/* Quick ruling — one tap, instant ranked recommendations inline */}
            <QuickRuling />

            {/* TV Guide Detective — one tap scans the next day+ of listings */}
            <TvDetective />

            {/* The court box — "Can't decide?" doors open to reveal the judge */}
            <CourtroomDoors initialJudge={judge} />
          </div>
        </div>
      </section>

      {/* Explore — big, inviting tiles for the places people come back to. */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Explore</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { href: '/app/quiz', emoji: '🍿', label: 'Taste Quiz', sub: 'Rate fast, sharpen your picks', accent: '#f59e0b' },
            { href: '/app/new', emoji: '🆕', label: 'New for you', sub: 'Fresh releases, matched to you', accent: '#34d399' },
            { href: '/app/watchlist', emoji: '📺', label: 'Watchlist', sub: 'Everything you’ve lined up', accent: '#7aa8ff' },
            { href: '/app/connect', emoji: '📸', label: 'Add from a photo', sub: 'Snap a guide → instant verdicts', accent: '#a78bfa' },
          ].map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="card group relative flex flex-col gap-3 overflow-hidden p-4 transition hover:-translate-y-0.5 hover:border-white/25 hover:shadow-glow"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-xl transition group-hover:opacity-40"
                style={{ background: t.accent }}
              />
              <span
                className="grid h-12 w-12 place-items-center rounded-2xl text-2xl transition group-hover:scale-105"
                style={{ background: `${t.accent}1f`, border: `1px solid ${t.accent}55` }}
              >
                {t.emoji}
              </span>
              <div className="relative">
                <div className="text-base font-bold text-white">{t.label}</div>
                <div className="mt-0.5 text-xs leading-snug text-slate-400">{t.sub}</div>
              </div>
              <span className="relative text-sm font-semibold text-slate-500 transition group-hover:text-white">Open →</span>
            </Link>
          ))}
        </div>
      </section>

      <TonightHome tonight={tonight} isGuest={isGuest} />

      {digestItems.length > 0 && <NewForYou items={digestItems} label={label} />}

      <RecommendedForYou label={label} />

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
