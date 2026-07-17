import type { TileRatings } from '@/lib/ratings';
import { deciderSearchUrl } from '@/lib/ratings';

function tomatoColor(pct: number): string {
  return pct >= 60 ? 'text-red-300' : 'text-emerald-300';
}

/** A compact row of the real ratings for a title — shown right on the card so
 *  you don't have to open it: Tomatometer, audience, IMDb, Metacritic, and a
 *  Decider link. Renders only the sources we actually have (audience is TMDB's;
 *  RT's own popcorn score isn't in our data feed). */
export function RatingsStrip({
  ratings,
  title,
  year,
  decider = true,
  standard = false,
  loading = false,
  className = '',
}: {
  ratings: TileRatings;
  title: string;
  year?: number | null;
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

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold tabular-nums ${className}`}>
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
      {standard && ratings.standardScore != null && (
        <span className="inline-flex items-center gap-0.5 text-gold-400" title="WatchVerdict Standard Score — blended across every rating source we have">
          ⚖️ {ratings.standardScore}
        </span>
      )}
      {ratings.tomatometer != null && (
        <span className={`inline-flex items-center gap-0.5 ${tomatoColor(ratings.tomatometer)}`} title="Rotten Tomatoes — Tomatometer (critics)">
          🍅 {ratings.tomatometer}%
        </span>
      )}
      {(ratings.rtAudience ?? ratings.audience) != null && (
        <span
          className="inline-flex items-center gap-0.5 text-amber-200"
          title={ratings.rtAudience != null ? 'Rotten Tomatoes audience score (Popcorn)' : 'Audience score (TMDB — no Rotten Tomatoes audience score available for this title)'}
        >
          🍿 {ratings.rtAudience ?? ratings.audience}%
        </span>
      )}
      {ratings.imdb != null && (
        <span className="inline-flex items-center gap-0.5 rounded bg-[#f5c518] px-1 text-[10px] font-black text-black" title="IMDb rating">
          IMDb {ratings.imdb.toFixed(1)}
        </span>
      )}
      {ratings.metacritic != null && (
        <span className="inline-flex items-center gap-0.5 text-sky-300" title="Metacritic (critics)">
          Ⓜ {ratings.metacritic}
        </span>
      )}
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
