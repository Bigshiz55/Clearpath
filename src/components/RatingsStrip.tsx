import type { TileRatings } from '@/lib/ratings';
import { imdbScore, pctScore } from '@/lib/ratings';
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

  // Every external metric is validated before it can render. IMDb specifically
  // treats 0 / NaN / "N/A" / "-" as MISSING (never "IMDb —"); percentages keep 0
  // (a real 0% score) but reject NaN/out-of-range. Missing values simply don't
  // render — no dash, no empty badge, no reserved space; the rest reflows.
  const critics = pctScore(ratings.tomatometer);
  const popcorn = pctScore(ratings.rtAudience ?? ratings.audience);
  const imdb = imdbScore(ratings.imdb);
  const meta = pctScore(ratings.metacritic);

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

      {/* Verified external ratings, laid out by PRIORITY. Only genuinely-available
          metrics render — a missing source leaves NO dash, badge, or blank space,
          and the rest reflow/center naturally:
            Row 1 — Critics + Audience (% scores; whichever exist).
            Row 2 — IMDb (+ Metacritic) on its OWN row, so IMDb (secondary) never
                    widens/crowds the panel and is never clipped.
          Each item is `whitespace-nowrap`, so a label is never truncated. */}
      {(critics != null || popcorn != null) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold tabular-nums">
          {critics != null && (
            <MetricLabel data-rating="critics" label="Critics" value={`${critics}%`} tone={tomatoColor(critics)} title="Rotten Tomatoes — Tomatometer (critics)" />
          )}
          {popcorn != null && (
            <MetricLabel
              data-rating="audience"
              label="Audience"
              value={`${popcorn}%`}
              tone="text-amber-200"
              title={ratings.rtAudience != null ? 'Rotten Tomatoes audience score (Popcorn)' : 'Audience score (from TMDB when Rotten Tomatoes’ own audience score isn’t available)'}
            />
          )}
        </div>
      )}
      {(imdb != null || meta != null) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold tabular-nums">
          {imdb != null && (
            <span
              data-rating="imdb"
              className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-[#f5c518] px-1.5 py-0.5 leading-none text-black"
              title="IMDb rating"
            >
              <span className="text-[10px] font-black opacity-80">IMDb</span> {imdb.toFixed(1)}
            </span>
          )}
          {meta != null && (
            <MetricLabel data-rating="metacritic" label="Metacritic" value={`${meta}`} tone="text-teal-200" title="Metacritic Metascore" />
          )}
        </div>
      )}
    </div>
  );
}

/** One source rating — "Label 84%", content-sized so it never truncates. The label
 *  is a muted word so the value stays the emphasis. */
function MetricLabel({ label, value, tone, title, ...rest }: { label: string; value: string; tone: string; title: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`inline-flex items-baseline gap-1 whitespace-nowrap ${tone}`} title={title} {...rest}>
      <span className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</span>
      {value}
    </span>
  );
}
