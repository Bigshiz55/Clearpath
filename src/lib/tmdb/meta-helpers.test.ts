import { describe, it, expect } from 'vitest';
import { computeEnglishAvailability, deciderSearchUrl, episodeSummary } from './meta-helpers';

describe('computeEnglishAvailability', () => {
  it('English original is native', () => {
    expect(computeEnglishAvailability('en', ['English'], ['en'])).toBe('native');
  });
  it('non-English with an English translation is available', () => {
    expect(computeEnglishAvailability('da', ['Danish', 'English'], ['en', 'da'])).toBe('available');
  });
  it('non-English with no English is subtitles', () => {
    expect(computeEnglishAvailability('ko', ['Korean'], ['ko'])).toBe('subtitles');
  });
  it('no data is unknown', () => {
    expect(computeEnglishAvailability(null, [], [])).toBe('unknown');
  });
});

describe('deciderSearchUrl', () => {
  it('builds an encoded Decider search link', () => {
    expect(deciderSearchUrl('The Chestnut Man', 2021)).toBe(
      'https://decider.com/?s=The%20Chestnut%20Man%202021',
    );
  });
});

describe('episodeSummary', () => {
  it('summarizes a complete limited series', () => {
    expect(episodeSummary('tv', 6, 6, null)).toBe('6 of 6 episodes released · complete');
  });
  it('summarizes an ongoing series with a next date', () => {
    expect(episodeSummary('tv', 4, null, '2026-08-01')).toBe('4 episodes out · ongoing (next 2026-08-01)');
  });
  it('returns null for movies', () => {
    expect(episodeSummary('movie', null, null, null)).toBeNull();
  });
});
