/**
 * CASE ROUNDS — a short session whose titles are chosen to RESOLVE a specific
 * Open Question, not at random. Selection maximizes information on the question's
 * target axes, favors recognizable titles (a new user can't judge obscure ones),
 * and diversifies so we don't re-test an already-answered angle.
 * Pure.
 */
import type { TitleDimensions } from '@/lib/scoring/dimensions';
import type { DnaState } from './types';
import type { QuestionSpec } from './openQuestions';
import { axisUncertainty } from './infogain';

export const ROUND_LENGTHS = { quick: 5, standard: 10, deep: 20 } as const;
export type RoundSize = keyof typeof ROUND_LENGTHS;

/** How much a recognizable title is favored (0..1 familiarity → additive bonus). */
export const FAMILIARITY_WEIGHT = 0.5;

export interface RoundCandidate {
  titleId: string;
  dims: TitleDimensions;
  genres?: string[];
  /** 0..1 — how recognizable. Unknown ⇒ treated as 0.5. */
  familiarity?: number;
}

function targetValue(
  cand: RoundCandidate,
  spec: QuestionSpec,
  uncertainty: Record<string, number>,
): number {
  let v = 0;
  for (const ax of spec.axes ?? []) {
    const dv = cand.dims[ax];
    if (typeof dv !== 'number') continue;
    const info = Math.abs(dv - 50) / 50; // how strongly it expresses the axis
    v += info * (uncertainty[ax] ?? 1);
  }
  // A title that clearly belongs to (or clearly is NOT) a target genre is useful.
  if (spec.genres && spec.genres.length && cand.genres) {
    if (cand.genres.some((g) => spec.genres!.includes(g))) v += 1;
  }
  return v;
}

/**
 * Build a Case Round: choose `length` titles that best resolve `question`.
 * Greedy + diversifying on the target axes. Recognizable titles win ties.
 */
export function buildCaseRound(
  question: QuestionSpec,
  pool: RoundCandidate[],
  state: DnaState,
  opts: { size?: RoundSize; length?: number; exclude?: Set<string> } = {},
): RoundCandidate[] {
  const length = opts.length ?? ROUND_LENGTHS[opts.size ?? 'standard'];
  const exclude = opts.exclude ?? new Set<string>();
  const uncertainty = { ...axisUncertainty(state) };
  const remaining = pool.filter((t) => !exclude.has(t.titleId));
  const picks: RoundCandidate[] = [];
  const used = new Set<string>();

  while (picks.length < length && used.size < remaining.length) {
    let best: RoundCandidate | null = null;
    let bestScore = -Infinity;
    for (const c of remaining) {
      if (used.has(c.titleId)) continue;
      const fam = typeof c.familiarity === 'number' ? c.familiarity : 0.5;
      // Multiplicative: familiarity AMPLIFIES an informative title but can never
      // float a non-informative one (targetValue 0 ⇒ score 0) into a targeted round.
      const score = targetValue(c, question, uncertainty) * (1 + FAMILIARITY_WEIGHT * fam);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (!best) break;
    used.add(best.titleId);
    picks.push(best);
    // Discount the target axes this pick teaches, so the next probes a new angle.
    for (const ax of question.axes ?? []) {
      const dv = best.dims[ax];
      if (typeof dv === 'number') uncertainty[ax] = (uncertainty[ax] ?? 1) * (1 - (Math.abs(dv - 50) / 50) * 0.6);
    }
  }
  return picks;
}
