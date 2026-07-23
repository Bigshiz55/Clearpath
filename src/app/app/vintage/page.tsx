import Link from 'next/link';
import type { Metadata } from 'next';
import { SearchBar } from '@/components/SearchBar';
import { QuickRuling } from '@/components/QuickRuling';
import { TvDetective } from '@/components/TvDetective';
import { VintageScale } from '@/components/VintageScale';
import { getServerI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Vintage Mode · WatchVerdict' };

function BigLink({ href, emoji, label, sub }: { href: string; emoji: string; label: string; sub: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl border-2 border-white/15 bg-white/[0.05] px-6 py-5 transition hover:border-brand-400/60 hover:bg-white/[0.09]"
    >
      <span className="text-4xl" aria-hidden>{emoji}</span>
      <span className="min-w-0">
        <span className="block text-xl font-black text-white">{label}</span>
        <span className="block text-base text-slate-300">{sub}</span>
      </span>
    </Link>
  );
}

/**
 * Vintage Mode — a purpose-built, one-page experience for an 80-something: big
 * type, big tap targets, no menus. Everything they need on one screen — find a
 * movie, get an instant pick, see what's on TV (with the Detective), and reach
 * the game and their reminders.
 */
export default function VintagePage() {
  const { t } = getServerI18n();
  return (
    <div className="mx-auto max-w-2xl space-y-7 px-2 pb-20">
      <VintageScale />
      <header className="text-center">
        <div className="text-6xl" aria-hidden>🧓</div>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-white">{t('misc.vintage.title')}</h1>
        <p className="mt-2 text-xl text-slate-300">{t('misc.vintage.subtitle')}</p>
        <Link href="/app" className="mt-3 inline-block text-lg font-semibold text-slate-400 underline hover:text-white">
          {t('misc.vintage.backFull')}
        </Link>
      </header>

      {/* Find something */}
      <section>
        <h2 className="mb-3 text-2xl font-black text-white">{t('misc.vintage.findHeading')}</h2>
        <SearchBar />
      </section>

      {/* One-tap instant recommendation */}
      <section>
        <h2 className="mb-3 text-2xl font-black text-white">{t('misc.vintage.pickHeading')}</h2>
        <QuickRuling />
      </section>

      {/* What’s on TV — the Preview Guide Detective */}
      <section>
        <h2 className="mb-3 text-2xl font-black text-white">{t('misc.vintage.tvHeading')}</h2>
        <TvDetective />
      </section>

      {/* Big simple buttons for the rest */}
      <section className="grid gap-4">
        <BigLink href="/app/tv" emoji="📺" label={t('misc.vintage.tvNow')} sub={t('misc.vintage.tvNowSub')} />
        <BigLink href="/app/quiz" emoji="⭐" label={t('misc.vintage.tasteGame')} sub={t('misc.vintage.tasteGameSub')} />
        <BigLink href="/app/reminders" emoji="🔔" label={t('misc.vintage.reminders')} sub={t('misc.vintage.remindersSub')} />
        <BigLink href="/app/watchlist" emoji="📝" label={t('misc.vintage.myList')} sub={t('misc.vintage.myListSub')} />
      </section>
    </div>
  );
}
