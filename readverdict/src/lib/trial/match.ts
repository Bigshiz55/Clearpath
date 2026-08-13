// Reader × Book alignment. Produces a 0..100 personalized match plus the signed
// per-axis contributions that the prosecution and defense are built from. Pure.
//
// Two alignment kinds:
//   'match'   — the reader has a target on the axis; alignment falls with distance.
//   'ceiling' — the reader has a tolerance; we only penalize a book that EXCEEDS
//               it (a dark-averse reader is fine with a light book).

import type { BookDna, BookDnaAxis } from '@/lib/domain/book';
import type { ReaderDna, DimensionState } from '@/lib/domain/readerDna';
import { clamp01, confidenceLabel, type ConfidenceLabel } from '@/lib/domain/confidence';

type AlignKind = 'match' | 'ceiling';

interface AxisLink {
  readerKey: string;
  bookAxis: keyof BookDna;
  kind: AlignKind;
  label: string;
}

const AXIS_LINKS: AxisLink[] = [
  { readerKey: 'pacing', bookAxis: 'pacing', kind: 'match', label: 'Pacing' },
  { readerKey: 'complexity', bookAxis: 'complexity', kind: 'match', label: 'Complexity' },
  { readerKey: 'prose_density', bookAxis: 'proseDensity', kind: 'match', label: 'Prose density' },
  { readerKey: 'worldbuilding', bookAxis: 'worldbuilding', kind: 'match', label: 'Worldbuilding' },
  { readerKey: 'romance', bookAxis: 'romanceEmphasis', kind: 'match', label: 'Romance emphasis' },
  { readerKey: 'humor', bookAxis: 'humor', kind: 'match', label: 'Humor' },
  { readerKey: 'emotional_intensity', bookAxis: 'emotionalIntensity', kind: 'match', label: 'Emotional intensity' },
  { readerKey: 'literary_vs_commercial', bookAxis: 'literaryVsCommercial', kind: 'match', label: 'Literary vs commercial' },
  { readerKey: 'darkness', bookAxis: 'darkness', kind: 'ceiling', label: 'Darkness' },
  { readerKey: 'spice', bookAxis: 'spice', kind: 'ceiling', label: 'Spice' },
];

export interface AxisContribution {
  readerKey: string;
  label: string;
  /** -1..1 signed alignment (positive = good fit, negative = friction). */
  alignment: number;
  /** 0..1 weight this axis carried. */
  weight: number;
  bookValue: number;
  readerValue: number;
  confidence: number;
}

export interface MatchResult {
  /** 1..100 personalized match score. */
  score: number;
  confidence: ConfidenceLabel;
  /** Total evidence weight across contributing axes. */
  coverage: number;
  contributions: AxisContribution[];
}

function alignmentFor(kind: AlignKind, book: number, reader: number): number {
  if (kind === 'ceiling') {
    const excess = Math.max(0, book - reader);
    // Exceeding tolerance hurts; staying within it is neutral-good.
    return excess <= 0 ? 0.5 : clampSigned(0.5 - excess * 2);
  }
  // 'match': distance from target, mapped to -1..1.
  const dist = Math.abs(book - reader);
  return clampSigned(1 - dist * 2);
}

const clampSigned = (n: number) => Math.max(-1, Math.min(1, n));

export function computeMatch(dna: ReaderDna, book: BookDna): MatchResult {
  const contributions: AxisContribution[] = [];
  let weightedSum = 0;
  let totalWeight = 0;

  for (const link of AXIS_LINKS) {
    const reader: DimensionState | undefined = dna.dimensions[link.readerKey];
    const axis = book[link.bookAxis] as BookDnaAxis | undefined;
    if (!reader || reader.confidence <= 0) continue;
    if (!axis || typeof axis !== 'object' || axis.confidence <= 0) continue;

    const alignment = alignmentFor(link.kind, axis.value, reader.value);
    const weight = clamp01(reader.confidence * axis.salience * axis.confidence);
    if (weight <= 0) continue;

    weightedSum += alignment * weight;
    totalWeight += weight;
    contributions.push({
      readerKey: link.readerKey,
      label: link.label,
      alignment: Number(alignment.toFixed(3)),
      weight: Number(weight.toFixed(3)),
      bookValue: axis.value,
      readerValue: reader.value,
      confidence: axis.confidence,
    });
  }

  // Map weighted alignment (-1..1) to a 1..100 score around a neutral 55.
  const normalized = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const score = Math.max(1, Math.min(100, Math.round(55 + normalized * 42)));

  // Confidence scales with how much evidence weight actually contributed.
  const confidence = confidenceLabel(clamp01(totalWeight / (totalWeight + 1.5)));

  contributions.sort((a, b) => Math.abs(b.alignment * b.weight) - Math.abs(a.alignment * a.weight));

  return { score, confidence, coverage: Number(totalWeight.toFixed(3)), contributions };
}
