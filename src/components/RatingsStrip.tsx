import type { TileRatings } from '@/lib/ratings';
import type { MediaType } from '@/lib/types';
import { WatchCall } from './WatchCall';
import { useT } from '@/i18n/I18nProvider';

function tomatoColor(pct: number): string {
  return pct >= 60 ? 'text-red-300' : 'text-emerald-300';
}

/** A compact row of the real ratings for a title — shown right on the card so
 *  you don't have to open it: Rotten Tomatoes critics, audience, and IMDb.
 *  Rendered as a fixed three-column grid so each source keeps its own cell and
 *  nothing (IMDb especially) is ever clipped or pushed out on a narrow card.
 *  Sources we don't have degrade to a muted "–" in place, so the row never
 *  collapses into an awkward gap.
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
    return <div className={`h-9 w-full animate-pulse rounded-lg bg-white/[0.06] ${className}`} />;
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

      {/* The three external sources — a fixed 3-column grid so each keeps an
          equal, aligned cell that can't clip its neighbour. Icon/label on top,
          value beneath, so even at iPhone-SE two-column widths the value has the
          full cell to itself. Missing sources show a muted "–" in place. */}
      <div
        role="group"
        aria-label={t('card.rate.groupAria')}
        className="grid grid-cols-3 items-end gap-1"
      >
        <RatingCell
          icon="🍅"
          value={ratings.tomatometer != null ? `${ratings.tomatometer}%` : null}
          tone={ratings.tomatometer != null ? tomatoColor(ratings.tomatometer) : ''}
          ariaLabel={ratings.tomatometer != null ? t('card.rate.criticAria', { score: ratings.tomatometer }) : t('card.rate.criticNaAria')}
        />
        <RatingCell
          icon="🍿"
          value={popcorn != null ? `${popcorn}%` : null}
          tone={popcorn != null ? 'text-amber-200' : ''}
          ariaLabel={popcorn != null ? t('card.rate.audienceAria', { score: popcorn }) : t('card.rate.audienceNaAria')}
        />
        <ImdbCell
          value={ratings.imdb != null ? ratings.imdb.toFixed(1) : null}
          ariaLabel={ratings.imdb != null ? t('card.rate.imdbAria', { score: ratings.imdb.toFixed(1) }) : t('card.rate.imdbNaAria')}
        />
      </div>
    </div>
  );
}

/** One RT source cell — emoji label over the value. A missing source keeps its
 *  cell (so the grid stays aligned) and reads as a dimmed "–". */
function RatingCell({ icon, value, tone, ariaLabel }: { icon: string; value: string | null; tone: string; ariaLabel: string }) {
  return (
    <span className="flex flex-col items-center gap-0.5" role="img" aria-label={ariaLabel}>
      <span aria-hidden className="text-sm leading-none">{icon}</span>
      <span className={`text-sm font-black leading-none tabular-nums ${value != null ? tone : 'text-slate-500'}`}>{value ?? '–'}</span>
    </span>
  );
}

/** The IMDb cell — the recognisable gold wordmark over the /10 value, always in
 *  its own column so it is never clipped, faded out, or reduced to a bare dash
 *  when a score exists. Missing IMDb keeps the cell with a muted wordmark. */
function ImdbCell({ value, ariaLabel }: { value: string | null; ariaLabel: string }) {
  const present = value != null;
  return (
    <span className="flex flex-col items-center gap-0.5" role="img" aria-label={ariaLabel}>
      <span
        aria-hidden
        className={`rounded px-1 text-[9px] font-black leading-tight tracking-tight ${present ? 'bg-[#f5c518] text-black' : 'bg-white/10 text-slate-400'}`}
      >
        IMDb
      </span>
      <span className={`text-sm font-black leading-none tabular-nums ${present ? 'text-gold-300' : 'text-slate-500'}`}>{value ?? '–'}</span>
    </span>
  );
}
