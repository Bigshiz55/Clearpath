import Link from 'next/link';
import type { MediaType } from '@/lib/types';
import { CardRatings } from './CardRatings';
import { CardDna } from './CardDna';
import { WatchCall } from './WatchCall';
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
        ? <SaveButton wide tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterPath={posterPath ?? null} />
        : null;
  // Every placard everywhere also gets the "not for me" flag (feeds your DNA),
  // unless the caller explicitly opts out of overlays with `overlay={null}`.
  const feedback =
    overlay !== null && saveId != null ? (
      <TasteFeedback compact wide tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterPath={posterPath ?? null} />
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

  // The poster and title link out; the top bar and `children` are siblings of
  // the link (never nested inside it) so they may hold interactive controls.
  return (
    <div className="card group flex h-full flex-col overflow-hidden transition hover:border-white/20 hover:shadow-glow">
      {/* Top bar — the DNA call as a full-width rating bar, with Movie/TV · ＋ · O
          on the row beneath it. Above the art, never over it. */}
      <div className="border-b border-white/10 bg-ink-900/85">
        {saveId != null && (
          <div className="px-2 pt-1.5">
            <WatchCall mediaType={mediaType} tmdbId={saveId} objectiveScore={null} className="w-full justify-center py-1 text-[11px]" />
          </div>
        )}
        <div className="flex items-center gap-1.5 px-2 py-1.5">
          <span className="flex-none rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
            {mediaType === 'movie' ? 'Movie' : 'TV'}
          </span>
          <div className="flex flex-1 items-center gap-1.5">
            {resolvedOverlay}
            {feedback}
          </div>
        </div>
      </div>
      <div className="relative aspect-[2/3] overflow-hidden">
        {href ? <Link href={href} className="block h-full">{poster}</Link> : poster}
      </div>
      <div className="flex flex-1 flex-col p-3">
        {href ? <Link href={href} className="block">{heading}</Link> : heading}
        {/* The large DNA box, with the other ratings around it, under the show. */}
        {saveId != null && <CardDna mediaType={mediaType} tmdbId={saveId} className="mt-2" />}
        {(() => {
          // Every card that links to a title shows its real ratings, no matter
          // which list rendered it — hydrated from the id in the href. The call
          // is in the top bar, so here we show only the source chips.
          const m = href?.match(/\/app\/title\/(movie|tv)\/(\d+)/);
          if (!m) return null;
          return <CardRatings mediaType={m[1] as MediaType} tmdbId={Number(m[2])} title={title} year={year} hideCall className="mt-2" />;
        })()}
        {children}
      </div>
    </div>
  );
}
