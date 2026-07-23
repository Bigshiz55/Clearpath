import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPersonForUser } from '@/lib/person';
import { getPerson } from '@/lib/tmdb/client';
import { Poster, PosterCard } from '@/components/PosterCard';
import { SaveButton } from '@/components/SaveButton';
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const person = await getPerson(Number(params.id)).catch(() => null);
  return { title: person ? `${person.name} · WatchVerdict` : 'Person · WatchVerdict' };
}

export default async function PersonPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const view = await getPersonForUser(supabase, user?.id ?? '', id);
  if (!view) notFound();

  const { t, plural } = getServerI18n();
  const roleLine = [
    view.department,
    view.directedCount > 0 ? plural('account.person.directingCredits', view.directedCount, { count: view.directedCount }) : null,
    view.actedCount > 0 ? plural('account.person.onScreenRoles', view.actedCount, { count: view.actedCount }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex gap-4">
        <div className="h-28 w-20 flex-none overflow-hidden rounded-xl border border-white/10 bg-ink-800 sm:h-36 sm:w-24">
          <Poster posterUrl={view.profileUrl} title={view.name} />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{view.name}</h1>
          {roleLine && <p className="mt-1 text-sm text-slate-400">{roleLine}</p>}
          {view.biography && <p className="mt-2 line-clamp-4 max-w-2xl text-sm text-slate-300">{view.biography}</p>}
        </div>
      </div>

      {/* Filmography, scored for you */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-white">🎬 {t('account.person.worksHeading')}</h2>
        <p className="mb-3 text-xs text-slate-400">{t('account.person.worksSubtitle')}</p>
        {view.works.length === 0 ? (
          <p className="text-sm text-slate-400">{t('account.person.noTitles')}</p>
        ) : (
          <div className="poster-grid">
            {view.works.map((w) => (
              <PosterCard
                key={`${w.mediaType}-${w.id}`}
                href={`/app/title/${w.mediaType}/${w.id}`}
                title={w.title}
                year={w.year}
                mediaType={w.mediaType}
                posterUrl={w.posterUrl}
                overlay={<SaveButton wide tmdbId={w.id} mediaType={w.mediaType} title={w.title} year={w.year} posterPath={w.posterPath} />}
              >
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="rounded-md bg-brand-500/20 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-brand-100">{w.matchScore}</span>
                  <span className="truncate text-[10px] text-slate-500">{w.role}</span>
                </div>
              </PosterCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
