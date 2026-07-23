/**
 * Phase 5 Layer D (relevance judging) — kept SEPARATE from objective validation
 * (Phase 9: no self-judging). Default is a deterministic judge that scores
 * ranking against the user's learned dimension profile — no LLM, reproducible.
 *
 * An optional structured LLM judge can be enabled with EVAL_LLM_JUDGE=1 (+ an
 * OPENAI_API_KEY). It is given ONLY the supplied metadata and must not invent
 * title characteristics. It never runs in smoke/CI by default.
 */
import type { EvalProfile } from '../fixtures/profiles';
import type { FixtureWorld } from '../fixtures/index';
import type { PipelineResult } from '../pipeline/fixtureFinder';
import type { JudgeVerdict } from './result';

/** Deterministic ranking judge: how well does the returned order track the
 *  user's dimension profile (Family B)? Cosine-like agreement between the
 *  descending match order and descending dimension-fit order. */
export function deterministicJudge(pipeline: PipelineResult, profile: EvalProfile, world: FixtureWorld): JudgeVerdict {
  const prof = profile.dimensionProfile;
  if (!prof || pipeline.items.length < 2) {
    return { rankingScore: 1, rationale: 'Too few items or no learned profile to judge ordering.', source: 'deterministic' };
  }
  const fit = (id: string): number => {
    const t = world.titleById(id);
    if (!t?.facts.dims) return 50;
    let num = 0;
    let den = 0;
    for (const [k, pref] of Object.entries(prof)) {
      const v = t.facts.dims[k];
      if (v == null) continue;
      const decisiveness = Math.abs(pref - 50) / 50;
      num += (100 - Math.abs(v - pref)) * decisiveness;
      den += decisiveness;
    }
    return den > 0 ? num / den : 50;
  };
  const fits = pipeline.items.map((i) => fit(i.id));
  // Count inversions vs the ideal descending-fit order.
  let concordant = 0;
  let total = 0;
  for (let i = 0; i < fits.length; i++) {
    for (let j = i + 1; j < fits.length; j++) {
      total++;
      if (fits[i]! >= fits[j]!) concordant++;
    }
  }
  const rankingScore = total > 0 ? concordant / total : 1;
  return {
    rankingScore,
    rationale: `Order is ${(rankingScore * 100).toFixed(0)}% concordant with the user's learned dimension profile.`,
    source: 'deterministic',
  };
}

/** Placeholder for the LLM judge — returns null unless explicitly enabled and
 *  a key is present (wired in the runner, not invoked in deterministic mode). */
export async function llmJudge(): Promise<JudgeVerdict | null> {
  if (process.env.EVAL_LLM_JUDGE !== '1' || !process.env.OPENAI_API_KEY) return null;
  // Intentionally not implemented for offline determinism; live mode may wire a
  // structured call here that is fed ONLY the normalized request + candidate
  // metadata and returns { rankingScore, rationale }. Never represented as
  // objective truth in the scorecard.
  return null;
}
