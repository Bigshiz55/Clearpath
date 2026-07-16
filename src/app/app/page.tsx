import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile, personalLabelFor } from '@/lib/profile';
import { SearchBar } from '@/components/SearchBar';
import { HomeGreeter } from '@/components/HomeGreeter';
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
import { getActiveJudge, type Judge } from '@/lib/sponsors';
import { regionFor } from '@/lib/profile';
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
  const firstName = profile?.display_name?.trim().split(/\s+/)[0] || null;
  const greeterName = isGuest ? null : firstName;

  let judge: Judge | null = null;
  if (user) {
    try {
      judge = await getActiveJudge(supabase, { region: regionFor(profile), nowMs: Date.now() });
    } catch {
      /* sponsors optional / pre-migration */
    }
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
      {/* Easy Mode entry — big, simple, three picks. Front-and-center so the
          audience that needs it most finds it first; anyone can use it. */}
      <Link
        href="/app/easy"
        className="flex items-center justify-between gap-4 rounded-2xl border border-brand-400/40 bg-gradient-to-r from-brand-500/20 to-brand-500/5 px-5 py-4 transition hover:border-brand-400/70 hover:from-brand-500/25"
      >
        <span className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>🛋️</span>
          <span>
            <span className="block text-lg font-bold text-white">Want it big and simple?</span>
            <span className="block text-sm text-slate-300">Easy Mode: three great picks for tonight, big text, one tap to watch.</span>
          </span>
        </span>
        <span className="flex-none rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white shadow-glow">Open Easy Mode →</span>
      </Link>

      <section className="animate-fade-up grid items-center gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="min-w-0">
        <h1 className="text-5xl font-extrabold leading-[0.95] tracking-tight text-white sm:text-7xl">
          Stop scrolling.{' '}
          <span className="bg-gradient-to-r from-brand-300 to-gold-400 bg-clip-text text-transparent">
            Get rolling.
          </span>
        </h1>
        <p className="mt-4 text-base text-slate-400 sm:text-lg">
          Tell the judge what you feel like — get a verdict, scored for {label.toLowerCase()}.
        </p>
        {/* The personal AI: your dog judge greets you and takes your case. */}
        <HomeGreeter name={greeterName} className="mt-5 max-w-2xl" />
        <div className="mt-3 max-w-2xl">
          <div className="mb-1.5 text-xs font-medium text-slate-500">Or look up a specific title</div>
          <SearchBar />
        </div>
        {/* Three primary decisions — start a decision, don't browse a menu. */}
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <Link
            href="/app/together"
            className="flex items-center justify-center gap-2 rounded-xl border border-brand-400/50 bg-brand-500/20 px-4 py-3 text-sm font-semibold text-brand-100 transition hover:bg-brand-500/30"
          >
            👪 Pick for us tonight
          </Link>
          <Link
            href="/app/mood"
            className="flex items-center justify-center gap-2 rounded-xl border border-brand-400/50 bg-brand-500/20 px-4 py-3 text-sm font-semibold text-brand-100 transition hover:bg-brand-500/30"
          >
            🎭 By mood
          </Link>
          <Link
            href="/app/finder"
            className="flex items-center justify-center gap-2 rounded-xl border border-brand-400/50 bg-brand-500/20 px-4 py-3 text-sm font-semibold text-brand-100 transition hover:bg-brand-500/30"
          >
            🔎 The Finder
          </Link>
        </div>
        </div>

        {/* The courtroom — a box off to the side; doors open to reveal the judge */}
        <div className="lg:pl-2">
          <CourtroomDoors initialJudge={judge} />
        </div>
      </section>

      {/* Explore — big, inviting tiles for the places people come back to. */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Explore</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { href: '/app/finder', emoji: '🔎', label: 'The Finder', sub: 'Dial in exactly what to watch', accent: '#4f86ff' },
            { href: '/app/chambers', emoji: '⚖️', label: 'Your Chambers', sub: 'Your rank, badges & Watch DNA', accent: '#f5c65a' },
            { href: '/app/quiz', emoji: '🍿', label: 'Taste Quiz', sub: 'Rate fast, sharpen your picks', accent: '#f59e0b' },
            { href: '/app/docket', emoji: '🗂️', label: 'The Docket', sub: 'This month’s viewing cases', accent: '#f5c65a' },
            { href: '/app/new', emoji: '🆕', label: 'New for you', sub: 'Fresh releases, matched to you', accent: '#34d399' },
            { href: '/app/watchlist', emoji: '📺', label: 'Watchlist', sub: 'Everything you’ve lined up', accent: '#7aa8ff' },
            { href: '/app/connect', emoji: '📸', label: 'Add from a photo', sub: 'Snap a guide → instant verdicts', accent: '#a78bfa' },
            { href: '/app/cards', emoji: '✨', label: 'Share cards', sub: 'Turn a verdict into a shareable card', accent: '#f472b6' },
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
