import Link from 'next/link';
import type { Metadata } from 'next';
import { SearchBar } from '@/components/SearchBar';
import { QuickRuling } from '@/components/QuickRuling';
import { TvDetective } from '@/components/TvDetective';
import { VintageScale } from '@/components/VintageScale';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Vintage Mode · WatchVrdIQt' };

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
  return (
    <div className="mx-auto max-w-2xl space-y-7 px-2 pb-20">
      <VintageScale />
      <header className="text-center">
        <div className="text-6xl" aria-hidden>🧓</div>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-white">Vintage Mode</h1>
        <p className="mt-2 text-xl text-slate-300">Big and simple. Just tap a button.</p>
        <Link href="/app" className="mt-3 inline-block text-lg font-semibold text-slate-400 underline hover:text-white">
          Back to the full app
        </Link>
      </header>

      {/* Find something */}
      <section>
        <h2 className="mb-3 text-2xl font-black text-white">🔎 Find a movie or show</h2>
        <SearchBar />
      </section>

      {/* One-tap instant recommendation */}
      <section>
        <h2 className="mb-3 text-2xl font-black text-white">🎬 Pick something for me</h2>
        <QuickRuling />
      </section>

      {/* What’s on TV — the Preview Guide Detective */}
      <section>
        <h2 className="mb-3 text-2xl font-black text-white">🕵️ What’s worth watching on TV</h2>
        <TvDetective />
      </section>

      {/* Big simple buttons for the rest */}
      <section className="grid gap-4">
        <BigLink href="/app/tv" emoji="📺" label="What’s on TV now" sub="Live channels and times, big and clear" />
        <BigLink href="/app/quiz" emoji="⭐" label="Play the Taste Game" sub="A few taps teaches us what you like" />
        <BigLink href="/app/reminders" emoji="🔔" label="My reminders" sub="Shows you asked to be reminded about" />
        <BigLink href="/app/watchlist" emoji="📝" label="My list" sub="Everything you’ve saved to watch" />
      </section>
    </div>
  );
}
