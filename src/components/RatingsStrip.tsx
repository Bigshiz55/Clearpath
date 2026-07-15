import type { TileRatings } from '@/lib/ratings';
import { deciderSearchUrl, hasAnyRating } from '@/lib/ratings';

function tomatoColor(pct: number): string {
  return pct >= 60 ? 'text-red-300' : 'text-emerald-300';
}

/** A compact row of the real ratings for a title — shown right on the tile so
 *  you don't have to open it. Renders only the sources we actually have. */
export function RatingsStrip({
  ratings,
  title,
  year,
  decider = true,
  className = '',
}: {
  ratings: TileRatings;
  title: string;
  year?: number | null;
  decider?: boolean;
  className?: string;
}) {
  if (!hasAnyRating(ratings) && !decider) return null;

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold tabular-nums ${className}`}>
      {ratings.standardScore != null && (
        <span className="inline-flex items-center gap-0.5 text-gold-400" title="WatchVerdict Standard Score — blended across every rating source we have">
          ⚖️ {ratings.standardScore}
        </span>
      )}
      {ratings.tomatometer != null && (
        <span className={`inline-flex items-center gap-0.5 ${tomatoColor(ratings.tomatometer)}`} title="Rotten Tomatoes — Tomatometer (critics)">
          🍅 {ratings.tomatometer}%
        </span>
      )}
      {ratings.audience != null && (
        <span className="inline-flex items-center gap-0.5 text-slate-300" title="Audience score (TMDB)">
          👥 {ratings.audience}%
        </span>
      )}
      {ratings.imdb != null && (
        <span className="inline-flex items-center gap-0.5 text-amber-200" title="IMDb rating">
          ⭐ {ratings.imdb.toFixed(1)}
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
          title="Decider — Stream It or Skip It? (opens Decider; they have no public rating feed)"
        >
          Decider ↗
        </a>
      )}
    </div>
  );
}
