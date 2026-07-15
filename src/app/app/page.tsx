import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile, personalLabelFor } from '@/lib/profile';
import { SearchBar } from '@/components/SearchBar';
import { PosterCard } from '@/components/PosterCard';
import { EmptyState } from '@/components/EmptyState';
import { tmdbImage } from '@/lib/tmdb/client';
import { VerdictBadge } from '@/components/VerdictBadge';
import { NewForYou, type DigestItem } from '@/components/NewForYou';
import { RecommendedForYou } from '@/components/RecommendedForYou';
import { SaveButton } from '@/components/SaveButton';
import { TonightHome } from '@/components/TonightHome';
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

  const { data: digest } = await supabase
    .from('digest_items')
    .select('id, tmdb_id, media_type, title, year, poster_path, personal_score, primary_call, reason')
    .eq('dismissed', false)
    .order('personal_score', { ascending: false })
    .limit(8);

  const digestItems = (digest as DigestItem[] | null) ?? [];

  return (
    <div className="space-y-8">
      <section className="animate-fade-up">
        <h1 className="text-5xl font-extrabold leading-[0.95] tracking-tight text-white sm:text-7xl">
          Stop scrolling.{' '}
          <span className="bg-gradient-to-r from-brand-300 to-gold-400 bg-clip-text text-transparent">
            Get rolling.
          </span>
        </h1>
        <p className="mt-4 text-base text-slate-400 sm:text-lg">
          Search any movie or show and get a verdict, scored for {label.toLowerCase()}.
        </p>
        <div className="mt-5 max-w-2xl">
          <SearchBar autoFocus />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/app/finder"
            className="inline-flex items-center gap-2 rounded-xl border border-brand-400/40 bg-brand-500/15 px-4 py-2 text-sm font-semibold text-brand-100 transition hover:bg-brand-500/25"
          >
            🔎 Find exactly what to watch
          </Link>
          <Link
            href="/app/together"
            className="inline-flex items-center gap-2 rounded-xl border border-brand-400/40 bg-brand-500/15 px-4 py-2 text-sm font-semibold text-brand-100 transition hover:bg-brand-500/25"
          >
            👪 Tonight, Together — one pick for the whole room
          </Link>
          <Link
            href="/app/mood"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            🎭 By mood
          </Link>
          <Link
            href="/app/new"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            🆕 New for your plans
          </Link>
          <Link
            href="/app/friends"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            👥 Friends
          </Link>
          <Link
            href="/app/docket"
            className="inline-flex items-center gap-2 rounded-xl border border-gold-400/40 bg-gold-500/10 px-4 py-2 text-sm font-semibold text-gold-400 transition hover:bg-gold-500/20"
          >
            🗂️ The Docket
          </Link>
          <Link
            href="/app/quiz"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            🍿 Taste Quiz
          </Link>
          <Link
            href="/app/import"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            ⬆ Import history
          </Link>
          <Link
            href="/app/connect"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            📸 Add from a photo
          </Link>
          <Link
            href="/app/cards"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            ✨ Share cards
          </Link>
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
