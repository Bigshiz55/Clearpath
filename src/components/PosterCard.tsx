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

export function PosterCard({ href, title, year, mediaType, posterUrl, posterPath, tmdbId, meta, children, overlay, onOpen, rank, evidence }: PosterCardProps) {
  // FROM `sm`, THE POSTER IS LETTERBOXED, NOT CROPPED. The tile itself is a
  // fixed, shorter box there (see `.wv-card-art`) — `object-contain` keeps the
  // whole poster visible inside it, centered, at its true proportions.
  // `object-cover` on a phone is untouched: that box IS exactly 2:3 and spans
  // the cell, so cover there never crops anything.
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
      {/* 13px on a two-across phone card, 14 from `sm`. The old 16px was sized
          for a full-width card; in a 138px cell it fits about nine characters a
          line, so every title but the shortest truncated. 13px black-on-white
          at two lines is still comfortably readable and holds most titles. */}
      <div className="line-clamp-2 text-[13px] font-semibold leading-snug text-white sm:text-sm">{title}</div>
      {/* Type and year stay on the phone card — they are the two facts that
          disambiguate a poster you half-recognise. `flex-wrap` because at 320px
          "Movie · 2024 · Documentary" does not fit one 122px line, and a
          wrapped second line is better than a clipped first one. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-400 sm:text-xs">
        <span className="flex-none rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
          {mediaType === 'movie' ? 'Movie' : 'TV'}
        </span>
        <span className="min-w-0 truncate">
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
  // A COLUMN AT EVERY WIDTH — TWO ACROSS ON A PHONE (owner-approved).
  //
  // The card was full-width and vertical, then sideways-and-full-width, and is
  // now vertical in a two-column grid. Each step was answering the same
  // question: how many titles can a phone screen show without any of them
  // becoming unreadable. Full-width vertical showed ONE (2:3 at 406px is 609px
  // of artwork before the title). Sideways showed three, by giving the poster a
  // third of the width and putting a synopsis beside it. Two-across shows six,
  // by giving the poster the whole cell and moving the PROSE — synopsis, "why
  // it fits", the taste sentence, the facts line and the rating chips — to `sm`
  // and up, where there is a paragraph's width for it.
  //
  // What never moved is the decision: the FOR/AGAINST ruling, Save, the VERD1CT
  // score and where-to-watch are on the card at every width, in compact form.
  // Browsing is a scanning task; the card only has to carry what you act on.
  //
  // From `sm` the grid auto-fills at 280px+ and the card carries everything.
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
        <div className="wv-act-row border-b border-white/10 p-2 pb-1.5 sm:p-3 sm:pb-2.5">
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

        {/* THE FACTS WE ALREADY HOLD. Runtime, certificate, genre and season
            count are hydrated to compute the score and used to appear on no
            card at all. Same fetch, no new request. */}
        {/* `sm` AND UP. Runtime · certificate · genre is a three-part line that
            needs ~200px; in a 138px cell it truncates to "1h 4…" on the first
            fact and drops the other two, which is worse than not claiming to
            list them. The title page carries the same facts in full. */}
        {saveId != null && <CardFacts mediaType={mediaType} tmdbId={saveId} className="mt-1.5 hidden sm:block" />}

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
          <AlgorithmScore compact mediaType={mediaType} tmdbId={saveId} title={title} year={year ?? null} className="mt-auto pt-2" />
        )}
      </div>
      </div>

      {/* THE CARD'S LOWER HALF — availability, the evidence, and (from `sm`)
          the prose. It is also the container the availability block sizes
          itself against; see `.wv-card-foot` in globals.css. */}
      <div className="wv-card-foot">
        {/* ── THE PROSE ZONE IS `sm` AND UP ──────────────────────────────────
            Synopsis, "why it fits" and the taste sentence are the three blocks
            that need a paragraph's worth of width. Two-across phone cards do
            not have one — a 14px synopsis in a 122px text lane is four or five
            words a line, and two lines of that ends mid-article rather than
            mid-clause. They are not deleted, they are relocated: every one of
            them is on the title page in full, one tap away, and all three come
            back on the card from `sm` where the column is 280px+.
            What stays on the phone card is what you ACT on — the score, the
            ruling, Save and where to watch. */}
        {/* What it is about, straight from TMDB. Renders nothing when there is
            no synopsis rather than showing a placeholder. */}
        {saveId != null && <CardSynopsis mediaType={mediaType} tmdbId={saveId} lines={2} className="mt-1 hidden sm:block" />}

        {/* WHY THIS TITLE IS HERE — the first of the card's two questions,
            answered before the second. Compact reasons, one or two shown, the
            rest behind "Why?". Renders nothing when nothing can be
            substantiated; see src/lib/reasons/whyThisTitle.ts. */}
        {saveId != null && (
          <WhyThisTitle
            mediaType={mediaType}
            tmdbId={saveId}
            className="mt-1.5 hidden sm:block"
          />
        )}

        {/* The one-sentence taste explanation, when the rated history supports
            one. Kept alongside the reason chips: the chips say WHAT matched,
            this says it in the user's own terms. */}
        {saveId != null && <CardFit mediaType={mediaType} tmdbId={saveId} className="mt-1.5 hidden sm:block" />}

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

        {/* The FOR/AGAINST/SAVE row lives at the TOP of the card now — see the
            block above `.wv-card`. The foot ends on the evidence. */}
      </div>
    </div>
  );
}
