import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { SearchBar } from '@/components/SearchBar';

export const dynamic = 'force-dynamic';

// The eight things, in order — search is inline at the top; the rest are big,
// obvious tiles. Each points at the feature that already exists in the full app.
const TILES: { href: string; emoji: string; title: string; sub: string; accent: string }[] = [
  { href: '/app/ask', emoji: '⚖️', title: 'Ask the Judge', sub: 'Tell me what you feel like', accent: '#4f86ff' },
  { href: '/app/quiz', emoji: '📋', title: 'Evidence Quiz', sub: 'Answer a few — get better picks', accent: '#f5c65a' },
  { href: '/app/together', emoji: '👨‍⚖️', title: 'Court Verdict', sub: 'Can’t agree? Decide together', accent: '#a78bfa' },
  { href: '/app/watch', emoji: '▶️', title: 'Watch Now', sub: 'Ready on your services', accent: '#34d399' },
  { href: '/app/watch?type=movie', emoji: '🎬', title: 'Movies', sub: 'Browse films', accent: '#7aa8ff' },
  { href: '/app/watch?type=tv', emoji: '📺', title: 'TV Shows', sub: 'Browse series', accent: '#f472b6' },
  { href: '/app/tv', emoji: '🔴', title: 'Live TV', sub: 'On now & tonight', accent: '#f87171' },
];

export default function LiteHome() {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <header className="flex items-center justify-between py-3">
        <Logo size="lg" />
        <Link href="/app" className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10">
          Full app →
        </Link>
      </header>

      {/* 1 · Immediate search */}
      <section className="mt-4">
        <label className="mb-2 flex items-center gap-2 text-lg font-bold text-white">
          <span aria-hidden>🔎</span> Search
        </label>
        <SearchBar />
        <p className="mt-1.5 text-xs text-slate-500">Type a movie or show — or say what you feel like.</p>
      </section>

      {/* 2–8 · The big buttons */}
      <section className="mt-6 grid grid-cols-2 gap-3">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group relative flex min-h-[104px] flex-col justify-between overflow-hidden rounded-2xl border border-white/12 bg-white/[0.04] p-4 transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.07]"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-5 -top-5 h-16 w-16 rounded-full opacity-20 blur-xl transition group-hover:opacity-40"
              style={{ background: t.accent }}
            />
            <span
              className="grid h-11 w-11 place-items-center rounded-xl text-2xl"
              style={{ background: `${t.accent}1f`, border: `1px solid ${t.accent}55` }}
            >
              {t.emoji}
            </span>
            <span className="relative mt-2">
              <span className="block text-base font-bold leading-tight text-white">{t.title}</span>
              <span className="mt-0.5 block text-xs leading-snug text-slate-400">{t.sub}</span>
            </span>
          </Link>
        ))}
      </section>

      <p className="mt-6 text-center text-[11px] text-slate-600">
        WatchVrdikt · the simple way in. Tap <span className="text-slate-400">Full app →</span> anytime for everything else.
      </p>
    </div>
  );
}
