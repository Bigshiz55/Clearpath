import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getPublicProfile } from '@/lib/social';
import { humanTrait } from '@/lib/scoring/traits';
import { FollowButton } from '@/components/social/FollowButton';
import { VerdictBadge } from '@/components/VerdictBadge';
import { PosterCard } from '@/components/PosterCard';
import { SaveButton } from '@/components/SaveButton';
import { tmdbImage } from '@/lib/tmdb/image';
import { getServerI18n } from '@/i18n/server';
import type { PreferenceTrait, VerdictTier } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Profile · WatchVerdict' };

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const supabase = createClient();
  const res = await getPublicProfile(supabase, params.username);
  const { t } = getServerI18n();

  if (res.kind === 'needs_migration') {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-semibold text-white">{t('account.profile.notEnabledTitle')}</h1>
        <p className="mt-2 text-sm text-slate-400">{t('account.profile.notEnabledBody')}</p>
        <Link href="/app" className="btn-secondary mt-6 inline-flex">{t('account.profile.back')}</Link>
      </div>
    );
  }
  if (res.kind === 'not_found') {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-semibold text-white">{t('account.profile.notFoundTitle')}</h1>
        <p className="mt-2 text-sm text-slate-400">{t('account.profile.notFoundBody')}</p>
        <Link href="/app/friends" className="btn-secondary mt-6 inline-flex">{t('account.profile.findPeople')}</Link>
      </div>
    );
  }

  const p = res.profile;
  const name = p.displayName?.trim() || (p.username ? `@${p.username}` : t('account.profile.wvUser'));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-[#7c5cff] text-2xl font-black text-white">
            {name.replace('@', '').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">{name}</h1>
            {p.username && <div className="text-sm text-slate-400">@{p.username}</div>}
            {p.personalLabel && <div className="mt-1 text-xs text-brand-200">{p.personalLabel}</div>}
          </div>
        </div>
        {p.isSelf ? (
          <Link href="/app/settings" className="btn-secondary">{t('account.profile.editProfile')}</Link>
        ) : (
          <FollowButton targetId={p.userId} initialFollowing={p.isFollowing} />
        )}
      </header>

      {p.loves.length > 0 && (
        <section className="card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('account.profile.loves')}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {p.loves.map((t) => (
              <span key={t} className="chip border-emerald-400/40 text-emerald-100">
                {humanTrait(t as PreferenceTrait)}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">{t('account.profile.recentVerdicts')}</h2>
        {!p.publicActivity ? (
          <p className="text-sm text-slate-400">
            {t('account.profile.keepsPrivate', { name })} {p.isSelf ? (
              <>{t('account.profile.turnOnPre')} <Link href="/app/settings" className="text-brand-300 underline">{t('account.profile.settings')}</Link> {t('account.profile.turnOnPost')}</>
            ) : (
              t('account.profile.canFollow')
            )}
          </p>
        ) : p.verdicts.length === 0 ? (
          <p className="text-sm text-slate-400">{t('account.profile.noVerdicts')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {p.verdicts.map((v) => (
              <PosterCard
                key={`${v.mediaType}-${v.tmdbId}`}
                href={`/app/title/${v.mediaType}/${v.tmdbId}`}
                title={v.title}
                year={v.year}
                mediaType={v.mediaType}
                posterUrl={tmdbImage(v.posterPath, 'w342')}
                overlay={
                  <SaveButton wide tmdbId={v.tmdbId} mediaType={v.mediaType} title={v.title} year={v.year} posterPath={v.posterPath} />
                }
              >
                <div className="mt-2 flex items-center justify-between">
                  <VerdictBadge tier={v.tier as VerdictTier} size="sm" />
                  <span className="text-xs font-bold tabular-nums text-slate-200">{v.personalScore}</span>
                </div>
              </PosterCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
