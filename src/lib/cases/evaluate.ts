import 'server-only';
import type { MatchCandidate } from './matching';

/** One hand-labeled fixture programme: its true Case grouping. A caseId shared by >=2 episodes means those episodes are the same real-world Case. */
export interface GroundTruthRow {
  tvmazeEpisodeId: number;
  caseId: string;
}

export interface PrecisionRecallReport {
  precision: number;
  recall: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  groundTruthPairCount: number;
  proposedPairCount: number;
  falsePositivePairs: [number, number][];
  falseNegativePairs: [number, number][];
}

function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Every within-Case pair implied by the ground truth (a caseId with k episodes contributes C(k,2) true pairs). */
function groundTruthPairs(groundTruth: GroundTruthRow[]): Set<string> {
  const byCase = new Map<string, number[]>();
  for (const row of groundTruth) {
    const list = byCase.get(row.caseId) ?? [];
    list.push(row.tvmazeEpisodeId);
    byCase.set(row.caseId, list);
  }
  const pairs = new Set<string>();
  for (const ids of byCase.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        pairs.add(pairKey(ids[i]!, ids[j]!));
      }
    }
  }
  return pairs;
}

/**
 * Precision/recall of proposed candidates against hand-labeled ground truth,
 * restricted to pairs where BOTH episodes are in the labeled set (we only
 * have ground truth for 50 of the 280 fixture episodes).
 */
export function computePrecisionRecall(
  candidates: MatchCandidate[],
  groundTruth: GroundTruthRow[],
): PrecisionRecallReport {
  const labeledIds = new Set(groundTruth.map((r) => r.tvmazeEpisodeId));
  const truePairs = groundTruthPairs(groundTruth);

  const proposedAmongLabeled = candidates.filter(
    (c) => labeledIds.has(c.episodeAId) && labeledIds.has(c.episodeBId),
  );
  const proposedKeys = new Set(proposedAmongLabeled.map((c) => pairKey(c.episodeAId, c.episodeBId)));

  const falsePositivePairs: [number, number][] = [];
  let truePositives = 0;
  for (const c of proposedAmongLabeled) {
    const key = pairKey(c.episodeAId, c.episodeBId);
    if (truePairs.has(key)) truePositives++;
    else falsePositivePairs.push([c.episodeAId, c.episodeBId]);
  }
  const falsePositives = falsePositivePairs.length;

  const falseNegativePairs: [number, number][] = [];
  for (const key of truePairs) {
    if (!proposedKeys.has(key)) {
      const [a, b] = key.split(':').map(Number) as [number, number];
      falseNegativePairs.push([a, b]);
    }
  }
  const falseNegatives = falseNegativePairs.length;

  return {
    precision: truePositives + falsePositives === 0 ? 1 : truePositives / (truePositives + falsePositives),
    recall: truePairs.size === 0 ? 1 : truePositives / truePairs.size,
    truePositives,
    falsePositives,
    falseNegatives,
    groundTruthPairCount: truePairs.size,
    proposedPairCount: proposedAmongLabeled.length,
    falsePositivePairs,
    falseNegativePairs,
  };
}
