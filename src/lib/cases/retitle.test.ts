import { describe, expect, it } from 'vitest';
import { detectRetitle, synopsisSimilarity, RETITLE_SIMILARITY_THRESHOLD } from './retitle';
import type { EpisodeInput } from './extraction';

function ep(overrides: Partial<EpisodeInput>): EpisodeInput {
  return {
    tvmazeEpisodeId: 1,
    series: 'Dateline NBC',
    network: 'NBC',
    title: 'Original Title',
    airdate: '2020-01-01',
    synopsis: 'A detailed account of the investigation into a disappearance in a small town.',
    ...overrides,
  };
}

describe('synopsisSimilarity', () => {
  it('is 1 for identical text', () => {
    expect(synopsisSimilarity('the quick brown fox', 'the quick brown fox')).toBe(1);
  });

  it('is near 0 for unrelated text', () => {
    expect(synopsisSimilarity('a murder investigation in texas', 'a bakery recipe for sourdough bread')).toBeLessThan(0.2);
  });
});

describe('detectRetitle', () => {
  it('flags a same-series near-identical synopsis as a retitle, not a Case match', () => {
    const a = ep({ tvmazeEpisodeId: 1, title: 'Premiere Title' });
    const b = ep({ tvmazeEpisodeId: 2, title: 'Rerun Title (Encore)' }); // same synopsis, different title
    const decision = detectRetitle(a, b);
    expect(decision.isRetitle).toBe(true);
    expect(decision.similarity).toBeGreaterThanOrEqual(RETITLE_SIMILARITY_THRESHOLD);
  });

  it('does not flag two different series as a retitle even with a similar synopsis', () => {
    const a = ep({ tvmazeEpisodeId: 1, series: 'Dateline NBC' });
    const b = ep({ tvmazeEpisodeId: 2, series: '48 Hours' });
    expect(detectRetitle(a, b).isRetitle).toBe(false);
  });

  it('does not flag same-series episodes with genuinely different synopses as a retitle', () => {
    const a = ep({ tvmazeEpisodeId: 1, synopsis: 'A murder in Ohio in 1998, told through court transcripts.' });
    const b = ep({ tvmazeEpisodeId: 2, synopsis: 'A kidnapping case in Florida from 2015 involving a ransom note.' });
    expect(detectRetitle(a, b).isRetitle).toBe(false);
  });
});
