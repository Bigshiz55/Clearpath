import Link from 'next/link';
import type { MediaType } from '@/lib/types';
import { AlgorithmScore } from './AlgorithmScore';
import { SaveButton } from './SaveButton';
import { TasteFeedback } from './TasteFeedback';
import { LikeButton } from './LikeButton';
import { WCheck } from './WCheck';
import { CardSynopsis } from './CardSynopsis';

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
  /**
   * Saving a placard means "handled" — it belongs on your list now, not in the
   * grid you are browsing — so by default the card leaves once it is saved.
   * Set false where the grid is somebody's list rather than a set of
   * suggestions (a friend's profile), because there a card vanishing would read
   * as editing THEIR list.
   */
  dismissOnSave?: boolean;
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

export function PosterCard({ href, title, year, mediaType, posterUrl, posterPath, tmdbId, meta, children, overlay, onOpen, dismissOnSave = true }: PosterCardProps) {
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
        ? <SaveButton wide removeOnSave={dismissOnSave} tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterPath={posterPath ?? null} />
        : null;
  // Every placard everywhere also gets the "not for me" flag (feeds your DNA),
  // unless the caller explicitly opts out of overlays with `overlay={null}`.
  const feedback =
    overlay !== null && saveId != null ? (
      <TasteFeedback compact wide tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterPath={posterPath ?? null} />
    ) : null;
  const heading = (
    <>
      {/* Full-width cards on a phone mean the title has room to be read rather
          than scanned, so it is sized for reading. */}
      <div className="line-clamp-2 text-base font-semibold leading-snug text-white sm:text-sm">{title}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-400 sm:text-xs">
        <span className="flex-none rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
          {mediaType === 'movie' ? 'Movie' : 'TV'}
        </span>
        <span>
          {year ?? '—'}
          {meta ? ` · ${meta}` : ''}
        </span>
      </div>
    </>
  );

  // The poster and title link out; the actions and `children` are siblings of
  // the link (never nested inside it) so they may hold interactive controls.
  //
  // The wrapper keeps its `card` class — five components find their placard
  // with `closest('.card')` to fade it out, and dropping it would silently
  // break every one of them. The BORDER is what goes: the poster's own edge is
  // the boundary, depth comes from a shadow, and a page of results stops being
  // a grid of boxes.
  // A ROW ON A PHONE, A COLUMN FROM `sm` UP.
  //
  // Full-width column cards meant one poster filled a 956px screen on its own —
  // 2:3 at 406px wide is 609px of artwork before the title even appears. You
  // could see exactly one title at a time, and nothing telling you what it was
  // about. Turning the card on its side fixes both at once: the poster drops to
  // roughly a third of the width, three or four cards fit on a screen, and the
  // space beside the artwork is exactly where a synopsis belongs.
  //
  // From `sm` the grid has real columns again, so the card goes back to being a
  // column — a sideways card in a 250px cell would leave a thumbnail and a
  // sliver.
  return (
    <div className="card group wv-card !border-transparent shadow-[0_6px_24px_-6px_rgba(0,0,0,0.8)] transition hover:shadow-[0_10px_32px_-6px_rgba(0,0,0,0.95)]">
      <div className="wv-card-art">
        {/* The W sits ON the artwork, not in the action row: the row is already
            three buttons wide and a fourth breaks at 320px, and the stamp has
            to be in the same place on every surface to read as one gesture. */}
        {overlay !== null && saveId != null && (
          <WCheck tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterUrl={posterUrl ?? null} />
        )}
        {onOpen ? (
          <button type="button" onClick={onOpen} className="block h-full w-full text-left" aria-label={`Quick look at ${title}`}>{poster}</button>
        ) : href ? (
          <Link href={href} className="block h-full">{poster}</Link>
        ) : (
          poster
        )}
      </div>

      <div className="wv-card-body">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="block w-full text-left">{heading}</button>
        ) : href ? (
          <Link href={href} className="block">{heading}</Link>
        ) : (
          heading
        )}

        {/* What it is about, straight from TMDB. Renders nothing when there is
            no synopsis rather than showing a placeholder. */}
        {saveId != null && <CardSynopsis mediaType={mediaType} tmdbId={saveId} lines={2} className="mt-1" />}

        {/* One pink box: the algorithm score (your DNA + every rating) + will-you-
            like-it call, with the ratings underneath. */}
        {saveId != null && (
          <AlgorithmScore compact mediaType={mediaType} tmdbId={saveId} title={title} year={year ?? null} className="mt-1.5 sm:mt-2" />
        )}

        {/* The actions sit UNDER the artwork on a wide card and under the facts
            on a row — never in a lit strip above the poster, which is the one
            part of a placard doing real work. */}
        {overlay !== null && saveId != null && (
          <div className="mt-1.5 flex items-center gap-1.5 sm:mt-2">
            <LikeButton tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterPath={posterPath ?? null} />
            {feedback}
            {resolvedOverlay}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
