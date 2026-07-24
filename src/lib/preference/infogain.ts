/**
 * Information-gain title selection — "choose the next title that teaches us the
 * most," not a random onboarding queue. A title is valuable when it expresses an
 * axis strongly (near 0 or 100) AND we're still uncertain about that axis. After
 * each pick we discount the axes it would teach, so the next pick targets a
 * DIFFERENT gap (animation? foreign? slow-burn?) instead of five near-clones.
 *
 * Pure. A heuristic proxy for expected uncertainty reduction — deterministic and
 * unit-tested, no model calls at selection time.
 */
import { DIMENSION_KEYS } from '@/lib/scoring/dimensions';
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import type { DnaState } from './types';
import { evidenceConfidence } from './confidence';

/** How much a single pick is assumed to shrink an axis's uncertainty. */
export const LEARN_RATE = 0.6;

export interface InfoCandidate {
  titleId: string;
  dims: TitleDimensions;
}

/** Per-axis remaining uncertainty (0..1) from Experience + Attraction evidence. */
export function axisUncertainty(state: DnaState): Record<string, number> {
  const u: Record<string, number> = {};
  for (const k of DIMENSION_KEYS) {
    const ev = (state.experience.dims[k]?.evidence ?? 0) + (state.attraction.dims[k]?.evidence ?? 0);
    u[k] = 1 - evidenceConfidence(ev);
  }
  return u;
}

/** How strongly a title expresses each axis (0..1). */
function informativeness(dims: TitleDimensions): Record<string, number> {
  const info: Record<string, number> = {};
  for (const k of DIMENSION_KEYS) {
    const v = dims[k];
    info[k] = typeof v === 'number' ? Math.abs(v - 50) / 50 : 0;
  }
  return info;
}

/**
 * Expected information gain of showing `dims` given current per-axis uncertainty:
 * Σ informativeness_k × uncertainty_k. Higher = teaches us more.
 */
export function expectedInfoGain(dims: TitleDimensions, uncertainty: Record<string, number>): number {
  let g = 0;
  const info = informativeness(dims);
  for (const k of DIMENSION_KEYS) g += (info[k] ?? 0) * (uncertainty[k] ?? 1);
  return g;
}

/**
 * Greedily choose the `count` most informative titles, diversifying: each pick
 * discounts the axes it teaches so later picks probe different uncertainty.
 * `exclude` skips titles we've already shown/rated.
 */
export function pickNextTitles<T extends InfoCandidate>(
  pool: T[],
  state: DnaState,
  opts: { count?: number; exclude?: Set<string> } = {},
): Array<T & { infoGain: number }> {
  const count = opts.count ?? 1;
  const exclude = opts.exclude ?? new Set<string>();
  const uncertainty = { ...axisUncertainty(state) };
  const remaining = pool.filter((t) => !exclude.has(t.titleId));
  const picks: Array<T & { infoGain: number }> = [];
  const used = new Set<string>();

  while (picks.length < count && used.size < remaining.length) {
    let best: T | null = null;
    let bestGain = -1;
    for (const t of remaining) {
      if (used.has(t.titleId)) continue;
      const g = expectedInfoGain(t.dims, uncertainty);
      if (g > bestGain) {
        bestGain = g;
        best = t;
      }
    }
    if (!best) break;
    used.add(best.titleId);
    picks.push({ ...best, infoGain: bestGain });
    // Discount the axes this pick would teach, so the next pick targets new gaps.
    const info = informativeness(best.dims);
    for (const k of DIMENSION_KEYS) uncertainty[k] = (uncertainty[k] ?? 1) * (1 - (info[k] ?? 0) * LEARN_RATE);
  }
  return picks;
}
