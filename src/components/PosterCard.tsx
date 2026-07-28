import Link from 'next/link';
import type { MediaType } from '@/lib/types';
import { AlgorithmScore } from './AlgorithmScore';
import { SaveButton } from './SaveButton';
import { CardVerdict } from './CardVerdict';
import { WCheck } from './WCheck';
import { CardSynopsis } from './CardSynopsis';
import { CardWhyItFits } from './CardWhyItFits';

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
  /** 1-based position in an endless feed. Drawn on the artwork; omitted elsewhere. */
  rank?: number;
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

export function PosterCard({ href, title, year, mediaType, posterUrl, posterPath, tmdbId, meta, children, overlay, onOpen, rank }: PosterCardProps) {
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
    /* A PREMIUM NEAR-BLACK SURFACE WITH A VISIBLE EDGE.
       The hairline that replaced the old border went too far: a 7%-white ring
       on a near-black fill is invisible, so a column of tall cards read as one
       continuous scroll and you could not tell whose buttons you were looking
       at. `.wv-tile` puts the boundary back in the app's accent blue — see
       globals.css. The fill stays near-black so the poster is still the
       brightest thing on the card. */
    <div className="card wv-tile group flex flex-col bg-ink-950/85">
      <div className="wv-card">
      <div className="wv-card-art">
        {/* HOW FAR YOU HAVE COME. In an endless feed the count is the only
            thing distinguishing a long session from a loop — bottom-left, on
            the artwork, clear of the W in the opposite corner. */}
        {rank != null && (
          <span
            data-testid="card-rank"
            className="absolute bottom-1 left-1 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-black tabular-nums text-white/90 backdrop-blur-sm"
          >
            {rank}
          </span>
        )}
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

        {children}
      </div>
      </div>

      {/* THE FULL WIDTH OF THE CARD. Everything from here down was being drawn
          in the narrow column beside the poster while the space under the
          poster sat empty — which is why the two "why" sentences were cut. */}
      <div className="wv-card-foot">
        {/* What it is about, straight from TMDB. Renders nothing when there is
            no synopsis rather than showing a placeholder. */}
        {/* THREE lines, not two. "Would like more information about what it's
            about" — two lines of a TMDB synopsis ends mid-clause on almost
            every title ("…until Andy's…"), which tells you less than none. The
            reserved height grows with it, so nothing moves when the text
            lands. */}
        {saveId != null && <CardSynopsis mediaType={mediaType} tmdbId={saveId} lines={3} className="mt-1" />}

        {/* WHY IT FITS YOU — one line for, one against, both from the axes this
            user demonstrably rates highly. Says so honestly when there is not
            enough profile to speak; never invents a reason. */}
        {saveId != null && <CardWhyItFits mediaType={mediaType} tmdbId={saveId} className="mt-2" />}

        {/* One pink box: the algorithm score (your DNA + every rating) + will-you-
            like-it call, with the ratings underneath. */}
        {saveId != null && (
          <AlgorithmScore compact mediaType={mediaType} tmdbId={saveId} title={title} year={year ?? null} className="mt-1.5 sm:mt-2" />
        )}

        {/* The actions sit UNDER the artwork on a wide card and under the facts
            on a row — never in a lit strip above the poster, which is the one
            part of a placard doing real work. */}
        {/* WRAPPING, so a ruled card can show its status + Undo on a line of
            their own. Without it the row would squeeze four things onto one
            line and the buttons would change width the moment you tapped —
            which is the same "everything moved" complaint one level down. */}
        {overlay !== null && saveId != null && (
          <div className="wv-act-row mt-1.5 sm:mt-2">
            <CardVerdict tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterPath={posterPath ?? null} />
            {resolvedOverlay}
          </div>
        )}
      </div>
    </div>
  );
}
