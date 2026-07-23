// Synthetic reader archetypes and book fixtures for the evaluation harness.
// Deterministic and consented-by-construction (no real user data). Used to guard
// verdict quality against regressions.

import { initialReaderDna, confirmDimension, type ReaderDna } from '@/lib/domain/readerDna';

const T = '2026-01-01T00:00:00.000Z';

function build(pairs: [string, number][]): ReaderDna {
  let dna = initialReaderDna();
  for (const [k, v] of pairs) dna = confirmDimension(dna, k, v, T);
  return dna;
}

export interface Archetype {
  id: string;
  label: string;
  dna: ReaderDna;
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'fast_thriller_lover',
    label: 'Fast thriller lover',
    dna: build([
      ['pacing', 0.9],
      ['slow_burn_tolerance', 0.15],
      ['complexity', 0.4],
      ['darkness', 0.6],
      ['emotional_intensity', 0.6],
    ]),
  },
  {
    id: 'literary_patient',
    label: 'Patient literary reader',
    dna: build([
      ['pacing', 0.25],
      ['slow_burn_tolerance', 0.9],
      ['complexity', 0.85],
      ['literary_vs_commercial', 0.85],
      ['prose_density', 0.8],
    ]),
  },
  {
    id: 'dark_averse',
    label: 'Dark-averse cozy reader',
    dna: build([
      ['darkness', 0.2],
      ['humor', 0.7],
      ['emotional_intensity', 0.35],
      ['pacing', 0.55],
    ]),
  },
  {
    id: 'audio_first',
    label: 'Audiobook-first commuter',
    dna: build([
      ['audiobook_affinity', 0.9],
      ['pacing', 0.7],
      ['book_length', 0.4],
    ]),
  },
];

export interface BookFixture {
  id: string;
  title: string;
  subjects: string[];
  pageCount: number;
  seriesPosition?: number | null;
}

export const BOOK_FIXTURES: BookFixture[] = [
  { id: 'fast_thriller', title: 'The Fast Case', subjects: ['Psychological thriller', 'Suspense'], pageCount: 320 },
  { id: 'literary_slow', title: 'The Quiet Estuary', subjects: ['Literary fiction'], pageCount: 520 },
  { id: 'dark_horror', title: 'The Long Dark', subjects: ['Horror'], pageCount: 400 },
  { id: 'epic_fantasy', title: 'Realm of Ash', subjects: ['Fantasy', 'Epic'], pageCount: 780, seriesPosition: 2 },
];
