import type { TileRatings } from '@/lib/ratings';
import type { MediaType } from '@/lib/types';
import { WatchCall } from './WatchCall';

function tomatoColor(pct: number): string {
  return pct >= 60 ? 'text-red-300' : 'text-emerald-300';
}

/** A compact row of the real ratings for a title — shown right on the card so
 *  you don't have to open it: Tomatometer, audience, IMDb, Metacritic, and a
 *  Decider link. Renders only the sources we actually have (audience is TMDB's;
 *  RT's own popcorn score isn't in our data feed).
 *
 *  When `mediaType`/`tmdbId` are supplied, the leading call becomes the DNA-driven
 *  WatchCall (personalized when the user has rated enough, objective otherwise).
 */
export function RatingsStrip({
  ratings,
  mediaType,
  tmdbId,
  standard = false,
  hideCall = false,
  loading = false,
  className = '',
}: {
  ratings: TileRatings;
  /** Accepted for call-site convenience; no longer rendered. */
  title?: string;
  year?: number | null;
  mediaType?: MediaType;
  tmdbId?: number;
  standard?: boolean;
  /** Hide the leading Stream It / Skip It call — used when the card shows it in
   *  its top bar instead, leaving only the source chips here. */
  hideCall?: boolean;
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    // THE SKELETON IS THE SAME HEIGHT AS THE ROW IT BECOMES. It was a 16px bar
    // that turned into a 24px row of chips, so every card in the grid grew the
    // moment its ratings landed — and the cards below it moved. A placeholder
    // that is not its content's size is not a placeholder, it is a second
    // layout.
    return (
      <div className={`wv-ratings flex flex-col gap-1.5 ${className}`}>
        <div className="wv-ratings-row flex items-center gap-2.5 text-sm">
          {/* 26px — EXACTLY the height of the chips this becomes. It was a 16px
              bar inside a 24px row, and the chips render at 26, so every card
              in the grid grew 2px the moment its ratings landed. Two pixels is
              still the row below moving under a thumb. */}
          <span className="h-[26px] w-24 animate-pulse rounded-md bg-white/10" />
        </div>
      </div>
    );
  }

  // Our own Stream It / Skip It call, on every card. Derived from the blended
  // score; "NA" only when there's genuinely no score to judge (e.g. unreleased).
  const verdict = ratings.standardScore == null ? 'na' : ratings.standardScore >= 55 ? 'stream' : 'skip';
  const popcorn = ratings.rtAudience ?? ratings.audience;

  const call =
    mediaType && tmdbId ? (
      <WatchCall mediaType={mediaType} tmdbId={tmdbId} objectiveScore={ratings.standardScore ?? null} />
    ) : (
      <span
        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-black ${
          verdict === 'stream'
            ? 'bg-emerald-500/20 text-emerald-200'
            : verdict === 'skip'
              ? 'bg-red-500/20 text-red-200'
              : 'bg-white/10 text-slate-300'
        }`}
        title="WatchVerdict's Watchability score (0–100) and the Stream It / Skip It call it produces"
      >
        {ratings.standardScore != null
          ? `${verdict === 'stream' ? '✅' : '⛔'} ${ratings.standardScore} · ${verdict === 'stream' ? 'STREAM IT' : 'SKIP IT'}`
          : 'STREAM/SKIP: NA'}
      </span>
    );

  return (
    <div className={`wv-ratings flex flex-col gap-1.5 ${className}`}>
      {/* Line 1 — the one call, on its own line so it reads as the headline.
          Skipped when the card already shows the call in its top bar. */}
      {!hideCall && (
        <div className="flex items-center gap-2">
          {call}
          {standard && !(mediaType && tmdbId) && ratings.standardScore != null && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-gold-400" title="WatchVerdict Standard Score — blended across every rating source we have">
              ⚖️ {ratings.standardScore}
            </span>
          )}
        </div>
      )}

      {/* Line 2 — all three source ratings on one line, sized up for legibility:
          no pills on 🍅/🍿 (just icon + value) so tomato, popcorn and IMDb fit. */}
      {/* THREE COLUMNS, ONE LINE, ALWAYS.
          This wrapped when the card was too narrow for three chips, which made
          the row's height depend on the card's width AND on how many ratings
          the title happened to have — so it was 24px on one card and 54px on
          the next, and it changed the moment the numbers arrived. Every card in
          the grid grew and the row below it dropped.
          A three-column grid is one line at every width. `min-w-0` on each cell
          is what stops IMDb escaping the panel — the original reason for the
          wrap — without letting the height vary. */}
      {/* CONTENT-SIZED, NOT EQUAL THIRDS. Three equal columns give every chip
          the same width, and IMDb's wordmark makes it the widest of the three —
          so at 320px it was the one that got cut while the other two had slack.
          A no-wrap flex row lets each take what it needs and puts the spare in
          the gaps. `flex-nowrap` keeps the guarantee the grid was there for:
          one line, one height, at every width. */}
      {/* AN ICON WITH A DASH IS NOT A RATING.
          A source we do not hold was rendering as "🍅 –", which reads as a
          panel that failed to finish loading rather than as a title nobody has
          scored. Sources we have are shown; sources we do not are simply not
          claimed. When we hold NONE, the row says so in words once — the state
          is named, not left as three empty boxes. The row keeps its height
          either way, so nothing in the grid moves. */}
      {/* THE CHIPS SIT TOGETHER, and the slack goes at the end.
          `justify-between` pushed the spare width BETWEEN them, so whenever the
          row had room — a wide card, or the row wrapping onto a line of its
          own — three related numbers were spread across the panel with holes
          between them. They are one piece of evidence, so they group. */}
      <div className="wv-ratings-row flex min-w-0 flex-nowrap items-center justify-start gap-2 overflow-hidden text-sm font-black tabular-nums">
        {ratings.tomatometer == null && popcorn == null && ratings.imdb == null && (
          <span
            data-testid="ratings-none"
            className="inline-flex h-[26px] items-center whitespace-nowrap text-[11px] font-semibold text-slate-500"
            title="No critic, audience or IMDb score is published for this title yet"
          >
            Ratings not available yet
          </span>
        )}
        <RatingChip
          mark={<span aria-hidden className="wv-ratings-emoji flex-none text-[11px] leading-none sm:text-sm">🍅</span>}
          value={ratings.tomatometer != null ? `${ratings.tomatometer}%` : null}
          tone={ratings.tomatometer != null ? tomatoColor(ratings.tomatometer) : ''}
          title="Rotten Tomatoes — Tomatometer (critics)"
        />
        <RatingChip
          mark={<span aria-hidden className="wv-ratings-emoji flex-none text-[11px] leading-none sm:text-sm">🍿</span>}
          value={popcorn != null ? `${popcorn}%` : null}
          tone={popcorn != null ? 'text-amber-200' : ''}
          title={ratings.rtAudience != null ? 'Rotten Tomatoes audience score (Popcorn)' : 'Audience / Popcorn score (from TMDB when Rotten Tomatoes’ own audience score isn’t available)'}
        />
        {/* IMDb was a SOLID YELLOW PILL — the highest-contrast object on the
            card, on a row that is reference information. It read as the
            primary action, next to FOR/AGAINST/SAVE which are the actual
            actions. The wordmark keeps IMDb recognisable; the chip around it
            now matches its two neighbours. */}
        <RatingChip
          mark={<span className="wv-ratings-tag flex-none rounded-[3px] bg-[#f5c518] px-0.5 text-[8px] font-black leading-[1.5] text-black sm:px-1 sm:text-[9px]">IMDb</span>}
          value={ratings.imdb != null ? ratings.imdb.toFixed(1) : null}
          tone="text-amber-100"
          title="IMDb rating"
        />
      </div>
    </div>
  );
}

/**
 * ONE SOURCE RATING — and all three look like the same kind of object.
 *
 * They used to be three different shapes: two bare icon+number pairs and a
 * solid yellow IMDb pill. Same row, same rank, three treatments, and the
 * loudest one was reference information sitting next to the real actions.
 *
 * Now: one neutral chip, one height, one type scale. Colour is carried by the
 * NUMBER (a fresh tomato stays green, a rotten one red) rather than by the
 * container, so recognition survives without any of them competing with
 * FOR/AGAINST/SAVE.
 *
 * A SOURCE WE DO NOT HOLD RENDERS NOTHING. It used to render "–" in the same
 * box, which is a claim shaped like data: an empty tomato and an empty IMDb
 * make the panel look unfinished rather than making the title look unrated.
 * The row names that state once, in words, when it holds nothing at all.
 */
function RatingChip({
  mark,
  value,
  tone,
  title,
}: {
  mark: React.ReactNode;
  value: string | null;
  tone: string;
  title: string;
}) {
  if (value == null) return null;
  return (
    <span
      /* TIGHT ON PURPOSE. In a row card the body is ~186px wide, so each of
         the three chips gets ~58px. The first pass used px-1.5, gap-1 and 13px
         text, which needed ~62 and truncated every value to "5…". Padding is
         the first thing to give up; the number is the last. */
      /* THE CHROME IS THE FIRST THING TO GO, THE NUMBER IS THE LAST.
         In a row card at 320px the body is ~142px, so each of the three chips
         gets ~45. A padded, ringed chip needs ~52 and clips "6.8" to "6" — a
         rating that shows the wrong number is worse than one that shows none.
         So below `sm` the chips lose their fill, ring and padding and keep only
         what the requirement actually asks for: one height, one type scale, one
         spacing. The chip treatment returns from `sm`, where it fits. */
      className={`inline-flex h-[26px] min-w-0 items-center gap-0.5 overflow-hidden whitespace-nowrap rounded-md text-xs sm:gap-1 sm:bg-white/[0.06] sm:px-1.5 sm:text-[13px] sm:ring-1 sm:ring-white/10 ${tone}`}
      title={title}
    >
      {mark}
      {/* NOT truncated. A rating that reads "5…" is worse than one that is
          absent — it looks like data we have and cannot show. If it genuinely
          will not fit, the chip clips at its own edge and the test below
          catches it. */}
      <span className="font-black">{value}</span>
    </span>
  );
}
