/**
 * SHOWING THE WORKING.
 *
 * Every rival prints a number. The number is not the product — the ARITHMETIC
 * is. This turns the standard score's real contributions into rows a person can
 * read and add up themselves, and it is deliberately constrained so it can
 * never become decoration:
 *
 *  1. THE ROWS MUST SUM TO THE SCORE. Each row carries `value × weight`, and
 *     the module reports the residual between that sum and the score it was
 *     handed. A breakdown that does not reconcile is a lie with a chart on it,
 *     so the caller can refuse to show it.
 *  2. A MISSING SOURCE IS NAMED, NOT HIDDEN. "No IMDb rating yet" is
 *     information; quietly reweighting around it and printing a confident
 *     number is not.
 *  3. THE PERSONAL ADJUSTMENT IS ITS OWN LINE. The general score and the taste
 *     nudge are different claims with different evidence, and merging them into
 *     one bar is how people stop trusting either.
 *
 * Pure. No I/O.
 */
import type { StandardContribution } from './standardScore';

export interface WorkRow {
  key: string;
  /** What a person calls this source. */
  label: string;
  /** 0..100, as the source reads it. */
  value: number;
  /** 0..1 share of the blend. */
  weight: number;
  /** value × weight — the points this source actually put on the board. */
  points: number;
}

export interface ShowWork {
  rows: WorkRow[];
  /** Sum of the rows' points, rounded the way the UI shows it. */
  subtotal: number;
  /** The personal taste adjustment, signed. Zero when there is no profile. */
  personalDelta: number;
  /** What the rows plus the adjustment come to. */
  total: number;
  /** Sources we had nothing for, named rather than silently dropped. */
  missing: string[];
  /** |total − the score we were handed|. Above RECONCILE_TOLERANCE, do not show. */
  residual: number;
  /** True when the arithmetic on screen genuinely adds up. */
  reconciles: boolean;
}

/** The rows must add up to within this of the real score, or we do not show them. */
export const RECONCILE_TOLERANCE = 1.5;

const LABELS: Record<string, string> = {
  imdb: 'IMDb',
  rottenTomatoes: 'Rotten Tomatoes',
  metacritic: 'Metacritic',
  tmdbAudience: 'Audience score',
  tmdbCritic: 'Critics',
  letterboxd: 'Letterboxd',
};

export function sourceLabel(key: string): string {
  return LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

export interface ShowWorkInput {
  contributions: readonly StandardContribution[];
  /** The score those contributions produced. */
  score: number;
  /** Signed taste adjustment on top, if any. */
  personalDelta?: number;
  /** Source keys the engine wanted but had no reading for. */
  missingKeys?: readonly string[];
}

export function showWork(input: ShowWorkInput): ShowWork {
  const rows: WorkRow[] = input.contributions
    .filter((c) => c.weight > 0)
    .map((c) => ({
      key: c.key,
      label: sourceLabel(c.key),
      value: c.value,
      weight: c.weight,
      points: c.value * c.weight,
    }))
    .sort((a, b) => b.points - a.points);

  const subtotal = rows.reduce((n, r) => n + r.points, 0);
  const personalDelta = input.personalDelta ?? 0;
  const total = subtotal + personalDelta;
  const residual = Math.abs(total - (input.score + personalDelta));

  return {
    rows,
    subtotal,
    personalDelta,
    total,
    missing: (input.missingKeys ?? []).map(sourceLabel),
    residual,
    reconciles: rows.length > 0 && residual <= RECONCILE_TOLERANCE,
  };
}

/** One line a person can read out loud. Null when the working does not reconcile. */
export function workSentence(w: ShowWork): string | null {
  if (!w.reconciles) return null;
  const parts = w.rows.map((r) => `${r.label} ${Math.round(r.value)} × ${Math.round(r.weight * 100)}%`);
  const base = `${parts.join(' + ')} = ${Math.round(w.subtotal)}`;
  if (w.personalDelta === 0) return base;
  const sign = w.personalDelta > 0 ? '+' : '−';
  return `${base}, ${sign}${Math.abs(Math.round(w.personalDelta))} for your taste = ${Math.round(w.total)}`;
}
