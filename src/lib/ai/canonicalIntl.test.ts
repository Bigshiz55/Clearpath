import { describe, it, expect } from 'vitest';
import { validateCanonicalDiscoveryRequest } from './schemas';
import { canonicalToQuery } from './canonicalToQuery';

/** Build a validated canonical request from a partial (schema fills defaults). */
function validated(partial: Record<string, unknown>) {
  const res = validateCanonicalDiscoveryRequest({
    intent: 'discover',
    interpretationSummary: 'test',
    ...partial,
  });
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

describe('canonical schema — international block + requestedCount', () => {
  it('accepts a full international block and an explicit count', () => {
    const req = validated({
      mediaTypes: ['tv'],
      requestedCount: 10,
      hardConstraints: {
        international: {
          originCountriesRequired: ['KR'],
          originalLanguagesExcluded: ['ja'],
          originalLanguageClass: 'non_english',
          audioRequirement: 'english_dub',
        },
      },
    });
    expect(req.requestedCount).toBe(10);
    expect(req.hardConstraints.international.audioRequirement).toBe('english_dub');
  });

  it('rejects an unknown audioRequirement enum', () => {
    const res = validateCanonicalDiscoveryRequest({
      intent: 'discover', interpretationSummary: 't',
      hardConstraints: { international: { audioRequirement: 'english_subtitles' } },
    });
    expect(res.ok).toBe(false);
  });

  it('rejects a requestedCount above the cap', () => {
    const res = validateCanonicalDiscoveryRequest({ intent: 'discover', interpretationSummary: 't', requestedCount: 9999 });
    expect(res.ok).toBe(false);
  });

  it('defaults are empty/any when the block is omitted', () => {
    const req = validated({});
    expect(req.hardConstraints.international.originalLanguageClass).toBe('any');
    expect(req.hardConstraints.international.audioRequirement).toBe('any');
    expect(req.requestedCount).toBeNull();
  });
});

describe('canonicalToQuery — no constraint disappears', () => {
  it('the reported query maps to TV + non-English original + English dub + count', () => {
    // "Find me 10 shows that are foreign and have dubbed English audio"
    const req = validated({
      mediaTypes: ['tv'],
      requestedCount: 10,
      hardConstraints: {
        international: { originalLanguageClass: 'non_english', audioRequirement: 'english_dub' },
      },
    });
    const { query } = canonicalToQuery(req);
    expect(query.mediaType).toBe('tv');
    expect(query.finalCount).toBe(10);
    expect(query.englishDubOnly).toBe(true);
    expect(query.nonEnglishOriginal).toBe(true);
    expect(query.englishAudioOnly).toBeFalsy(); // dub is NOT generic english audio
  });

  it('preserves country + language + audio + runtime + date + count together', () => {
    // "Five Korean crime shows on Netflix with English dubbing, under 60 min, since 2020"
    const req = validated({
      mediaTypes: ['tv'],
      requestedCount: 5,
      hardConstraints: {
        runtimeMaxMinutes: 60,
        releaseDateMin: '2020-01-01',
        international: {
          originCountriesRequired: ['KR'],
          originalLanguagesRequired: ['ko'],
          originalLanguageClass: 'non_english',
          audioRequirement: 'english_dub',
        },
      },
    });
    const { query } = canonicalToQuery(req);
    expect(query.mediaType).toBe('tv');
    expect(query.finalCount).toBe(5);
    expect(query.originCountries).toEqual(['KR']);
    expect(query.originalLanguages).toEqual(['ko']);
    expect(query.englishDubOnly).toBe(true);
    expect(query.nonEnglishOriginal).toBe(true);
    expect(query.maxRuntime).toBe(60);
    expect(query.minReleaseDate).toBe('2020-01-01');
  });

  it('"English-language foreign films" → english original gate, not a dub', () => {
    const req = validated({
      mediaTypes: ['movie'],
      hardConstraints: { international: { originalLanguageClass: 'english' } },
    });
    const { query } = canonicalToQuery(req);
    expect(query.englishOriginalOnly).toBe(true);
    expect(query.englishDubOnly).toBeFalsy();
    expect(query.nonEnglishOriginal).toBeFalsy();
  });

  it('"foreign shows, but not Korean" → non-English original with an excluded language', () => {
    const req = validated({
      mediaTypes: ['tv'],
      hardConstraints: {
        international: { originalLanguageClass: 'non_english', originalLanguagesExcluded: ['ko'] },
      },
    });
    const { query } = canonicalToQuery(req);
    expect(query.nonEnglishOriginal).toBe(true);
    expect(query.excludeOriginalLanguages).toEqual(['ko']);
  });
});
