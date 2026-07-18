import type { TileRatings } from '@/lib/ratings';
import { deciderSearchUrl } from '@/lib/ratings';
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
  title,
  year,
  mediaType,
  tmdbId,
  decider = true,
  standard = false,
  hideCall = false,
  loading = false,
  className = '',
}: {
  ratings: TileRatings;
  title: string;
  year?: number | null;
  mediaType?: MediaType;
  tmdbId?: number;
  decider?: boolean;
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
        title="WatchVerdict's Stream It or Skip It call for this title"
      >
        {verdict === 'stream' ? '✅ STREAM IT' : verdict === 'skip' ? '⛔ SKIP IT' : 'STREAM/SKIP: NA'}
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

      {/* Line 2 — the source ratings, as aligned chips so they line up card to
          card and scan cleanly. A fixed set (value or "–" when unavailable). */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold tabular-nums">
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
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${ratings.imdb != null ? 'bg-[#f5c518] text-black' : 'bg-white/5 text-slate-500'}`}
          title="IMDb rating"
        >
          IMDb {ratings.imdb != null ? ratings.imdb.toFixed(1) : '–'}
        </span>
        {decider && (
          <a
            href={deciderSearchUrl(title, year)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 rounded-md bg-white/5 px-1.5 py-0.5 text-brand-300 hover:bg-white/10 hover:text-brand-200"
            title="Decider — Stream It or Skip It? (opens Decider; they have no public rating feed to embed)"
          >
            Decider ↗
          </a>
        )}
      </div>
    </div>
  );
}

/** One source chip — value in a subtle pill, dimmed to "–" when unavailable, so
 *  the row stays aligned across cards. */
function RatingChip({ label, value, tone, title }: { label: string; value: string | null; tone: string; title: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 ${value != null ? tone : 'text-slate-500'}`}
      title={title}
    >
      <span aria-hidden>{label}</span>
      {value ?? '–'}
    </span>
  );
}
