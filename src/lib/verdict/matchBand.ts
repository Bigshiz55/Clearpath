/**
 * THE FOUR HONEST BANDS.
 *
 * A raw match percentage on a first search overstates what the model knows —
 * a brand-new visitor with zero ratings gets the same numeric precision as
 * someone with ninety. This turns the evidence-based `ConfidenceLevel` that
 * `explainVerdict` already computes into the plain-language band a first-time
 * visitor sees instead of a fabricated number: Strong / Good / Uncertain
 * match, or — when there's no confidence signal to read at all (a named-title
 * lookup, not a personalized discovery search) — the honest "Early profile".
 *
 * Pure. Decides nothing about scoring; only relabels a level that already
 * exists in `src/lib/verdictExplain.ts`.
 */

import type { ConfidenceLevel } from '@/lib/verdictExplain';

export type MatchBand = 'Strong match' | 'Good match' | 'Uncertain match' | 'Early profile';

const BAND: Record<ConfidenceLevel, MatchBand> = {
  high: 'Strong match',
  medium: 'Good match',
  low: 'Uncertain match',
};

export function matchBand(level: ConfidenceLevel | null | undefined): MatchBand {
  if (!level) return 'Early profile';
  return BAND[level];
}
