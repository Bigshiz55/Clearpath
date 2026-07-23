/** Shared Search Lab result/trace shapes. */
import type { SeedTitle } from '@/lib/search/titleDna';

/** Per-candidate auditable trace (mirrors the brief's contribution-trace shape). */
export interface CandidateTrace {
  candidateTitle: string;
  canonicalId: string;
  candidateSource: string;
  qualification: {
    hardConstraintsPassed: boolean;
    seedSimilarityGatePassed: boolean;
    sharedAnchorCount: number;
    sharedAnchorScore: number;
    contradictionScore: number;
    metadataConfidence: number;
  };
  positiveContributions: Record<string, number>;
  negativeContributions: Record<string, number>;
  personalFit: number;
  qualifiedForRanking: boolean;
  exclusionReason: string | null;
}

export interface RankedResult {
  /** Final ordered qualified results (fewer than requested is allowed/expected). */
  items: { canonicalId: string; title: string; personalFit: number; rank: number }[];
  /** Full trace for every candidate considered (qualified + excluded). */
  traces: CandidateTrace[];
  /** Titles excluded as the seed or a canonical duplicate. */
  excludedSeedOrDup: string[];
}

/** A ranker: seed + candidate pool + request options → ranked result + traces. */
export type Ranker = (
  seed: SeedTitle,
  candidates: (SeedTitle & { personalScore: number })[],
  opts: { requestedCount: number; lens?: string; allowFranchise?: boolean; allowSeed?: boolean },
) => RankedResult;
