import { describe, it, expect } from 'vitest';
import {
  applyInternationalConstraints,
  fromLegacyDetectors,
  isEmptyInternational,
  EMPTY_INTERNATIONAL,
  type InternationalConstraints,
} from './internationalConstraints';
import type { FinderQuery } from '@/lib/finder';

const baseQuery = (): FinderQuery => ({
  mediaType: 'any', genreIds: [], maxRuntime: null, sinceMonths: null,
  minAudience: null, minImdb: null, englishAudioOnly: false, onMyServices: false,
  minMatch: null, streamItOnly: false, bingeableOnly: false, upcoming: false,
  liveOnly: false, pace: null,
});
const intl = (over: Partial<InternationalConstraints>): InternationalConstraints => ({ ...EMPTY_INTERNATIONAL, ...over });

describe('applyInternationalConstraints — one meaning of each axis', () => {
  it('english_dub is dub-only + non-English original, NOT generic english audio', () => {
    const q = applyInternationalConstraints(baseQuery(), intl({ audioRequirement: 'english_dub' }));
    expect(q.englishDubOnly).toBe(true);
    expect(q.nonEnglishOriginal).toBe(true);
    expect(q.englishAudioOnly).toBeFalsy();
  });

  it('english_audio is the looser native-OR-dub gate, and does NOT force non-English', () => {
    const q = applyInternationalConstraints(baseQuery(), intl({ audioRequirement: 'english_audio' }));
    expect(q.englishAudioOnly).toBe(true);
    expect(q.englishDubOnly).toBeFalsy();
    expect(q.nonEnglishOriginal).toBeFalsy();
  });

  it('non_english class is a hard gate even without an audio requirement', () => {
    const q = applyInternationalConstraints(baseQuery(), intl({ originalLanguageClass: 'non_english' }));
    expect(q.nonEnglishOriginal).toBe(true);
    expect(q.englishDubOnly).toBeFalsy();
  });

  it('english class requires an English original', () => {
    const q = applyInternationalConstraints(baseQuery(), intl({ originalLanguageClass: 'english' }));
    expect(q.englishOriginalOnly).toBe(true);
  });

  it('carries required country + language and excluded languages', () => {
    const q = applyInternationalConstraints(
      baseQuery(),
      intl({ originCountriesRequired: ['KR'], originalLanguagesRequired: ['ko'], originalLanguagesExcluded: ['ja'] }),
    );
    expect(q.originCountries).toEqual(['KR']);
    expect(q.originalLanguages).toEqual(['ko']);
    expect(q.excludeOriginalLanguages).toEqual(['ja']);
  });

  it('original_audio / any add no hard English gate', () => {
    for (const audioRequirement of ['original_audio', 'any'] as const) {
      const q = applyInternationalConstraints(baseQuery(), intl({ audioRequirement }));
      expect(q.englishAudioOnly).toBeFalsy();
      expect(q.englishDubOnly).toBeFalsy();
    }
  });

  it('never loosens a stronger origin the parser already set', () => {
    const pre = { ...baseQuery(), originalLanguages: ['es'] };
    const q = applyInternationalConstraints(pre, intl({ originalLanguagesRequired: ['ko'] }));
    expect(q.originalLanguages).toEqual(['es']); // parser wins
  });
});

describe('fromLegacyDetectors — legacy path normalises into the SAME shape', () => {
  it('"english dubbed" → english_dub + non_english', () => {
    const c = fromLegacyDetectors({ countries: [], languages: [], foreign: false, englishAudioRequired: true, englishDubRequired: true, originalAudioPreferred: false });
    expect(c.audioRequirement).toBe('english_dub');
    expect(c.originalLanguageClass).toBe('non_english');
  });
  it('"in English" (no dub) → english_audio, class stays any', () => {
    const c = fromLegacyDetectors({ countries: [], languages: [], foreign: false, englishAudioRequired: true, englishDubRequired: false, originalAudioPreferred: false });
    expect(c.audioRequirement).toBe('english_audio');
    expect(c.originalLanguageClass).toBe('any');
  });
  it('a named foreign language → required language + non_english', () => {
    const c = fromLegacyDetectors({ countries: ['KR'], languages: ['ko'], foreign: true, englishAudioRequired: false, englishDubRequired: false, originalAudioPreferred: false });
    expect(c.originalLanguagesRequired).toEqual(['ko']);
    expect(c.originalLanguageClass).toBe('non_english');
    expect(c.originCountriesRequired).toEqual(['KR']);
  });
  it('applying the legacy-normalised shape yields the same finder gates as a dub', () => {
    const c = fromLegacyDetectors({ countries: [], languages: [], foreign: true, englishAudioRequired: true, englishDubRequired: true, originalAudioPreferred: false });
    const q = applyInternationalConstraints(baseQuery(), c);
    expect(q.englishDubOnly).toBe(true);
    expect(q.nonEnglishOriginal).toBe(true);
  });
});

describe('isEmptyInternational', () => {
  it('is true for the empty constraints and false once anything is set', () => {
    expect(isEmptyInternational(EMPTY_INTERNATIONAL)).toBe(true);
    expect(isEmptyInternational(intl({ audioRequirement: 'english_dub' }))).toBe(false);
  });
});
