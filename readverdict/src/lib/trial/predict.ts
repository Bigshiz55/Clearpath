// Predicted DNF / finish probability. A transparent, weighted heuristic model —
// explicitly NOT a trained ML model, and labelled as a prediction, never a fact.
// Confidence is honest: thin evidence yields qualitative, low-confidence output.

import type { BookDna, BookDnaAxis } from '@/lib/domain/book';
import type { ReaderDna } from '@/lib/domain/readerDna';
import { clamp01, confidenceLabel, type ConfidenceLabel } from '@/lib/domain/confidence';
import type { MatchResult } from './match';
import type { Prediction } from './types';

function axisVal(a: BookDnaAxis | undefined): number | null {
  return a && typeof a === 'object' && a.confidence > 0 ? a.value : null;
}
function readerVal(dna: ReaderDna, key: string): number | null {
  const d = dna.dimensions[key];
  return d && d.confidence > 0 ? d.value : null;
}

export interface PredictInput {
  match: MatchResult;
  book: BookDna;
  dna: ReaderDna;
  pageCount: number | null;
}

export function predictFinish(input: PredictInput): Prediction {
  const { match, book, dna, pageCount } = input;
  const positives: string[] = [];
  const negatives: string[] = [];

  // Base finish probability tracks the personalized match, centered at ~0.6.
  let p = 0.6 + (match.score - 55) / 100;

  // --- Specific risk/■boost factors ---
  const bookPacing = axisVal(book.pacing);
  const slowTolerance = readerVal(dna, 'slow_burn_tolerance');
  let strugglePoint: string | null = null;
  let likelyStopReason: string | null = null;

  if (bookPacing != null && bookPacing < 0.4) {
    if (slowTolerance != null && slowTolerance < 0.4) {
      p -= 0.18;
      strugglePoint = 'the slower opening third';
      likelyStopReason = 'pacing — a slow build against your low slow-burn tolerance';
      negatives.push('Slow opening conflicts with your pacing preference');
    } else {
      negatives.push('A deliberate, slow-building pace');
    }
  }

  const readerLen = readerVal(dna, 'book_length');
  if (pageCount != null && pageCount > 500) {
    if (readerLen != null && readerLen < 0.4) {
      p -= 0.12;
      negatives.push(`Length (${pageCount} pages) exceeds your usual range`);
      likelyStopReason = likelyStopReason ?? 'length — longer than you tend to finish';
    } else if (pageCount > 700) {
      negatives.push(`A long read (${pageCount} pages)`);
    }
  }

  const bookProse = axisVal(book.proseDensity);
  const readerProse = readerVal(dna, 'prose_density');
  if (bookProse != null && readerProse != null && bookProse - readerProse > 0.35) {
    p -= 0.1;
    negatives.push('Dense prose relative to your preference');
  }

  // Boosts from strong alignments.
  for (const c of input.match.contributions) {
    if (c.alignment > 0.4 && c.weight > 0.1) {
      p += 0.05;
      positives.push(`Strong ${c.label.toLowerCase()} match`);
    }
  }
  if (pageCount != null && pageCount <= 320) positives.push('Approachable length');

  const finishProbability = clamp01(p);
  const dnfRisk = clamp01(1 - finishProbability);

  // Hook point: fast books hook early, slow books later.
  const hookPointPct =
    bookPacing == null ? null : bookPacing >= 0.6 ? 8 : bookPacing >= 0.4 ? 18 : 30;

  // Confidence: driven by how much evidence the match actually had.
  const evidence = match.coverage;
  const finishConfidence: ConfidenceLabel = confidenceLabel(
    clamp01(evidence / (evidence + 2)),
  );

  return {
    finishProbability: Number(finishProbability.toFixed(2)),
    finishConfidence,
    dnfRisk: Number(dnfRisk.toFixed(2)),
    hookPointPct,
    strugglePoint,
    likelyStopReason,
    positives: positives.slice(0, 5),
    negatives: negatives.slice(0, 5),
  };
}

/** Qualitative phrasing when confidence is too low for a precise number. */
export function finishPhrase(p: Prediction): string {
  if (p.finishConfidence === 'low' || p.finishConfidence === 'none') {
    if (p.finishProbability >= 0.6) return 'Likely to finish (low confidence)';
    if (p.finishProbability >= 0.4) return 'Moderate DNF risk (low confidence)';
    return 'Elevated DNF risk (low confidence)';
  }
  return `${Math.round(p.finishProbability * 100)}% estimated chance of finishing`;
}
