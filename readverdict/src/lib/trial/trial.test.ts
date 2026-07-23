import { describe, it, expect } from 'vitest';
import { inferBookDna } from '@/lib/dna/inferBookDna';
import { computeMatch } from './match';
import { predictFinish } from './predict';
import { buildTrial } from './trial';
import { answerCross } from './crossExamination';
import {
  initialReaderDna,
  applyObservations,
  confirmDimension,
  type ReaderDna,
} from '@/lib/domain/readerDna';
import { providerBookToWork } from '@/lib/providers/normalize';
import type { ProviderBook } from '@/lib/providers/types';
import type { Work } from '@/lib/domain/book';

const NOW = '2026-07-23T00:00:00.000Z';

function fastReader(): ReaderDna {
  let dna = initialReaderDna();
  dna = confirmDimension(dna, 'pacing', 0.9, NOW);
  dna = confirmDimension(dna, 'slow_burn_tolerance', 0.15, NOW);
  dna = confirmDimension(dna, 'complexity', 0.4, NOW);
  dna = confirmDimension(dna, 'darkness', 0.5, NOW);
  return dna;
}

function makeWork(subjects: string[], pageCount: number, title = 'Test Book'): Work {
  const pb: ProviderBook = {
    source: 'mock',
    sourceId: title.toLowerCase().replace(/\s+/g, '-'),
    title,
    subtitle: null,
    authors: ['A. Writer'],
    firstPublishYear: 2019,
    isbn13: '9780306406157',
    isbn10: '0306406152',
    coverUrl: null,
    subjects,
    languages: ['eng'],
    pageCount,
    rating: { average: 4.1, count: 800 },
  };
  return providerBookToWork(pb, NOW);
}

describe('inferBookDna', () => {
  it('infers thriller axes with honest low confidence', () => {
    const dna = inferBookDna({ subjects: ['Psychological thriller', 'Mystery'], pageCount: 336 });
    expect(dna.pacing?.value).toBeGreaterThan(0.5);
    expect(dna.suspense?.confidence).toBeLessThanOrEqual(0.5);
  });

  it('returns no numeric axes for unknown subjects', () => {
    const dna = inferBookDna({ subjects: ['Basket weaving'], pageCount: 100 });
    expect(dna.pacing).toBeUndefined();
  });
});

describe('computeMatch', () => {
  it('scores a fast thriller high for a fast-paced reader', () => {
    const book = inferBookDna({ subjects: ['Thriller'], pageCount: 320 });
    const m = computeMatch(fastReader(), book);
    expect(m.score).toBeGreaterThan(55);
    expect(m.contributions.length).toBeGreaterThan(0);
  });

  it('returns a neutral, low-confidence score with no overlapping evidence', () => {
    const book = inferBookDna({ subjects: ['Thriller'], pageCount: 320 });
    const m = computeMatch(initialReaderDna(), book);
    expect(['low', 'none']).toContain(m.confidence);
    expect(m.score).toBeGreaterThanOrEqual(45);
    expect(m.score).toBeLessThanOrEqual(65);
  });
});

describe('predictFinish', () => {
  it('lowers finish probability for a slow book and a low-tolerance reader', () => {
    const slow = inferBookDna({ subjects: ['Literary fiction'], pageCount: 520 });
    const m = computeMatch(fastReader(), slow);
    const p = predictFinish({ match: m, book: slow, dna: fastReader(), pageCount: 520 });
    expect(p.dnfRisk).toBeGreaterThan(0.3);
    expect(p.strugglePoint).toBeTruthy();
    expect(p.negatives.length).toBeGreaterThan(0);
  });

  it('never claims false precision when confidence is low', () => {
    const book = inferBookDna({ subjects: ['Thriller'], pageCount: 300 });
    const p = predictFinish({ match: computeMatch(initialReaderDna(), book), book, dna: initialReaderDna(), pageCount: 300 });
    expect(['low', 'none']).toContain(p.finishConfidence);
  });
});

describe('buildTrial', () => {
  const work = makeWork(['Psychological thriller', 'Mystery'], 336, 'The Silent Patient');
  const trial = buildTrial({ work, dna: fastReader(), now: NOW });

  it('produces a full case with a decisive verdict', () => {
    expect(trial.caseName).toContain('THE PEOPLE v.');
    expect(trial.docket).toMatch(/^RV-\d{4}-\d{5}$/);
    expect(trial.charges.length).toBeGreaterThan(0);
    expect(trial.verdict.call).toBeTruthy();
    expect(trial.verdict.matchScore).toBeGreaterThan(0);
    expect(trial.verdict.sentence.length).toBeGreaterThan(0);
  });

  it('NEVER fabricates completion or cohort stats', () => {
    const completion = trial.evidence.find((e) => e.key === 'completion_data');
    expect(completion?.status).toBe('insufficient');
    expect(completion?.value).toBeNull();
    expect(trial.jury.split).toBeNull();
    expect(trial.jury.basis).toBe('modeled-similarity');
    expect(trial.witnesses[0]!.sampleSize).toBeNull();
  });

  it('reports a real sourced rating in evidence when present', () => {
    const rating = trial.evidence.find((e) => e.key === 'reader_rating');
    expect(rating?.status).toBe('sourced');
    expect(rating?.value).toMatch(/\/5/);
  });

  it('is deterministic for identical input', () => {
    const again = buildTrial({ work, dna: fastReader(), now: NOW });
    expect(again).toEqual(trial);
  });
});

describe('cross-examination', () => {
  const ctx = {
    book: inferBookDna({ subjects: ['Literary fiction'], pageCount: 500 }),
    seriesPosition: null,
    hasAudio: false,
  };

  it('withholds spoiler-sensitive answers by default', () => {
    const a = answerCross('ending_worth', ctx, 'none');
    expect(a.withheld).toBe(true);
  });

  it('answers a pacing question from inference', () => {
    const a = answerCross('slow_burn', ctx, 'none');
    expect(a.status).toBe('inferred');
    expect(a.answer).toMatch(/build|paced|quick/i);
  });

  it('refuses to fabricate an answer it lacks data for', () => {
    const a = answerCross('dog_dies', ctx, 'none');
    expect(a.status).toBe('insufficient');
    expect(a.answer).toMatch(/not proof|no content-warning data/i);
  });
});
