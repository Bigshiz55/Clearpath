import { describe, it, expect } from 'vitest';
import { interviewToObservations, INTERVIEW_QUESTIONS } from './interview';
import { applyObservations, initialReaderDna } from '@/lib/domain/readerDna';

const NOW = '2026-07-23T00:00:00.000Z';

describe('Reader Interview', () => {
  it('maps choices to observations and builds Reader DNA', () => {
    const obs = interviewToObservations(
      { choices: { pacing: 'fast', series: 'standalone', format: 'audio' } },
      NOW,
    );
    expect(obs.length).toBeGreaterThan(0);
    const dna = applyObservations(initialReaderDna(), obs);
    expect(dna.dimensions.pacing!.value).toBeGreaterThan(0.6);
    expect(dna.dimensions.series_commitment!.value).toBeLessThan(0.4);
    expect(dna.dimensions.audiobook_affinity!.value).toBeGreaterThan(0.6);
  });

  it('turns abandoned-book DNF reasons into strong pacing signals', () => {
    const obs = interviewToObservations(
      { choices: {}, books: [{ sentiment: 'abandoned', reasons: ['too_slow'] }] },
      NOW,
    );
    const keys = obs.map((o) => o.key);
    expect(keys).toContain('pacing');
    expect(keys).toContain('slow_burn_tolerance');
  });

  it('ignores unknown question ids and option values', () => {
    const obs = interviewToObservations({ choices: { nope: 'x', pacing: 'bogus' } }, NOW);
    expect(obs).toHaveLength(0);
  });

  it('every question option references only known-shaped observations', () => {
    for (const q of INTERVIEW_QUESTIONS) {
      for (const opt of q.options) {
        for (const o of opt.observations) {
          expect(o.observed).toBeGreaterThanOrEqual(0);
          expect(o.observed).toBeLessThanOrEqual(1);
          expect(o.weight).toBeGreaterThan(0);
        }
      }
    }
  });
});
