'use client';

import Link from 'next/link';
import type { MediaType } from '@/lib/types';
import { AlgorithmScore } from './AlgorithmScore';
import { SaveButton } from './SaveButton';
import { TasteFeedback } from './TasteFeedback';
import { LikeButton } from './LikeButton';
import { MediaTag } from './MediaTag';
import { useT } from '@/i18n/I18nProvider';

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
  /** If provided, the poster/title open this (e.g. a QuickLook modal) instead of
   *  navigating via `href`. Requires `tmdbId` so the card can still score itself. */
  onOpen?: () => void;
}

export function Poster({ posterUrl, title, className = '' }: { posterUrl?: string | null; title: string; className?: string }) {
  const t = useT();
  if (posterUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={posterUrl}
        alt={t('card.posterAlt', { title })}
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

export function PosterCard({ href, title, year, mediaType, posterUrl, posterPath, tmdbId, meta, children, overlay, onOpen }: PosterCardProps) {
  const t = useT();
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
      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
        <MediaTag mediaType={mediaType} />
        <span>
          {year ?? '—'}
          {meta ? ` · ${meta}` : ''}
        </span>
      </div>
    </>
  );

  // The poster and title link out; the top bar and `children` are siblings of
  // the link (never nested inside it) so they may hold interactive controls.
  return (
    <div className="card group flex h-full flex-col overflow-hidden transition hover:border-white/20 hover:shadow-glow">
      {/* One tidy action row — a clean groove, all the same size and OFF the art:
          👍 more like this · 👎 not for me · ＋ Save. The Movie/TV tag moved down to
          the title line; the score lives in the pink box below. */}
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-ink-900/85 px-1.5 py-1.5">
        {overlay !== null && saveId != null && (
          <LikeButton tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterPath={posterPath ?? null} />
        )}
        {feedback}
        {resolvedOverlay}
      </div>
      <div className="relative aspect-[2/3] overflow-hidden">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="block h-full w-full text-left" aria-label={t('card.quickLook', { title })}>{poster}</button>
        ) : href ? (
          <Link href={href} className="block h-full">{poster}</Link>
        ) : (
          poster
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="block w-full text-left">{heading}</button>
        ) : href ? (
          <Link href={href} className="block">{heading}</Link>
        ) : (
          heading
        )}
        {/* One pink box: the algorithm score (your DNA + every rating) + will-you-
            like-it call, with the ratings underneath. */}
        {saveId != null && (
          <AlgorithmScore mediaType={mediaType} tmdbId={saveId} title={title} year={year ?? null} className="mt-2.5" />
        )}
        {children}
      </div>
    </div>
  );
}
