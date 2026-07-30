import { describe, it, expect } from 'vitest';
import { RECONCILE_TOLERANCE, showWork, sourceLabel, workSentence } from './showWork';
import type { StandardContribution } from './standardScore';

const c = (key: string, value: number, weight: number): StandardContribution =>
  ({ key, value, weight }) as StandardContribution;

describe('showWork', () => {
  it('turns the real contributions into rows that add up to the score', () => {
    const contributions = [c('imdb', 80, 0.5), c('rottenTomatoes', 90, 0.3), c('tmdbAudience', 70, 0.2)];
    const score = 80 * 0.5 + 90 * 0.3 + 70 * 0.2; // 81
    const w = showWork({ contributions, score });
    expect(w.rows).toHaveLength(3);
    expect(w.subtotal).toBeCloseTo(81, 6);
    expect(w.reconciles).toBe(true);
  });

  it('REFUSES to reconcile when the rows do not actually make the number', () => {
    // A breakdown that does not add up is a lie with a chart on it. The caller
    // needs to be able to tell, so this is a flag rather than a silent fudge.
    const w = showWork({ contributions: [c('imdb', 80, 0.5)], score: 95 });
    expect(w.reconciles).toBe(false);
    expect(w.residual).toBeGreaterThan(RECONCILE_TOLERANCE);
    expect(workSentence(w)).toBeNull();
  });

  it('never claims to show working when there is none', () => {
    const w = showWork({ contributions: [], score: 70 });
    expect(w.rows).toEqual([]);
    expect(w.reconciles).toBe(false);
  });

  it('orders by what each source actually contributed, not by name', () => {
    const w = showWork({
      contributions: [c('tmdbAudience', 60, 0.2), c('imdb', 90, 0.6), c('metacritic', 70, 0.2)],
      score: 60 * 0.2 + 90 * 0.6 + 70 * 0.2,
    });
    expect(w.rows[0]!.key).toBe('imdb');
  });

  it('drops a zero-weight source from the rows rather than showing a 0 line', () => {
    const w = showWork({ contributions: [c('imdb', 80, 1), c('metacritic', 90, 0)], score: 80 });
    expect(w.rows.map((r) => r.key)).toEqual(['imdb']);
  });

  it('names what is missing instead of hiding it', () => {
    const w = showWork({ contributions: [c('imdb', 80, 1)], score: 80, missingKeys: ['rottenTomatoes'] });
    expect(w.missing).toEqual(['Rotten Tomatoes']);
  });

  it('keeps the taste adjustment as its own line, not folded into the blend', () => {
    const w = showWork({ contributions: [c('imdb', 80, 1)], score: 80, personalDelta: 7 });
    expect(w.subtotal).toBe(80);
    expect(w.personalDelta).toBe(7);
    expect(w.total).toBe(87);
    expect(w.reconciles).toBe(true);
  });

  it('handles a negative taste adjustment', () => {
    const w = showWork({ contributions: [c('imdb', 80, 1)], score: 80, personalDelta: -12 });
    expect(w.total).toBe(68);
    expect(workSentence(w)).toContain('−12');
  });
});

describe('workSentence', () => {
  it('reads as arithmetic a person can check', () => {
    const w = showWork({
      contributions: [c('imdb', 78, 0.5), c('rottenTomatoes', 90, 0.5)],
      score: 84,
      personalDelta: 5,
    });
    const s = workSentence(w)!;
    expect(s).toContain('IMDb 78 × 50%');
    expect(s).toContain('Rotten Tomatoes 90 × 50%');
    expect(s).toContain('= 84');
    expect(s).toContain('+5 for your taste = 89');
  });

  it('omits the taste clause entirely when there is no adjustment', () => {
    const w = showWork({ contributions: [c('imdb', 80, 1)], score: 80 });
    expect(workSentence(w)).not.toContain('taste');
  });
});

describe('sourceLabel', () => {
  it('uses the names people actually use', () => {
    expect(sourceLabel('rottenTomatoes')).toBe('Rotten Tomatoes');
    expect(sourceLabel('tmdbAudience')).toBe('Audience score');
    expect(sourceLabel('imdb')).toBe('IMDb');
  });

  it('degrades to something readable for a source it has never seen', () => {
    expect(sourceLabel('someNewSource')).toBe('Some New Source');
  });
});
