import Link from 'next/link';
import type { MediaType } from '@/lib/types';
import { CardRatings } from './CardRatings';
import { CardDna } from './CardDna';
import { SaveButton } from './SaveButton';
import { TasteFeedback } from './TasteFeedback';

interface PosterCardProps {
  href?: string;
  title: string;
  year?: number | null;
  mediaType: MediaType;
  posterUrl?: string | null;
  /** TMDB poster path (e.g. "/abc.jpg") — stored on the saved item's thumbnail. */
  posterPath?: string | null;
  tmdbId?: number;
  meta?: string;
  children?: React.ReactNode;
  /** Rendered in the top-right corner of the poster (e.g. a save button).
   *  When omitted, a default "＋ add to your list" button is shown automatically,
   *  so every placard has a way to save it. Pass `null` to suppress it. */
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

export function PosterCard({ href, title, year, mediaType, posterUrl, posterPath, tmdbId, meta, children, overlay }: PosterCardProps) {
  const poster = (
    <Poster posterUrl={posterUrl} title={title} className="transition duration-300 group-hover:scale-[1.04]" />
  );

  // Every placard gets a "＋ save" affordance. If the caller didn't supply its
  // own overlay, and we can identify the title (an explicit id or one parsed
  // from the href), drop in a default SaveButton. `overlay={null}` opts out.
  const hrefId = href?.match(/\/app\/title\/(?:movie|tv)\/(\d+)/)?.[1];
  const saveId = tmdbId ?? (hrefId ? Number(hrefId) : null);
  const resolvedOverlay =
    overlay !== undefined
      ? overlay
      : saveId != null
        ? <SaveButton tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterPath={posterPath ?? null} />
        : null;
  // Every placard everywhere also gets the "not for me" flag (feeds your DNA),
  // unless the caller explicitly opts out of overlays with `overlay={null}`.
  const feedback =
    overlay !== null && saveId != null ? (
      <TasteFeedback tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterPath={posterPath ?? null} />
    ) : null;
  const heading = (
    <>
      <div className="line-clamp-2 text-sm font-semibold text-white">{title}</div>
      <div className="mt-0.5 text-xs text-slate-400">
        {year ?? '—'}
        {meta ? ` · ${meta}` : ''}
      </div>
    </>
  );

  // The poster and title link out; `overlay` and `children` are siblings of the
  // link (never nested inside it) so they may contain their own interactive
  // controls — a save button, a tap-to-expand reason — as valid markup.
  return (
    <div className="card group h-full overflow-hidden transition hover:border-white/20 hover:shadow-glow">
      <div className="relative aspect-[2/3] overflow-hidden">
        {href ? <Link href={href} className="block h-full">{poster}</Link> : poster}
        <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200 backdrop-blur">
          {mediaType === 'movie' ? 'Movie' : 'TV'}
        </span>
        {(resolvedOverlay || feedback) && (
          <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1.5">
            {resolvedOverlay}
            {feedback}
          </div>
        )}
        {saveId != null && (
          <div className="absolute bottom-2 left-2 z-10">
            <CardDna mediaType={mediaType} tmdbId={saveId} />
          </div>
        )}
      </div>
      <div className="p-3">
        {href ? <Link href={href} className="block">{heading}</Link> : heading}
        {(() => {
          // Every card that links to a title shows its real ratings, no matter
          // which list rendered it — hydrated from the id in the href.
          const m = href?.match(/\/app\/title\/(movie|tv)\/(\d+)/);
          if (!m) return null;
          return <CardRatings mediaType={m[1] as MediaType} tmdbId={Number(m[2])} title={title} year={year} className="mt-1.5" />;
        })()}
        {children}
      </div>
    </div>
  );
}
