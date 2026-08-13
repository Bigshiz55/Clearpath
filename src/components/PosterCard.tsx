import Link from 'next/link';
import type { MediaType } from '@/lib/types';
import { AlgorithmScore } from './AlgorithmScore';
import { SaveButton } from './SaveButton';
import { CardVerdict } from './CardVerdict';
import { WCheck } from './WCheck';
import { CardFacts } from './CardFacts';
import { CardReason } from './CardReason';
import { WhereToWatch } from './watch/WhereToWatch';
import { TrailerMedia } from './trailer/TrailerMedia';
import { MoreInfoButton } from './MoreInfoButton';

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
  /**
   * The general, non-personal quality score, for surfaces where `/api/dna`
   * legitimately answers "no profile" — i.e. an anonymous viewer. Handed
   * straight to `AlgorithmScore`, which has always taken it (see
   * `WatchNowGrid`) and which falls back to it only when there is no DNA to
   * blend. Signed-in surfaces leave it null and are unchanged: DNA wins
   * wherever it exists, so this can never override a personal score.
   */
  objectiveScore?: number | null;
  /** Supporting evidence for the decision — pills, the household verdict, the
   *  "Why this Verd1ct?" panel. Rendered at the card's FULL width, after the
   *  score and before the buttons, which is the order a decision is made in:
   *  what it is → how well it fits you → why → what you want to do about it.
   *  `children` stays beside the poster, for the one line that belongs there. */
  evidence?: React.ReactNode;
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

/**
 * ── THE BROWSE CARD ───────────────────────────────────────────────────────
 *
 * WHAT WENT WRONG, MEASURED: a desktop card was 763px tall. The chrome above a
 * grid is ~265px, so the first card's bottom edge sat at 1028px in a 900px
 * viewport — there was no scroll position at which one whole card was visible.
 * That is the clipping in the screenshots, and the trailer had nothing to do
 * with it: a preview inside a card that cannot fit on screen is necessarily
 * half off the screen. The card was trying to be the whole WatchVerd1ct report.
 *
 * THE INFORMATION BUDGET. A browse card answers four questions fast:
 *
 *     WHAT IS IT?          poster · title · year · type/runtime/genre
 *     WILL I LIKE IT?      the Verd1ct score, the call, ONE reason
 *     WHERE CAN I WATCH?   one row of provider tiles, or an honest blank
 *     WHAT CAN I DO?       FOR · AGAINST · SAVE · More Info
 *
 * Everything else — the full synopsis, every "why it fits", the cautions, the
 * source ratings, the complete availability with its live re-check, the cast,
 * the Taste DNA explanation — moved to More Info, which is the surface that is
 * allowed to be big. Nothing was deleted; it was relocated to where there is
 * room for it. The card came down from 763px to ~465px, and the whole card now
 * fits on screen with the trailer playing inside it.
 *
 * EVERY REGION IS BOUNDED so a row of five cards is one height: the media frame
 * is a fixed aspect ratio, the reason is exactly two lines (`.wv-reason`), the
 * provider row is exactly one (`.wv-provider-row`), and the actions are anchored
 * to the bottom by `mt-auto`. A 400-word synopsis and no synopsis at all
 * produce the same card.
 */
export function PosterCard({ href, title, year, mediaType, posterUrl, posterPath, tmdbId, meta, children, overlay, onOpen, rank, evidence, objectiveScore = null }: PosterCardProps) {
  // THE POSTER IS LETTERBOXED, NOT CROPPED, from `sm`. The frame is a fixed
  // 8:5 box (see `.wv-card-art`); `object-contain` keeps the whole poster
  // visible inside it, centered, at its true proportions, over a blurred matte
  // of the same image. `object-cover` on a phone row is untouched: that box IS
  // exactly 2:3, so cover there never crops anything.
  const poster = (
    <Poster posterUrl={posterUrl} title={title} className="transition duration-300 group-hover:scale-[1.04] sm:object-contain" />
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
          than scanned, so it is sized for reading. Two lines is the cap at
          every width — a five-line title is what makes one card in a row 60px
          taller than the rest. */}
      <div className="wv-card-title line-clamp-2 text-base font-semibold leading-snug text-white sm:text-[15px]">{title}</div>
      {/* ONE LINE, ALWAYS. `truncate` rather than wrap: a caller-supplied
          `meta` ("Acción · Comedia") pushed this to two lines on exactly the
          cards that had one, which made that card 11px taller than the four
          beside it — measured on the QA grid at 390px. */}
      <div className="mt-1 flex items-center gap-1.5 overflow-hidden text-[13px] text-slate-400 sm:text-xs">
        <span className="flex-none rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
          {mediaType === 'movie' ? 'Movie' : 'TV'}
        </span>
        <span className="truncate">
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
  // break every one of them.
  return (
    /* A PREMIUM NEAR-BLACK SURFACE WITH A QUIET EDGE.
       `.wv-tile` still draws a boundary — without one, a column of cards on
       near-black reads as one continuous scroll — but the saturated blue
       perimeter and its glow ring are gone (see globals.css). Hierarchy comes
       from the artwork, the elevation and the score; the box is not the
       loudest thing in the grid any more. */
    <div className="card wv-tile group flex flex-col overflow-hidden bg-ink-950/85">
      <div className="wv-card">
        <div className="wv-card-art">
          {/* THE MATTE, FROM `sm` ONLY. A blurred, scaled-up copy of the SAME
              image (no extra request — the browser already has it cached) fills
              the 8:5 frame behind the true, uncropped poster, so the empty band
              `object-contain` leaves reads as a deliberate frame instead of
              dead black bars. `aria-hidden`: purely decorative, the real `<img>`
              still carries the alt text. */}
          {posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={posterUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className="absolute inset-0 hidden h-full w-full scale-110 object-cover object-center opacity-40 blur-2xl sm:block"
            />
          )}
          {/* HOW FAR YOU HAVE COME. In an endless feed the count is the only
              thing distinguishing a long session from a loop — bottom-left, on
              the artwork, clear of the W in the opposite corner. */}
          {rank != null && (
            <span
              data-testid="card-rank"
              className="wv-rank-chip"
              data-top={rank <= 3 ? '1' : '0'}
            >
              #{rank}
            </span>
          )}
          {/* The W sits ON the artwork: the action row is already three buttons
              wide and a fourth breaks at 320px, and the stamp has to be in the
              same place on every surface to read as one gesture. */}
          {overlay !== null && saveId != null && (
            <WCheck tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterUrl={posterUrl ?? null} />
          )}
          {/* MORE INFO LIVES ON THE ARTWORK, opposite the ▶ Trailer control.
              It was a fourth button in the decision row, and four 44px controls
              do not fit across a 272px grid column: the row wrapped to two
              lines and cost the card 56px — half the height this redesign had
              just recovered. On the frame it costs nothing, it pairs the two
              "explore this title" affordances together, and the decision row
              stays what it says it is: FOR · AGAINST · SAVE.

              `z-[2]` puts it under the trailer player (`z-[4]`): while a
              preview is running the frame belongs to the video, and ✕ takes
              this corner.

              Gated on `overlay !== null` as well as an id — that flag is the
              card's read-only mode, used by the landing example for a visitor
              with no account. More Info holds Save and FOR/AGAINST, both of
              which write, so offering it there would be a control that answers
              a tap with an error toast. */}
          {overlay !== null && saveId != null && (
            <MoreInfoButton
              variant="chip"
              className="absolute bottom-1 left-1 z-[2]"
              tmdbId={saveId}
              mediaType={mediaType}
              title={title}
              year={year ?? null}
              posterPath={posterPath ?? null}
            />
          )}
          {/* THE MEDIA FRAME'S ONLY OTHER OCCUPANT.
              TrailerMedia is a transparent passthrough when there is no id to
              resolve. Otherwise it paints `absolute inset-0` over the poster —
              iframe, controls, ▶ affordance, all of it — inside THIS box and
              nowhere else. It cannot change the card's height: the frame's size
              comes from `aspect-ratio`, and `contain: layout` on `.wv-card-art`
              stops anything inside from reaching the layout outside. */}
          <TrailerMedia tmdbId={saveId} mediaType={mediaType} title={title}>
            {onOpen ? (
              <button type="button" onClick={onOpen} className="relative block h-full w-full text-left" aria-label={`Quick look at ${title}`}>{poster}</button>
            ) : href ? (
              <Link href={href} className="relative block h-full w-full">{poster}</Link>
            ) : (
              <div className="relative h-full w-full">{poster}</div>
            )}
          </TrailerMedia>
        </div>

        <div className="wv-card-body">
          {onOpen ? (
            <button type="button" onClick={onOpen} className="block w-full text-left">{heading}</button>
          ) : href ? (
            <Link href={href} className="block">{heading}</Link>
          ) : (
            heading
          )}

          {/* Runtime, certificate, genre and season count — all of which we
              already hydrate to compute the score. Same fetch, no new request,
              one line. */}
          {saveId != null && <CardFacts mediaType={mediaType} tmdbId={saveId} className="mt-1.5" />}

          {children}

          {/* WILL I LIKE IT — the number, the call, and nothing else. The three
              source rating chips that used to sit beside it are the WORKING
              behind the number, and the working is in More Info now: on a grid
              column they wrapped to their own row, which is a whole row of card
              height spent restating evidence nobody has questioned yet.
              `mt-auto` pins the block to the bottom of the column so it ends
              level with the poster on a phone row. */}
          {saveId != null && (
            <AlgorithmScore
              compact
              hideRatings
              mediaType={mediaType}
              tmdbId={saveId}
              title={title}
              year={year ?? null}
              objectiveScore={objectiveScore}
              className="mt-auto pt-2"
            />
          )}
        </div>
      </div>

      {/* THE FULL WIDTH OF THE CARD, and the bottom of the reading order:
          one reason → where to watch → what you can do about it. */}
      <div className="wv-card-foot wv-card-stack">
        {/* ONE reason, two lines, reserved whether or not there is one. The
            full ranked set lives in More Info. */}
        {saveId != null && <CardReason mediaType={mediaType} tmdbId={saveId} className="mt-1" />}

        {/* WHERE TO WATCH — the question of FACT, kept separate from the
            question of TASTE answered by the score above it. Compact: one row
            of provider tiles, or the honest "not yet confirmed" label. The full
            block — every line, the live re-check, the availability panel — is
            in More Info. Everything it says still comes from
            `resolveWatchPresentation`; a high score can never produce
            "Watch now" here. */}
        {saveId != null && (
          <WhereToWatch
            compact
            mediaType={mediaType}
            tmdbId={saveId}
            title={title}
            year={year ?? null}
            posterPath={posterPath ?? null}
            className="mt-2"
          />
        )}

        {/* Supporting evidence a caller supplies (the household verdict, an
            airing row). Bounded by the caller; the card reserves nothing for
            it, so a surface that passes nothing pays nothing. */}
        {evidence && <div className="mt-2 space-y-2">{evidence}</div>}

        {/* WHAT CAN I DO — at the same height on every card in the grid,
            because everything above it is pinned (title 2 lines, reason 2
            lines, provider row 1 row) rather than because anything down here
            corrects for it.

            (It led the card until this pass, which was the right call when the
            card was 763px tall and the row would otherwise have been below the
            fold. At 465px the whole card is on screen, and the natural order of
            a decision — what it is, whether you'll like it, where it is, then
            what to do — puts the buttons last.) */}
        {overlay !== null && saveId != null && (
          <div className="wv-act-row mt-3">
            <CardVerdict tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterPath={posterPath ?? null} />
            {resolvedOverlay}
          </div>
        )}
      </div>
    </div>
  );
}
