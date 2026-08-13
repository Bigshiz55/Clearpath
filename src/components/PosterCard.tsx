import Link from 'next/link';
import type { MediaType } from '@/lib/types';
import { AlgorithmScore } from './AlgorithmScore';
import { SaveButton } from './SaveButton';
import { CardVerdict } from './CardVerdict';
import { WCheck } from './WCheck';
import { CardSynopsis } from './CardSynopsis';
import { CardFacts } from './CardFacts';
import { CardFit } from './CardFit';
import { WhereToWatch } from './watch/WhereToWatch';
import { TrailerMedia } from './trailer/TrailerMedia';
import { WhyThisTitle } from './watch/WhyThisTitle';

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

export function PosterCard({ href, title, year, mediaType, posterUrl, posterPath, tmdbId, meta, children, overlay, onOpen, rank, evidence, objectiveScore = null }: PosterCardProps) {
  // FROM `sm`, THE POSTER IS LETTERBOXED, NOT CROPPED. The tile itself is now a
  // fixed, shorter box (see `.wv-card-art`) — `object-contain` keeps the whole
  // poster visible inside it, centered, at its true proportions. `object-cover`
  // on a phone row is untouched: that box IS exactly 2:3, so cover there never
  // crops anything.
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
          than scanned, so it is sized for reading.

          IT RESERVES BOTH LINES WHETHER IT NEEDS THEM OR NOT. The clamp caps a
          long title at two lines, but a SHORT one took only one — so in a row
          of four cards, "A" and "Gōngfu Sūpermán 功夫超人 — Édition Spéciale"
          started their facts, score, synopsis and provider row at different
          heights, and nothing below lined up across the row. Reserving the
          second line costs one line of space on short titles and buys a grid
          whose rows scan straight across. */}
      <div className="line-clamp-2 min-h-[2.75rem] text-base font-semibold leading-snug text-white sm:min-h-[2.5rem] sm:text-sm">{title}</div>
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
      {/* THE DECISION ROW LEADS THE CARD. FOR · AGAINST · SAVE used to sit at
          the very bottom, which on the new shorter tiles meant scrolling past
          poster, facts, score and synopsis before you could act. On request
          the row is now the FIRST thing on every card — rule at the top, then
          drop down to the W on the artwork if it belongs on the docket. */}
      {overlay !== null && saveId != null && (
        <div className="wv-act-row border-b border-white/10 p-2.5 pb-2 sm:p-3 sm:pb-2.5">
          <CardVerdict tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterPath={posterPath ?? null} />
          {resolvedOverlay}
        </div>
      )}
      <div className="wv-card">
      <div className="wv-card-art">
        {/* THE MATTE, FROM `sm` ONLY. A blurred, scaled-up copy of the SAME
            image (no extra request — the browser already has it cached) fills
            the shorter box behind the true, uncropped poster, so the empty
            band `object-contain` leaves top/bottom or side-to-side reads as a
            deliberate frame instead of dead black bars. `aria-hidden`: purely
            decorative, the real `<img>` below still carries the alt text. */}
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
        {/* `relative` so the real poster paints ABOVE the absolutely-positioned
            matte behind it, regardless of DOM stacking specifics.
            TrailerMedia is a transparent passthrough by default (feature off /
            no id / SSR): it renders exactly the click target below, unchanged.
            When Smart Trailer Preview is on and this card becomes the single
            active one, it crossfades a muted official trailer over the poster
            inside the SAME box (no height change), with its controls as a
            sibling overlay — never nested inside the button/Link. */}
        <TrailerMedia tmdbId={saveId} mediaType={mediaType} title={title}>
          {onOpen ? (
            <button type="button" onClick={onOpen} className="relative block h-full w-full text-left" aria-label={`Quick look at ${title}`}>{poster}</button>
          ) : href ? (
            <Link href={href} className="relative block h-full">{poster}</Link>
          ) : (
            <div className="relative h-full">{poster}</div>
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

        {/* THE COLUMN BESIDE THE POSTER WAS EMPTY, AND THE FACTS WERE MISSING.
            A 2:3 poster is ~210px tall and a title is two lines, so every card
            carried ~150px of black beside its artwork — while runtime,
            certificate, genre and season count, all of which we already hydrate
            to compute the score, appeared nowhere. Same fetch, no new request. */}
        {saveId != null && <CardFacts mediaType={mediaType} tmdbId={saveId} className="mt-1.5" />}

        {children}

        {/* THE NUMBER GOES NEXT TO THE ARTWORK, where the eye already is.
            It was drawn full-width below the poster, which pushed the whole
            card ~75px taller to say something that fits in the space that was
            already sitting empty. Poster, title, facts and verdict now read as
            one at-a-glance block; the detail follows underneath.
            `mt-auto` pins it to the bottom of the column, so the block ends
            level with the poster instead of leaving the gap it was put there
            to fill. */}
        {saveId != null && (
          <AlgorithmScore compact mediaType={mediaType} tmdbId={saveId} title={title} year={year ?? null} objectiveScore={objectiveScore} className="mt-auto pt-2" />
        )}
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
        {saveId != null && <CardSynopsis mediaType={mediaType} tmdbId={saveId} lines={2} className="mt-1" />}

        {/* WHY THIS TITLE IS HERE — the first of the card's two questions,
            answered before the second. Compact reasons, one or two shown, the
            rest behind "Why?". Renders nothing when nothing can be
            substantiated; see src/lib/reasons/whyThisTitle.ts. */}
        {saveId != null && (
          <WhyThisTitle
            mediaType={mediaType}
            tmdbId={saveId}
            className="mt-1.5"
          />
        )}

        {/* The one-sentence taste explanation, when the rated history supports
            one. Kept alongside the reason chips: the chips say WHAT matched,
            this says it in the user's own terms. */}
        {saveId != null && <CardFit mediaType={mediaType} tmdbId={saveId} className="mt-1.5" />}

        {/* WHERE TO WATCH — the question of FACT, kept separate from the
            question of TASTE answered by the verdict panel above it.
            Everything it says, including its call to action, comes from
            `resolveWatchPresentation`; a high score can never produce
            "Watch now" here. When we have not confirmed availability it says
            so and offers "Check availability" instead of a link that would go
            nowhere. See src/lib/availability/watchPresentation.ts. */}
        {saveId != null && <WhereToWatch
            mediaType={mediaType}
            tmdbId={saveId}
            title={title}
            year={year ?? null}
            posterPath={posterPath ?? null}
            className="mt-1.5"
          />}

        {/* Supporting evidence: the pills, the household verdict, and the
            "Why this Verd1ct?" panel. */}
        {evidence && <div className="space-y-2">{evidence}</div>}

        {/* MORE INFO — WHERE THE DEEP DETAIL LIVES.
            The card answers four questions: what is it, will I like it, where
            can I watch it, what can I do about it. Everything beyond that —
            the full synopsis, every reason, the cautions, the detailed
            ratings, the expanded availability, the cast, the deeper DNA
            explanation — belongs one level down, and one level down already
            exists: the title page. This is a link to THAT, not a second
            detail surface built beside it.
            It also gives the card a deliberate end, which the foot did not
            have — the last thing on it was whatever async block happened to
            resolve last. */}
        {saveId != null && (
          <Link
            /* Derived, not required from the caller. Every card that knows its
               id knows where its title page is, and a card whose poster opens
               a QuickLook (`onOpen`, no `href`) still needs a way through to
               the full detail — that is precisely the card this affordance
               exists for. */
            href={href ?? `/app/title/${mediaType}/${saveId}`}
            data-testid="card-more-info"
            className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-[13px] font-semibold text-brand-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
          >
            More info
            <span aria-hidden>→</span>
          </Link>
        )}

        {/* The FOR/AGAINST/SAVE row lives at the TOP of the card now — see the
            block above `.wv-card`. The foot ends on the evidence. */}
      </div>
    </div>
  );
}
