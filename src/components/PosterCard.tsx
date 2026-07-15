import Link from 'next/link';
import type { MediaType } from '@/lib/types';

interface PosterCardProps {
  href?: string;
  title: string;
  year?: number | null;
  mediaType: MediaType;
  posterUrl?: string | null;
  meta?: string;
  children?: React.ReactNode;
  /** Rendered in the top-right corner of the poster (e.g. a save button). */
  overlay?: React.ReactNode;
}

export function Poster({ posterUrl, title, className = '' }: { posterUrl?: string | null; title: string; className?: string }) {
  if (posterUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={posterUrl}
        alt={`Poster for ${title}`}
        loading="lazy"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-ink-700 to-ink-850 ${className}`}>
      <svg viewBox="0 0 24 24" className="h-8 w-8 text-slate-600" fill="none" aria-hidden>
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="m7 4 2 4m4-4 2 4m-9 8 4-4 3 3 2-2 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function PosterCard({ href, title, year, mediaType, posterUrl, meta, children, overlay }: PosterCardProps) {
  const body = (
    <div className="card group h-full overflow-hidden transition hover:border-white/20 hover:shadow-glow">
      <div className="relative aspect-[2/3] overflow-hidden">
        <Poster posterUrl={posterUrl} title={title} className="transition duration-300 group-hover:scale-[1.04]" />
        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200 backdrop-blur">
          {mediaType === 'movie' ? 'Movie' : 'TV'}
        </span>
        {overlay && <div className="absolute right-2 top-2 z-10">{overlay}</div>}
      </div>
      <div className="p-3">
        <div className="line-clamp-2 text-sm font-semibold text-white">{title}</div>
        <div className="mt-0.5 text-xs text-slate-400">
          {year ?? '—'}
          {meta ? ` · ${meta}` : ''}
        </div>
        {children}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
