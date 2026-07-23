import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getProfile, personalLabelFor } from '@/lib/profile';
import { humanTrait } from '@/lib/scoring/traits';
import type { PreferenceTrait } from '@/lib/types';
import { ShareCard, TasteCardArt, WrappedCardArt } from '@/components/ShareCards';
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Share cards · WatchVerdict' };

const LOVABLE = new Set(['grounded_crime', 'psychological_thriller', 'detective_mystery', 'domestic_thriller', 'serial_killer']);
const AVOIDABLE = new Set(['supernatural', 'paranormal', 'science_fiction', 'fantasy', 'noir', 'slow_burn']);

export default async function CardsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const uid = user?.id ?? '';
  const { t } = getServerI18n();
  const profile = await getProfile(supabase, uid);
  const label = profile ? personalLabelFor(profile) : t('account.cards.myMatch');

  const { data: rules } = await supabase
    .from('preference_rules')
    .select('trait, weight, requires_defining')
    .eq('user_id', uid);
  const loves = (rules ?? [])
    .filter((r) => (r.weight as number) > 0 && LOVABLE.has(r.trait as string))
    .map((r) => humanTrait(r.trait as PreferenceTrait));
  const avoids = (rules ?? [])
    .filter((r) => ((r.weight as number) < 0 || (r.requires_defining as boolean)) && AVOIDABLE.has(r.trait as string))
    .map((r) => humanTrait(r.trait as PreferenceTrait));

  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: watched } = await supabase
    .from('watchlist_items')
    .select('title, rating, watched_at')
    .eq('user_id', uid)
    .eq('status', 'watched')
    .gte('watched_at', since);
  const w = watched ?? [];
  const rated = w.filter((x) => x.rating != null) as { title: string; rating: number }[];
  const avg = rated.length ? rated.reduce((a, b) => a + b.rating, 0) / rated.length : null;
  const top = [...rated].sort((a, b) => b.rating - a.rating).slice(0, 3).map((x) => ({ title: x.title, rating: x.rating }));
  const monthLabel = new Date().toLocaleString('en-US', { month: 'long' });

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">✨ {t('account.cards.heading')}</h1>
      <p className="mt-2 text-sm text-slate-400">
        {t('account.cards.subtitle')}
      </p>

      <div className="mt-6 space-y-8">
        <section>
          <div className="mb-2 text-sm font-semibold text-white">{t('account.cards.tasteCard')}</div>
          <ShareCard filename="watchverdict-taste">
            <TasteCardArt label={label} loves={loves} avoids={avoids} />
          </ShareCard>
        </section>

        <section>
          <div className="mb-2 text-sm font-semibold text-white">{t('account.cards.wrapped', { month: monthLabel })}</div>
          {w.length === 0 ? (
            <p className="text-sm text-slate-400">
              {t('account.cards.wrappedEmptyPre')}{' '}
              <Link href="/app/quiz" className="text-brand-300 underline">{t('account.cards.tasteQuiz')}</Link>{t('account.cards.wrappedEmptyPost')}
            </p>
          ) : (
            <ShareCard filename="watchverdict-wrapped">
              <WrappedCardArt monthLabel={monthLabel} watched={w.length} avgRating={avg} top={top} />
            </ShareCard>
          )}
        </section>

        <p className="text-xs text-slate-500">
          {t('account.cards.groupPre')} <Link href="/app/together" className="text-brand-300 underline">{t('account.cards.tasteCourt')}</Link> {t('account.cards.groupPost')}
        </p>
      </div>
    </div>
  );
}
