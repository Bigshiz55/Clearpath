import { describe, it, expect } from 'vitest';
import {
  confidenceLabel,
  confidenceFromSample,
  combineConfidence,
  stabilityOf,
} from './confidence';
import { resolveConflict, hasConflict, freshnessDays, sourced } from './provenance';
import {
  isValidIsbn10,
  isValidIsbn13,
  isbn10To13,
  isbn13To10,
  toCanonicalIsbn13,
} from './isbn';
import {
  stringSimilarity,
  authorOverlap,
  matchBooks,
  clusterWorks,
  titleKey,
} from './entityResolution';
import {
  initialReaderDna,
  applyObservations,
  confirmDimension,
  explainDimension,
  profileStrength,
  type Observation,
} from './readerDna';

describe('confidence', () => {
  it('labels bands from a 0..1 score', () => {
    expect(confidenceLabel(0)).toBe('none');
    expect(confidenceLabel(0.3)).toBe('low');
    expect(confidenceLabel(0.5)).toBe('medium');
    expect(confidenceLabel(0.9)).toBe('high');
  });

  it('grows confidence with sample size but never overstates thin data', () => {
    expect(confidenceFromSample(0)).toBe(0);
    expect(confidenceFromSample(5)).toBeLessThan(0.5);
    expect(confidenceFromSample(1000)).toBeGreaterThan(0.9);
  });

  it('combines independent confidences without false certainty', () => {
    expect(combineConfidence(0.5, 0.5)).toBeCloseTo(0.75, 5);
    expect(combineConfidence()).toBe(0);
    expect(combineConfidence(0.9)).toBeCloseTo(0.9, 5);
  });

  it('derives stability from volume and confidence', () => {
    expect(stabilityOf(10, 0.8)).toBe('stable');
    expect(stabilityOf(4, 0.5)).toBe('emerging');
    expect(stabilityOf(1, 0.2)).toBe('uncertain');
  });
});

describe('provenance conflict resolution', () => {
  const now = '2026-07-23T00:00:00.000Z';
  it('prefers higher-priority source and preserves conflicts', () => {
    const userVal = sourced(320, 'user-supplied', 0.9, { source: 'user', retrievedAt: now });
    const olVal = sourced(316, 'sourced', 0.7, { source: 'openlibrary', retrievedAt: now });
    const resolved = resolveConflict([olVal, userVal]);
    expect(resolved?.value).toBe(320); // user wins
    expect(hasConflict(resolved)).toBe(true);
    expect(resolved?.conflicts?.[0]?.value).toBe(316);
  });

  it('does not record a conflict when values agree', () => {
    const a = sourced('Tor', 'sourced', 0.6, { source: 'openlibrary' });
    const b = sourced('tor', 'sourced', 0.6, { source: 'googlebooks' });
    const resolved = resolveConflict([a, b]);
    expect(hasConflict(resolved)).toBe(false);
  });

  it('computes freshness in days', () => {
    const v = sourced(1, 'sourced', 0.5, { source: 'x', retrievedAt: '2026-07-13T00:00:00.000Z' });
    expect(freshnessDays(v, now)).toBe(10);
  });
});

describe('isbn', () => {
  it('validates ISBN-10 and ISBN-13', () => {
    expect(isValidIsbn10('0306406152')).toBe(true);
    expect(isValidIsbn10('0306406153')).toBe(false);
    expect(isValidIsbn13('9780306406157')).toBe(true);
    expect(isValidIsbn13('9780306406158')).toBe(false);
  });

  it('converts between 10 and 13 round-trip', () => {
    expect(isbn10To13('0306406152')).toBe('9780306406157');
    expect(isbn13To10('9780306406157')).toBe('0306406152');
  });

  it('canonicalizes any valid ISBN to ISBN-13', () => {
    expect(toCanonicalIsbn13('0-306-40615-2')).toBe('9780306406157');
    expect(toCanonicalIsbn13('978 0 306 40615 7')).toBe('9780306406157');
    expect(toCanonicalIsbn13('not-an-isbn')).toBeNull();
  });
});

describe('entity resolution', () => {
  it('normalizes titles by dropping articles and subtitles', () => {
    expect(titleKey('The Silent Patient: A Novel')).toBe('silent patient');
  });

  it('matches identical editions by ISBN', () => {
    const r = matchBooks(
      { title: 'Dune', authors: ['Frank Herbert'], isbn13: '9780441013593' },
      { title: 'Dune (deluxe)', authors: ['F. Herbert'], isbn13: '9780441013593' },
    );
    expect(r.sameEdition).toBe(true);
    expect(r.score).toBe(1);
  });

  it('NEVER merges similar titles with no shared author', () => {
    const r = matchBooks(
      { title: 'Home', authors: ['Toni Morrison'], year: 2012 },
      { title: 'Home', authors: ['Marilynne Robinson'], year: 2008 },
    );
    expect(r.sameWork).toBe(false);
    expect(r.reason).toMatch(/no shared author/i);
  });

  it('matches the same work across editions by title + author', () => {
    const r = matchBooks(
      { title: 'The Silent Patient', authors: ['Alex Michaelides'], year: 2019 },
      { title: 'The Silent Patient: A Novel', authors: ['Alex Michaelides'], year: 2019, isbn13: '9781250301697' },
    );
    expect(r.sameWork).toBe(true);
  });

  it('clusters a mixed list without over-merging', () => {
    const clusters = clusterWorks([
      { title: 'Gone Girl', authors: ['Gillian Flynn'] },
      { title: 'Gone Girl', authors: ['Gillian Flynn'], isbn13: '9780307588371' },
      { title: 'Home', authors: ['Toni Morrison'] },
    ]);
    // The two Gone Girl rows merge; Home stays separate.
    expect(clusters.length).toBe(2);
    expect(clusters.some((c) => c.length === 2)).toBe(true);
  });

  it('string similarity is 1 for identical normalized titles', () => {
    expect(stringSimilarity('The Martian', 'Martian')).toBe(1);
    expect(authorOverlap(['Andy Weir'], ['andy weir'])).toBeGreaterThan(0);
  });
});

describe('Reader DNA', () => {
  const at = '2026-07-23T00:00:00.000Z';

  it('starts empty with zero profile strength', () => {
    const dna = initialReaderDna();
    expect(profileStrength(dna)).toBe(0);
  });

  it('learns a preference from consistent observations and gains confidence', () => {
    const obs: Observation[] = Array.from({ length: 6 }, () => ({
      key: 'pacing',
      observed: 0.9,
      weight: 0.8,
      at,
    }));
    const dna = applyObservations(initialReaderDna(), obs);
    const pacing = dna.dimensions.pacing!;
    expect(pacing.value).toBeGreaterThan(0.6);
    expect(pacing.confidence).toBeGreaterThan(0.3);
    expect(pacing.evidenceCount).toBe(6);
  });

  it('does not treat one observation as certain', () => {
    const dna = applyObservations(initialReaderDna(), [
      { key: 'darkness', observed: 1, weight: 0.5, at },
    ]);
    expect(dna.dimensions.darkness!.confidence).toBeLessThan(0.5);
    expect(dna.dimensions.darkness!.stability).toBe('uncertain');
  });

  it('lets the user confirm a dimension, pinning it', () => {
    const dna = confirmDimension(initialReaderDna(), 'spice', 0.1, at);
    const s = dna.dimensions.spice!;
    expect(s.userConfirmed).toBe(true);
    expect(s.confidence).toBeGreaterThanOrEqual(0.8);
    expect(explainDimension(s)).toMatch(/told us directly/i);
  });

  it('produces an evidence-grounded explanation', () => {
    const dna = applyObservations(initialReaderDna(), [
      { key: 'mystery', observed: 0.9, weight: 0.9, at },
      { key: 'mystery', observed: 0.85, weight: 0.9, at },
    ]);
    expect(explainDimension(dna.dimensions.mystery!)).toMatch(/interactions agreed/i);
  });
});
