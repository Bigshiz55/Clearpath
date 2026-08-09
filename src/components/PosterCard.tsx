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
      {/* THE DECISION ROW LEADS THE CARD. FOR · AGAINST · SAVE used to sit at
          the very bottom, which on the new shorter tiles meant scrolling past
          poster, facts, score and synopsis before you could act. On request
          the row is now the FIRST thing on every card — rule at the top, then
          drop down to the W on the artwork if it belongs on the docket. */}
      {/* THE VERDICT/RULING LEADS THE CARD AT EVERY WIDTH. FOR · AGAINST is the
          card's ruling — it stays on the two-across mobile tile (owner spec: the
          verdict/score is tile item #2 and ruling a title is a primary action).
          What the mobile tile does NOT carry is the crushed THREE-button bar:
          SAVE joins this row only from `sm`; on a phone the ruling is FOR/AGAINST
          alone (the `.wv-act-row` container query keeps the words intact and
          drops the decorative icon before it ever cuts one), and Save sits as
          its own clear action in the body below. */}
      {overlay !== null && saveId != null && (
        <div className="wv-act-row border-b border-white/10 p-2.5 pb-2 sm:p-3 sm:pb-2.5">
          <CardVerdict tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterPath={posterPath ?? null} />
          {/* `contents` so SaveButton flexes as a peer of the ruling buttons on
              desktop; hidden on the phone tile to avoid the three-button crush. */}
          <div className="hidden sm:contents">{resolvedOverlay}</div>
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
        {/* MOBILE: the Verd1ct SCORE rides ON the poster (top-left, clear of the
            W top-right and the rank bottom-left). This is the "score/verdict
            treatment on the poster" the two-across card leads with; the full
            score panel with source ratings is disclosed from `sm` and on the
            title page. `pointer-events-none` so a tap still opens the poster. */}
        {saveId != null && (
          <AlgorithmScore
            badgeOnly
            compact
            mediaType={mediaType}
            tmdbId={saveId}
            title={title}
            year={year ?? null}
            className="wv-only-mobile pointer-events-none absolute left-1.5 top-1.5 z-10 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]"
          />
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

        {/* DESKTOP-ONLY facts (runtime, certificate, genre, seasons). On the
            mobile card these are progressively disclosed on the title page — the
            collapsed tile stays poster + score + title + year + one action. */}
        {saveId != null && <CardFacts mediaType={mediaType} tmdbId={saveId} className="mt-1.5 hidden sm:block" />}

        {children}

        {/* MOBILE: the single clear action — Save. The full FOR/AGAINST/SAVE bar
            is disclosed from `sm`; here one comfortable tap target is enough,
            and the poster itself opens the title (with its trailer). */}
        {overlay !== null && saveId != null && (
          <div className="wv-only-mobile mt-2">
            <SaveButton wide tmdbId={saveId} mediaType={mediaType} title={title} year={year ?? null} posterPath={posterPath ?? null} />
          </div>
        )}

        {/* DESKTOP-ONLY score panel beside the artwork. On mobile the score is
            the badge ON the poster (above); the full panel with source ratings
            is a `sm`-and-up / title-page treatment. `mt-auto` pins it to the
            bottom of the column so the block ends level with the poster. */}
        {saveId != null && (
          <AlgorithmScore compact mediaType={mediaType} tmdbId={saveId} title={title} year={year ?? null} className="mt-auto hidden pt-2 sm:block" />
        )}
      </div>
      </div>

      {/* THE FULL WIDTH OF THE CARD. Everything from here down was being drawn
          in the narrow column beside the poster while the space under the
          poster sat empty — which is why the two "why" sentences were cut. */}
      <div className="wv-card-foot">
        {/* DESKTOP-ONLY DETAIL (progressive disclosure). Synopsis, why-it-fits
            and the taste line are the "detailed information" the owner spec
            moves off the collapsed two-across tile and onto the title page —
            stuffing them into a ~140px card is exactly what destroys legibility.
            From `sm` the card is wide enough to carry them, so they return. */}
        <div className="hidden sm:block">
          {/* What it is about, straight from TMDB. Renders nothing when there is
              no synopsis rather than showing a placeholder. */}
          {saveId != null && <CardSynopsis mediaType={mediaType} tmdbId={saveId} lines={2} className="mt-1" />}

          {/* WHY THIS TITLE IS HERE — the first of the card's two questions.
              Compact reasons, one or two shown, the rest behind "Why?". */}
          {saveId != null && (
            <WhyThisTitle
              mediaType={mediaType}
              tmdbId={saveId}
              className="mt-1.5"
            />
          )}

          {/* The one-sentence taste explanation, when the rated history supports
              one. The chips say WHAT matched; this says it in the user's terms. */}
          {saveId != null && <CardFit mediaType={mediaType} tmdbId={saveId} className="mt-1.5" />}
        </div>

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
            "Why this Verd1ct?" panel — desktop-only detail, disclosed on the
            title page from the mobile card. */}
        {evidence && <div className="hidden space-y-2 sm:block">{evidence}</div>}

        {/* The FOR/AGAINST/SAVE row lives at the TOP of the card now — see the
            block above `.wv-card`. The foot ends on the evidence. */}
      </div>
    </div>
  );
}
