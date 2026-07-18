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
  const dim = 'text-slate-500';

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold tabular-nums ${className}`}>
      {mediaType && tmdbId ? (
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
      )}
      {standard && ratings.standardScore != null && (
        <span className="inline-flex items-center gap-0.5 text-gold-400" title="WatchVerdict Standard Score — blended across every rating source we have">
          ⚖️ {ratings.standardScore}
        </span>
      )}

      {/* A fixed set of icons on EVERY card — value, or "–" when unavailable — so
          the row is consistent and easy to scan across cards. */}
      <span className={`inline-flex items-center gap-0.5 ${ratings.tomatometer != null ? tomatoColor(ratings.tomatometer) : dim}`} title="Rotten Tomatoes — Tomatometer (critics)">
        🍅 {ratings.tomatometer != null ? `${ratings.tomatometer}%` : '–'}
      </span>
      <span
        className={`inline-flex items-center gap-0.5 ${popcorn != null ? 'text-amber-200' : dim}`}
        title={ratings.rtAudience != null ? 'Rotten Tomatoes audience score (Popcorn)' : 'Audience / Popcorn score (from TMDB when Rotten Tomatoes’ own audience score isn’t available)'}
      >
        🍿 {popcorn != null ? `${popcorn}%` : '–'}
      </span>
      <span className={`inline-flex items-center gap-0.5 rounded px-1 text-[10px] font-black ${ratings.imdb != null ? 'bg-[#f5c518] text-black' : `border border-white/15 ${dim}`}`} title="IMDb rating">
        IMDb {ratings.imdb != null ? ratings.imdb.toFixed(1) : '–'}
      </span>
      <span className={`inline-flex items-center gap-0.5 ${ratings.metacritic != null ? 'text-sky-300' : dim}`} title="Metacritic (critics)">
        Ⓜ {ratings.metacritic != null ? ratings.metacritic : '–'}
      </span>

      {decider && (
        <a
          href={deciderSearchUrl(title, year)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 text-brand-300 hover:text-brand-200"
          title="Decider — Stream It or Skip It? (opens Decider; they have no public rating feed to embed)"
        >
          Decider ↗
        </a>
      )}
    </div>
  );
}
