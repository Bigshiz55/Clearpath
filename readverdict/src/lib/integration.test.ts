// Integration tests exercising the critical end-to-end data flow at the engine
// level (framework-free): onboarding → Reader DNA → verdict → learning from
// finishing/abandoning → the next verdict reflects the new evidence.

import { describe, it, expect } from 'vitest';
import { interviewToObservations } from '@/lib/onboarding/interview';
import { initialReaderDna, applyObservations, type Observation } from '@/lib/domain/readerDna';
import { parseGoodreadsCsv } from '@/lib/import/goodreads';
import { detectDuplicates } from '@/lib/import';
import { providerBookToWork } from '@/lib/providers/normalize';
import { buildTrial } from '@/lib/trial/trial';
import type { ProviderBook } from '@/lib/providers/types';

const NOW = '2026-07-23T00:00:00.000Z';

function providerBook(subjects: string[], pageCount: number, title = 'The Case'): ProviderBook {
  return {
    source: 'test',
    sourceId: title.toLowerCase().replace(/\s+/g, '-'),
    title,
    subtitle: null,
    authors: ['Test Author'],
    firstPublishYear: 2020,
    isbn13: '9780306406157',
    isbn10: null,
    coverUrl: null,
    subjects,
    languages: ['eng'],
    pageCount,
    rating: { average: 4.0, count: 600 },
  };
}

describe('end-to-end: onboarding → DNA → verdict', () => {
  it('a fast-thriller reader gets a positive verdict on a fast thriller', () => {
    const obs = interviewToObservations(
      { choices: { pacing: 'fast', emotional_intensity: 'intense', complexity: 'easy', darkness: 'some' } },
      NOW,
    );
    const dna = applyObservations(initialReaderDna(), obs);
    const work = providerBookToWork(providerBook(['Psychological thriller', 'Suspense'], 320), NOW);
    const trial = buildTrial({ work, dna, now: NOW });

    expect(trial.verdict.matchScore).toBeGreaterThan(55);
    expect(['READ IT', 'BORROW—DON’T BUY', 'SAMPLE IT FIRST', 'LISTEN—DON’T READ']).toContain(trial.verdict.call);
    // Honest engine: still no fabricated cohort data.
    expect(trial.jury.split).toBeNull();
  });
});

describe('end-to-end: learning from behavior changes the next verdict', () => {
  it('abandoning slow books lowers finish probability for the next slow book', () => {
    const base = initialReaderDna();
    const slowWork = providerBookToWork(providerBook(['Literary fiction'], 540, 'Slow One'), NOW);

    const before = buildTrial({ work: slowWork, dna: base, now: NOW });

    // Reader repeatedly abandons slow books → strong low slow-burn-tolerance signal.
    const learning: Observation[] = Array.from({ length: 6 }, () => ({
      key: 'slow_burn_tolerance',
      observed: 0.1,
      weight: 0.8,
      at: NOW,
    })).concat(
      Array.from({ length: 6 }, () => ({ key: 'pacing', observed: 0.9, weight: 0.8, at: NOW })),
    );
    const learnedDna = applyObservations(base, learning);
    const after = buildTrial({ work: slowWork, dna: learnedDna, now: NOW });

    expect(after.prediction.finishProbability).toBeLessThan(before.prediction.finishProbability);
    expect(after.prediction.negatives.length).toBeGreaterThan(0);
  });
});

describe('end-to-end: import → dedup → library-ready refs', () => {
  it('imports a Goodreads CSV, canonicalizes ISBNs, and flags duplicates', () => {
    const csv = [
      'Title,Author,ISBN,ISBN13,My Rating,Exclusive Shelf',
      'Gone Girl,Gillian Flynn,="0307588378",="9780307588371",4,read',
      'Gone Girl,Gillian Flynn,="0307588378",="9780307588371",4,read',
      'Home,Toni Morrison,="",="",3,read',
    ].join('\n');
    const result = parseGoodreadsCsv(csv);
    expect(result.summary.parsed).toBe(3);
    const dupes = detectDuplicates(result.books);
    expect(dupes.length).toBe(1); // the two Gone Girl rows
    expect(result.books[0]!.isbn13).toBe('9780307588371');
  });
});
