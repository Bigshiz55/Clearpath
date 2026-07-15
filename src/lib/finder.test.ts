import { describe, it, expect } from 'vitest';
import { naiveParseQuery, describeQuery } from './finderParse';

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

  it('reads a parsed case back in plain English', () => {
    const q = naiveParseQuery('a crime thriller movie under 140 minutes, last 24 months, 80+ match');
    const said = describeQuery(q);
    expect(said).toContain('movies');
    expect(said.toLowerCase()).toContain('crime');
    expect(said).toContain('under 2h20m');
    expect(said).toContain('80+ match');
  });

  it('admits when it pinned down no constraints', () => {
    expect(describeQuery(naiveParseQuery('hello there'))).toContain('anything');
  });

  it('handles the competitor prompt that beat their app', () => {
    const q = naiveParseQuery(
      'a show with at least one season, all episodes out so I can binge, audience above 80%, has to have English audio, on my services',
    );
    expect(q.mediaType).toBe('tv');
    expect(q.minAudience).toBe(80);
    expect(q.englishAudioOnly).toBe(true);
    expect(q.onMyServices).toBe(true);
    expect(q.bingeableOnly).toBe(true);
  });

  it('reads pace and stream-it intent', () => {
    expect(naiveParseQuery('a slow burn drama').pace).toBe(15);
    expect(naiveParseQuery('an adrenaline rush, non-stop action').pace).toBe(90);
    expect(naiveParseQuery('only stream-it worthy picks').streamItOnly).toBe(true);
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
