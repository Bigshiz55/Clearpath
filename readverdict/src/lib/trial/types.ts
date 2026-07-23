import type { EvidenceStatus, ConfidenceLabel } from '@/lib/domain/confidence';

/** A single argument in the trial, always carrying its evidence status. */
export interface TrialPoint {
  /** Short label, e.g. 'Fast investigative structure'. */
  label: string;
  /** One-line explanation grounded in the matched signal. */
  detail: string;
  status: EvidenceStatus;
  confidence: number;
  /** Which dimension/axis drove this point, for traceability. */
  basis?: string;
}

export interface EvidenceItem {
  key: string;
  label: string;
  /** Human value, or null when we genuinely don't have it. */
  value: string | null;
  status: EvidenceStatus;
  confidence: number;
  /** Where it came from. */
  source: string | null;
}

export interface WitnessGroup {
  group: string;
  statement: string;
  /** Sample size backing the statement, or null when modeled/insufficient. */
  sampleSize: number | null;
  status: EvidenceStatus;
}

export interface JuryOutcome {
  /** Qualitative lean, always safe to show. */
  lean: 'for' | 'against' | 'split';
  headline: string;
  /** Numeric split ONLY when backed by real cohort data; else null. */
  split: { for: number; against: number } | null;
  sampleSize: number | null;
  confidence: ConfidenceLabel;
  rationale: string;
  dissent: string | null;
  basis: 'cohort-data' | 'modeled-similarity';
}

export type VerdictCall =
  | 'READ IT'
  | 'SKIP IT'
  | 'BORROW—DON’T BUY'
  | 'BUY IT'
  | 'LISTEN—DON’T READ'
  | 'READ—DON’T LISTEN'
  | 'SAMPLE IT FIRST'
  | 'WAIT FOR THE ADAPTATION'
  | 'SAVE FOR THE RIGHT MOOD'
  | 'READ THE FIRST BOOK FIRST'
  | 'CONTINUE THE SERIES'
  | 'DISMISS THE SERIES'
  | 'RECONSIDER LATER';

export interface Prediction {
  /** 0..1 predicted probability the reader finishes. */
  finishProbability: number;
  finishConfidence: ConfidenceLabel;
  /** 0..1 DNF risk (≈ 1 - finishProbability, but reported explicitly). */
  dnfRisk: number;
  /** Where they'll likely be hooked, in %, or null. */
  hookPointPct: number | null;
  /** Where they may struggle, described qualitatively. */
  strugglePoint: string | null;
  /** Likely reason for stopping, if any. */
  likelyStopReason: string | null;
  positives: string[];
  negatives: string[];
}

export interface Verdict {
  call: VerdictCall;
  /** 1..100 personalized match. */
  matchScore: number;
  matchConfidence: ConfidenceLabel;
  predictedRating: number | null; // 0..5
  ratingConfidence: ConfidenceLabel;
  bestFormat: string | null;
  strongestReason: string | null;
  strongestConcern: string | null;
  /** The short, playful closing line. */
  sentence: string;
}

export interface Defendant {
  title: string;
  author: string | null;
  year: number | null;
  pageCount: number | null;
  estimatedReadingMinutes: number | null;
  audioDurationMin: number | null;
  format: string | null;
  coverUrl: string | null;
  series: string | null;
  seriesPosition: number | null;
}

export interface Trial {
  caseName: string; // "THE PEOPLE v. THE SILENT PATIENT"
  docket: string;
  defendant: Defendant;
  charges: string[];
  prosecution: TrialPoint[];
  defense: TrialPoint[];
  evidence: EvidenceItem[];
  witnesses: WitnessGroup[];
  jury: JuryOutcome;
  prediction: Prediction;
  verdict: Verdict;
  /** Overall confidence caveat shown to the user. */
  confidenceNote: string;
  generatedAt: string;
}
