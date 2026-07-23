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
    return <div className={`h-4 w-24 animate-pulse rounded bg-white/10 ${className}`} />;
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
    <div className={`flex flex-col gap-1.5 ${className}`}>
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

      {/* Line 2 — source ratings in an equal-width, auto-fitting grid (`.ratings-grid`).
          Available sources lay across the card and WRAP to a second row on a very
          narrow card rather than clipping — IMDb is never pushed off the edge.
          A source with no score is omitted cleanly (no awkward dash). */}
      <div className="ratings-grid text-sm font-black tabular-nums">
        {ratings.tomatometer != null && (
          <RatingChip label="🍅" value={`${ratings.tomatometer}%`} tone={tomatoColor(ratings.tomatometer)} title="Rotten Tomatoes — Tomatometer (critics)" />
        )}
        {popcorn != null && (
          <RatingChip
            label="🍿"
            value={`${popcorn}%`}
            tone="text-amber-200"
            title={ratings.rtAudience != null ? 'Rotten Tomatoes audience score (Popcorn)' : 'Audience / Popcorn score (from TMDB when Rotten Tomatoes’ own audience score isn’t available)'}
          />
        )}
        {ratings.imdb != null && (
          <span
            data-rating="imdb"
            className="inline-flex min-w-0 items-center justify-center gap-1 rounded bg-[#f5c518] px-1.5 py-0.5 text-black"
            title="IMDb rating"
          >
            <span className="text-[10px] font-black opacity-80">IMDb</span> {ratings.imdb.toFixed(1)}
          </span>
        )}
        {ratings.metacritic != null && (
          <RatingChip label="Ⓜ" value={`${ratings.metacritic}`} tone="text-teal-200" title="Metacritic Metascore" />
        )}
      </div>
    </div>
  );
}

/** One source rating — icon + full value, content-sized so it never truncates. */
function RatingChip({ label, value, tone, title }: { label: string; value: string; tone: string; title: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${tone}`} title={title}>
      <span aria-hidden className="text-base leading-none">{label}</span>
      {value}
    </span>
  );
}
