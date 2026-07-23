import Link from 'next/link';

/** Compact On TV view selector — horizontally scrollable on phones, wraps on
 *  desktop. No Sports. Highlights the active view. */
const VIEWS = [
  { key: 'for-you', label: 'For You', href: '/app/on-tv' },
  { key: 'now', label: 'Now', href: '/app/on-tv/now' },
  { key: 'next', label: 'Next', href: '/app/on-tv/next' },
  { key: 'tonight', label: 'Tonight', href: '/app/on-tv/tonight' },
  { key: 'movies', label: 'Movies', href: '/app/on-tv/movies' },
  { key: 'channels', label: 'Channels', href: '/app/on-tv/channels' },
  { key: 'grid', label: 'Grid', href: '/app/on-tv/grid' },
];

export function OnTvViewBar({ active }: { active: string }) {
  return (
    <nav className="ontv-viewbar -mx-1 px-1 py-1" aria-label="On TV views">
      {VIEWS.map((v) => (
        <Link
          key={v.key}
          href={v.href}
          aria-current={v.key === active ? 'page' : undefined}
          className={`flex-none rounded-full border px-4 py-2 text-sm font-semibold transition ${
            v.key === active ? 'border-brand-400/60 bg-brand-500/20 text-brand-100' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          {v.label}
        </Link>
      ))}
    </nav>
  );
}
