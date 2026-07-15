import { describe, it, expect } from 'vitest';
import { originSummary, flagFor } from './origin';

const base = { mediaType: 'movie' as const };

describe('origin summary', () => {
  it('labels an American English-language film clearly', () => {
    const o = originSummary({ ...base, originCountries: ['US'], originalLanguage: 'en', englishAvailability: 'native' })!;
    expect(o.headline).toBe('American film');
    expect(o.good).toBe(true);
    expect(o.chip).toBe('🇺🇸 American');
    expect(o.note).toMatch(/Originally in English/);
  });

  it('distinguishes British English from American', () => {
    const o = originSummary({ ...base, mediaType: 'tv', originCountries: ['GB'], originalLanguage: 'en', englishAvailability: 'native' })!;
    expect(o.headline).toBe('British series');
    expect(o.chip).toBe('🇬🇧 British');
  });

  it('flags a foreign-language film that is dubbed vs. subtitle-only', () => {
    const dub = originSummary({ ...base, originCountries: ['KR'], originalLanguage: 'ko', englishAvailability: 'available' })!;
    expect(dub.headline).toBe('South Korean film');
    expect(dub.note).toMatch(/Korean/);
    expect(dub.note).toMatch(/English dub/);
    expect(dub.chip).toContain('English dub');

    const sub = originSummary({ ...base, originCountries: ['JP'], originalLanguage: 'ja', englishAvailability: 'subtitles' })!;
    expect(sub.good).toBe(false);
    expect(sub.chip).toContain('subtitled');
    expect(sub.note).toMatch(/subtitles/);
  });

  it('falls back to "From <Country>" when there is no known demonym', () => {
    const o = originSummary({ ...base, originCountries: ['MT'], originalLanguage: 'mt', englishAvailability: 'subtitles' })!;
    // Malta has no demonym in the map → uses the country name form.
    expect(o.headline).toMatch(/^Film from /);
  });

  it('returns null only when there is truly nothing to say', () => {
    expect(originSummary({ ...base, originCountries: [], originalLanguage: null, englishAvailability: 'unknown' })).toBeNull();
  });

  it('derives flags from ISO codes', () => {
    expect(flagFor('US')).toBe('🇺🇸');
    expect(flagFor('KR')).toBe('🇰🇷');
    expect(flagFor('xx')).not.toBe('');
  });
});
