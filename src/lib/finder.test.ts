import { describe, it, expect } from 'vitest';
import { naiveParseQuery } from './finderParse';

describe('Finder natural-language parsing (no AI needed)', () => {
  it('parses the flagship example correctly', () => {
    const q = naiveParseQuery(
      'a movie that is under 140 minutes long, is a crime thriller, it’s been out within the last 24 months, and it gave a watch verdict of 80+',
    );
    expect(q.mediaType).toBe('movie');
    expect(q.genreIds.sort()).toEqual([53, 80]); // thriller, crime
    expect(q.maxRuntime).toBe(140);
    expect(q.sinceMonths).toBe(24);
    expect(q.minMatch).toBe(80);
  });

  it('handles the competitor prompt that beat their app', () => {
    const q = naiveParseQuery(
      'a show with at least one season, all episodes out so I can binge, audience above 80%, has to have English audio, on my services',
    );
    expect(q.mediaType).toBe('tv');
    expect(q.minAudience).toBe(80);
    expect(q.englishAudioOnly).toBe(true);
    expect(q.onMyServices).toBe(true);
  });

  it('reads hours and years too', () => {
    const q = naiveParseQuery('something under 2 hours from the last 3 years');
    expect(q.maxRuntime).toBe(120);
    expect(q.sinceMonths).toBe(36);
  });

  it('defaults to no constraints on an empty ask', () => {
    const q = naiveParseQuery('help me pick something');
    expect(q.mediaType).toBe('any');
    expect(q.genreIds).toHaveLength(0);
    expect(q.minMatch).toBeNull();
  });
});
