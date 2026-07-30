/**
 * EPISODE → SERIES CONSOLIDATION.
 *
 * A Netflix history file lists every episode separately. Imported naively that
 * produces 62 rows for one show, which both floods the review screen and, worse,
 * counts as 62 pieces of evidence when it is really one — a person who watched
 * one series would outweigh a person who watched thirty films.
 *
 * So episodes are folded into ONE series observation whose strength reflects how
 * much was actually watched. Episode rows are kept alongside it, because "which
 * episodes" is real history the user may want, but only the series row carries
 * DNA weight.
 */
import type { ParsedRow } from './netflixCsv';
import type { ImportContext } from './signalModel';

export type EvidenceStrength = 'sampled' | 'moderate' | 'substantial' | 'strong';

export interface SeriesObservation {
  seriesTitle: string;
  episodeCount: number;
  distinctSeasons: number;
  /** Episode rows folded into this observation. */
  episodes: ParsedRow[];
  firstWatched: string | null;
  lastWatched: string | null;
  /** True when episodes were watched across separated periods — a return. */
  returnedLater: boolean;
  strength: EvidenceStrength;
  context: ImportContext;
  /** Plain-language justification shown on the review row. */
  reason: string;
}

export interface MovieObservation {
  title: string;
  /** More than one row for the same film means a rewatch. */
  playCount: number;
  firstWatched: string | null;
  lastWatched: string | null;
  rows: ParsedRow[];
  context: ImportContext;
  reason: string;
}

export interface ConsolidationResult {
  series: SeriesObservation[];
  movies: MovieObservation[];
  /** Rows we could not place. Never silently dropped. */
  skipped: { row: ParsedRow; reason: string }[];
}

/** Thresholds for how much watching counts as how much evidence. */
export const EVIDENCE_THRESHOLDS = {
  moderate: 3,      // a few episodes — they gave it a real go
  substantial: 8,   // most of a season
  strongSeasons: 2, // more than one season is continuing interest
} as const;

export function classifyEvidence(episodeCount: number, distinctSeasons: number): EvidenceStrength {
  if (distinctSeasons >= EVIDENCE_THRESHOLDS.strongSeasons) return 'strong';
  if (episodeCount >= EVIDENCE_THRESHOLDS.substantial) return 'substantial';
  if (episodeCount >= EVIDENCE_THRESHOLDS.moderate) return 'moderate';
  return 'sampled';
}

/** Days between two ISO dates, or null. */
function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.abs(Date.parse(b) - Date.parse(a)) / 86_400_000;
}

const REASONS: Record<EvidenceStrength, (n: number, s: number) => string> = {
  sampled: (n) => `You watched ${n === 1 ? 'one episode' : `${n} episodes`} — enough to have sampled it, not enough to say you liked it.`,
  moderate: (n) => `You watched ${n} episodes, so you gave it a real go.`,
  substantial: (n) => `You watched ${n} episodes — most of a season.`,
  strong: (n, s) => `You watched ${n} episodes across ${s} seasons, which usually means you stayed with it.`,
};

/**
 * Fold parsed rows into per-title observations.
 *
 * Only `ok` rows are considered; duplicates, blanks and invalid rows are handed
 * back in `skipped` so the review screen can account for every line in the file.
 */
export function consolidate(rows: ParsedRow[]): ConsolidationResult {
  const seriesMap = new Map<string, ParsedRow[]>();
  const movieMap = new Map<string, ParsedRow[]>();
  const skipped: { row: ParsedRow; reason: string }[] = [];

  for (const r of rows) {
    if (r.status !== 'ok') {
      skipped.push({ row: r, reason: r.reason ?? `Row was ${r.status}.` });
      continue;
    }
    if (r.isEpisode && r.seriesTitle) {
      const key = r.seriesTitle.toLowerCase();
      (seriesMap.get(key) ?? seriesMap.set(key, []).get(key)!).push(r);
    } else if (r.rawTitle) {
      const key = r.rawTitle.toLowerCase();
      (movieMap.get(key) ?? movieMap.set(key, []).get(key)!).push(r);
    } else {
      skipped.push({ row: r, reason: 'No usable title.' });
    }
  }

  const dates = (rs: ParsedRow[]) => rs.map((r) => r.watchedOn).filter((d): d is string => !!d).sort();

  const series: SeriesObservation[] = [...seriesMap.values()].map((eps) => {
    const d = dates(eps);
    const seasons = new Set(
      eps.map((e) => e.seasonNumber ?? e.seasonLabel ?? null).filter((x) => x != null),
    );
    // Distinct EPISODES, not rows — replaying one episode is not two episodes.
    const distinctEpisodes = new Set(
      eps.map((e) => `${e.seasonNumber ?? e.seasonLabel ?? ''}|${e.episodeTitle ?? e.rawTitle}`),
    ).size;
    const distinctSeasons = Math.max(1, seasons.size);
    const strength = classifyEvidence(distinctEpisodes, distinctSeasons);
    const span = daysBetween(d[0] ?? null, d[d.length - 1] ?? null);

    return {
      seriesTitle: eps[0]!.seriesTitle!,
      episodeCount: distinctEpisodes,
      distinctSeasons,
      episodes: eps,
      firstWatched: d[0] ?? null,
      lastWatched: d[d.length - 1] ?? null,
      // A 90-day gap between first and last suggests they came back to it.
      returnedLater: span != null && span > 90,
      strength,
      // Only substantial coverage is treated as enjoyment evidence; a sampled
      // series is just history.
      context: strength === 'strong' || strength === 'substantial'
        ? 'completed_series'
        : 'viewing_history',
      reason: REASONS[strength](distinctEpisodes, distinctSeasons),
    };
  });

  const movies: MovieObservation[] = [...movieMap.values()].map((rs) => {
    const d = dates(rs);
    // Two plays on DIFFERENT days is a rewatch; twice in one day is usually one
    // sitting split across devices, which is not evidence of anything.
    const distinctDays = new Set(d).size;
    const rewatched = distinctDays > 1;
    return {
      title: rs[0]!.rawTitle,
      playCount: distinctDays || rs.length,
      firstWatched: d[0] ?? null,
      lastWatched: d[d.length - 1] ?? null,
      rows: rs,
      context: rewatched ? 'repeated_viewing' : 'viewing_history',
      reason: rewatched
        ? `You watched this on ${distinctDays} separate days, which usually means you enjoyed it.`
        : 'You watched this. We have not assumed you liked it.',
    };
  });

  const byTitle = (a: { seriesTitle?: string; title?: string }, b: { seriesTitle?: string; title?: string }) =>
    (a.seriesTitle ?? a.title ?? '').localeCompare(b.seriesTitle ?? b.title ?? '');

  return { series: series.sort(byTitle), movies: movies.sort(byTitle), skipped };
}
