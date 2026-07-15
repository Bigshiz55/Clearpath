import { describe, it, expect } from 'vitest';
import { computeStandardScore, type SourceReading } from './standardScore';
import { STANDARD_WEIGHTS } from './standardWeights';
import { precisionAtK, fitWeights, type CalibrationSample } from './calibrateStandardScore';

const inf = Number.POSITIVE_INFINITY;

describe('Standard Score', () => {
  it('returns a low-confidence neutral score when there is no data', () => {
    const r = computeStandardScore([], STANDARD_WEIGHTS);
    expect(r.score).toBe(55);
    expect(r.confidence).toBe('low');
    expect(r.coverage).toBe(0);
  });

  it('blends the sources that are present and never fabricates the rest', () => {
    const readings: SourceReading[] = [
      { key: 'tmdbAudience', value: 80, sampleSize: 5000 },
      { key: 'imdb', value: 86, sampleSize: inf },
      { key: 'rottenTomatoes', value: 91, sampleSize: inf },
      { key: 'metacritic', value: 88, sampleSize: inf },
    ];
    const r = computeStandardScore(readings, STANDARD_WEIGHTS);
    expect(r.coverage).toBe(4);
    expect(r.confidence).toBe('high');
    expect(r.score).toBeGreaterThanOrEqual(83);
    expect(r.score).toBeLessThanOrEqual(90);
    // Every present source carries some share, summing to ~1.
    const total = r.contributions.reduce((a, c) => a + c.weight, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it('down-weights a high score backed by almost no votes (pulls toward neutral)', () => {
    const thin = computeStandardScore([{ key: 'tmdbAudience', value: 95, sampleSize: 8 }], STANDARD_WEIGHTS);
    const solid = computeStandardScore([{ key: 'tmdbAudience', value: 95, sampleSize: 9000 }], STANDARD_WEIGHTS);
    expect(thin.score).toBeLessThan(solid.score);
    expect(thin.confidence).toBe('low');
  });

  it('treats a single editorial source as medium confidence, not high', () => {
    const r = computeStandardScore([{ key: 'rottenTomatoes', value: 90, sampleSize: inf }], STANDARD_WEIGHTS);
    expect(r.score).toBe(90); // trusted → no neutral pull
    expect(r.confidence).toBe('medium'); // but only one source → not "high"
  });

  it('lets Rotten Tomatoes outweigh a thin TMDB audience', () => {
    const r = computeStandardScore(
      [
        { key: 'tmdbAudience', value: 50, sampleSize: 30 },
        { key: 'rottenTomatoes', value: 95, sampleSize: inf },
      ],
      STANDARD_WEIGHTS,
    );
    const rt = r.contributions.find((c) => c.key === 'rottenTomatoes')!;
    const tmdb = r.contributions.find((c) => c.key === 'tmdbAudience')!;
    expect(rt.weight).toBeGreaterThan(tmdb.weight);
    expect(r.score).toBeGreaterThan(75);
  });
});

// --- The calibration brain -------------------------------------------------

// A deterministic synthetic world where "liked" tracks Rotten Tomatoes closely
// and TMDB audience is pure noise — the fitter should discover that.
function syntheticSamples(): CalibrationSample[] {
  const out: CalibrationSample[] = [];
  for (let i = 0; i < 60; i++) {
    const rt = (i * 37) % 101; // 0..100 spread
    const noise = (i * 53) % 101;
    out.push({
      readings: [
        { key: 'rottenTomatoes', value: rt, sampleSize: inf },
        { key: 'tmdbAudience', value: noise, sampleSize: 5000 },
      ],
      liked: rt >= 70, // ground truth depends only on RT
    });
  }
  return out;
}

describe('Calibration brain', () => {
  it('precision@K rewards weights that rank liked titles on top', () => {
    const samples = syntheticSamples();
    const rtHeavy = precisionAtK(samples, { rottenTomatoes: 0.9, imdb: 0, rtAudience: 0, tmdbAudience: 0.1, metacritic: 0 });
    const tmdbHeavy = precisionAtK(samples, { rottenTomatoes: 0.1, imdb: 0, rtAudience: 0, tmdbAudience: 0.9, metacritic: 0 });
    expect(rtHeavy).toBeGreaterThan(tmdbHeavy);
  });

  it('fits weights that beat (or match) the uniform baseline on held-out data', () => {
    const res = fitWeights(syntheticSamples());
    expect(res.hitRate).toBeGreaterThanOrEqual(res.baseline);
    // It should have learned that Rotten Tomatoes is the predictive source.
    expect(res.weights.rottenTomatoes).toBeGreaterThan(res.weights.tmdbAudience);
    expect(res.testSize).toBeGreaterThan(0);
  });

  it('handles an empty dataset without throwing', () => {
    const res = fitWeights([]);
    expect(res.hitRate).toBe(0);
    expect(res.trainSize).toBe(0);
  });
});
