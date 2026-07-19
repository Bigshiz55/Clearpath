import { describe, it, expect } from 'vitest';
import { fitReranker, predict, rerankNudge, NEUTRAL_MODEL, RERANK_NUDGE_MAX, type RerankSample } from './reranker';

describe('reranker — neutral model', () => {
  it('predicts 0.5 and nudges nothing', () => {
    expect(predict(90, 20, NEUTRAL_MODEL)).toBeCloseTo(0.5, 6);
    expect(rerankNudge(90, 20, NEUTRAL_MODEL)).toBe(0);
    expect(rerankNudge(10, 95, NEUTRAL_MODEL)).toBe(0);
  });
});

describe('fitReranker', () => {
  it('learns that content fit predicts liking when it does, beating objective-only', () => {
    // Construct data where LIKING tracks dimMatch, not objective quality.
    const samples: RerankSample[] = [];
    for (let i = 0; i < 60; i++) {
      const liked = i % 4 < 2; // not parity-aligned → both classes land in each split
      const dimMatch = liked ? 85 : 20;
      const objective = 60; // constant → carries no signal
      samples.push({ objective, dimMatch, liked });
    }
    const fit = fitReranker(samples);
    // Learned model should rank the high-fit (liked) titles on top → precision 1.
    expect(fit.hitRate).toBeGreaterThanOrEqual(fit.baseline);
    expect(fit.hitRate).toBeGreaterThan(0.9);
    expect(fit.model.wDim).toBeGreaterThan(0); // positive weight on content fit
  });

  it('is deterministic — same data in, same model out', () => {
    const samples: RerankSample[] = Array.from({ length: 40 }, (_, i) => ({
      objective: (i * 7) % 100,
      dimMatch: (i * 13) % 100,
      liked: (i * 7) % 100 > 55,
    }));
    const a = fitReranker(samples);
    const b = fitReranker(samples);
    expect(a.model).toEqual(b.model);
  });

  it('nudge stays within bounds', () => {
    const samples: RerankSample[] = Array.from({ length: 50 }, (_, i) => ({
      objective: 50,
      dimMatch: i % 2 ? 95 : 5,
      liked: i % 2 === 1,
    }));
    const { model } = fitReranker(samples);
    for (const [o, d] of [[100, 100], [0, 0], [50, 90], [90, 10]] as const) {
      const n = rerankNudge(o, d, model);
      expect(n).toBeGreaterThanOrEqual(-RERANK_NUDGE_MAX);
      expect(n).toBeLessThanOrEqual(RERANK_NUDGE_MAX);
    }
  });
});
