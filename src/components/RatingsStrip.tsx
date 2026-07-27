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
          <span className="h-4 w-24 animate-pulse rounded bg-white/10" />
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
      <div className="wv-ratings-row grid min-w-0 grid-cols-3 items-center gap-1.5 text-sm font-black tabular-nums">
        <RatingChip
          label="🍅"
          value={ratings.tomatometer != null ? `${ratings.tomatometer}%` : null}
          tone={ratings.tomatometer != null ? tomatoColor(ratings.tomatometer) : ''}
          title="Rotten Tomatoes — Tomatometer (critics)"
        />
        <RatingChip
          label="🍿"
          value={popcorn != null ? `${popcorn}%` : null}
          tone={popcorn != null ? 'text-amber-200' : ''}
          title={ratings.rtAudience != null ? 'Rotten Tomatoes audience score (Popcorn)' : 'Audience / Popcorn score (from TMDB when Rotten Tomatoes’ own audience score isn’t available)'}
        />
        <span
          className={`inline-flex min-w-0 items-center justify-self-start gap-1 overflow-hidden whitespace-nowrap rounded px-1.5 py-0.5 ${ratings.imdb != null ? 'bg-[#f5c518] text-black' : 'bg-white/5 text-slate-500'}`}
          title="IMDb rating"
        >
          <span className="wv-ratings-tag text-[10px] font-black opacity-80">IMDb</span> {ratings.imdb != null ? ratings.imdb.toFixed(1) : '–'}
        </span>
      </div>
    </div>
  );
}

/** One source rating — icon + value, dimmed to "–" when unavailable. No pill, so
 *  all three ratings fit one line in a narrow card. */
function RatingChip({ label, value, tone, title }: { label: string; value: string | null; tone: string; title: string }) {
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap ${value != null ? tone : 'text-slate-500'}`}
      title={title}
    >
      <span aria-hidden className="wv-ratings-emoji text-base leading-none">{label}</span>
      {value ?? '–'}
    </span>
  );
}
