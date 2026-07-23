import type { TileRatings } from '@/lib/ratings';
import type { MediaType } from '@/lib/types';
import { WatchCall } from './WatchCall';
import { useT } from '@/i18n/I18nProvider';

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
  const t = useT();
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
        title={t('title.watchabilityTip')}
      >
        {ratings.standardScore != null
          ? `${verdict === 'stream' ? '✅' : '⛔'} ${ratings.standardScore} · ${verdict === 'stream' ? t('verdict.call.watch') : t('verdict.call.skip')}`
          : t('title.streamSkipNa')}
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
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-gold-400" title={t('title.standardScoreTip')}>
              ⚖️ {ratings.standardScore}
            </span>
          )}
        </div>
      )}

      {/* Line 2 — all three source ratings on one line, sized up for legibility:
          no pills on 🍅/🍿 (just icon + value) so tomato, popcorn and IMDb fit. */}
      <div className="flex items-center gap-2.5 text-sm font-black tabular-nums">
        <RatingChip
          label="🍅"
          value={ratings.tomatometer != null ? `${ratings.tomatometer}%` : null}
          tone={ratings.tomatometer != null ? tomatoColor(ratings.tomatometer) : ''}
          title={t('title.tomatometerTip')}
        />
        <RatingChip
          label="🍿"
          value={popcorn != null ? `${popcorn}%` : null}
          tone={popcorn != null ? 'text-amber-200' : ''}
          title={ratings.rtAudience != null ? t('title.rtAudienceTip') : t('title.popcornTip')}
        />
        <span
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 ${ratings.imdb != null ? 'bg-[#f5c518] text-black' : 'bg-white/5 text-slate-500'}`}
          title={t('title.imdbTip')}
        >
          <span className="text-[10px] font-black opacity-80">IMDb</span> {ratings.imdb != null ? ratings.imdb.toFixed(1) : '–'}
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
      className={`inline-flex items-center gap-1 whitespace-nowrap ${value != null ? tone : 'text-slate-500'}`}
      title={title}
    >
      <span aria-hidden className="text-base leading-none">{label}</span>
      {value ?? '–'}
    </span>
  );
}
