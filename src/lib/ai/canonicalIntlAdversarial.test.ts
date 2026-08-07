import { describe, it, expect } from 'vitest';
import { validateCanonicalDiscoveryRequest, type CanonicalDiscoveryRequest } from './schemas';
import { canonicalToQuery } from './canonicalToQuery';

/**
 * ADVERSARIAL INTERNATIONAL SUITE — the mission's generalisation queries, each
 * expressed as the canonical request Claude SHOULD emit, asserting the mapping
 * preserves the defining constraints (no drift, no disappearance). Additive and
 * versioned; the frozen search corpus is untouched.
 */

type Expect = {
  mediaType?: 'any' | 'movie' | 'tv';
  finalCount?: number | null;
  nonEnglishOriginal?: boolean;
  englishOriginalOnly?: boolean;
  englishDubOnly?: boolean;
  englishAudioOnly?: boolean;
  originCountries?: string[];
  originalLanguages?: string[];
  excludeOriginalLanguages?: string[];
  providerNamesPending?: string[];
};

function v(partial: Record<string, unknown>): CanonicalDiscoveryRequest {
  const res = validateCanonicalDiscoveryRequest({ intent: 'discover', interpretationSummary: 't', ...partial });
  if (!res.ok) throw new Error(res.error);
  return res.value;
}

const CASES: Array<{ name: string; req: CanonicalDiscoveryRequest; want: Expect }> = [
  {
    name: '10 Korean shows dubbed in English',
    req: v({ mediaTypes: ['tv'], requestedCount: 10, hardConstraints: { international: { originCountriesRequired: ['KR'], originalLanguagesRequired: ['ko'], originalLanguageClass: 'non_english', audioRequirement: 'english_dub' } } }),
    want: { mediaType: 'tv', finalCount: 10, originCountries: ['KR'], originalLanguages: ['ko'], englishDubOnly: true, nonEnglishOriginal: true, englishAudioOnly: false },
  },
  {
    name: 'Japanese movies with English audio',
    req: v({ mediaTypes: ['movie'], hardConstraints: { international: { originCountriesRequired: ['JP'], originalLanguagesRequired: ['ja'], originalLanguageClass: 'non_english', audioRequirement: 'english_audio' } } }),
    want: { mediaType: 'movie', originalLanguages: ['ja'], englishAudioOnly: true, englishDubOnly: false, nonEnglishOriginal: true },
  },
  {
    name: 'foreign crime shows with an English dub',
    req: v({ mediaTypes: ['tv'], hardConstraints: { international: { originalLanguageClass: 'non_english', audioRequirement: 'english_dub' } } }),
    want: { mediaType: 'tv', nonEnglishOriginal: true, englishDubOnly: true },
  },
  {
    name: 'Spanish-language thrillers, subtitles are fine',
    req: v({ mediaTypes: ['movie'], hardConstraints: { international: { originalLanguagesRequired: ['es'], originalLanguageClass: 'non_english', audioRequirement: 'original_audio' } } }),
    want: { originalLanguages: ['es'], nonEnglishOriginal: true, englishDubOnly: false, englishAudioOnly: false },
  },
  {
    name: 'French movies in French',
    req: v({ mediaTypes: ['movie'], hardConstraints: { international: { originCountriesRequired: ['FR'], originalLanguagesRequired: ['fr'], originalLanguageClass: 'non_english', audioRequirement: 'original_audio' } } }),
    want: { originalLanguages: ['fr'], nonEnglishOriginal: true, englishAudioOnly: false },
  },
  {
    name: 'non-English horror movies with English dubbing',
    req: v({ mediaTypes: ['movie'], hardConstraints: { international: { originalLanguageClass: 'non_english', audioRequirement: 'english_dub' } } }),
    want: { nonEnglishOriginal: true, englishDubOnly: true },
  },
  {
    name: 'English-language foreign films',
    req: v({ mediaTypes: ['movie'], hardConstraints: { international: { originalLanguageClass: 'english' } } }),
    want: { englishOriginalOnly: true, nonEnglishOriginal: false, englishDubOnly: false },
  },
  {
    name: 'anime with English dub',
    req: v({ mediaTypes: ['tv'], hardConstraints: { requiredSubjects: ['anime'], international: { originalLanguagesRequired: ['ja'], originalLanguageClass: 'non_english', audioRequirement: 'english_dub' } } }),
    want: { mediaType: 'tv', originalLanguages: ['ja'], englishDubOnly: true, nonEnglishOriginal: true },
  },
  {
    name: 'German shows, original audio only',
    req: v({ mediaTypes: ['tv'], hardConstraints: { international: { originCountriesRequired: ['DE'], originalLanguagesRequired: ['de'], originalLanguageClass: 'non_english', audioRequirement: 'original_audio' } } }),
    want: { originalLanguages: ['de'], nonEnglishOriginal: true, englishAudioOnly: false, englishDubOnly: false },
  },
  {
    name: 'foreign shows, but not Korean',
    req: v({ mediaTypes: ['tv'], hardConstraints: { international: { originalLanguageClass: 'non_english', originalLanguagesExcluded: ['ko'] } } }),
    want: { nonEnglishOriginal: true, excludeOriginalLanguages: ['ko'] },
  },
  {
    name: '10 non-English-original shows on Netflix with English dubbing',
    req: v({ mediaTypes: ['tv'], requestedCount: 10, hardConstraints: { requiredProviders: ['Netflix'], international: { originalLanguageClass: 'non_english', audioRequirement: 'english_dub' } } }),
    want: { mediaType: 'tv', finalCount: 10, nonEnglishOriginal: true, englishDubOnly: true, providerNamesPending: ['Netflix'] },
  },
];

describe('adversarial international suite — every defining constraint survives canonical → FinderQuery', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const { query, pendingResolution } = canonicalToQuery(c.req);
      const w = c.want;
      if (w.mediaType !== undefined) expect(query.mediaType).toBe(w.mediaType);
      if (w.finalCount !== undefined) expect(query.finalCount ?? null).toBe(w.finalCount);
      if (w.nonEnglishOriginal !== undefined) expect(Boolean(query.nonEnglishOriginal)).toBe(w.nonEnglishOriginal);
      if (w.englishOriginalOnly !== undefined) expect(Boolean(query.englishOriginalOnly)).toBe(w.englishOriginalOnly);
      if (w.englishDubOnly !== undefined) expect(Boolean(query.englishDubOnly)).toBe(w.englishDubOnly);
      if (w.englishAudioOnly !== undefined) expect(Boolean(query.englishAudioOnly)).toBe(w.englishAudioOnly);
      if (w.originCountries !== undefined) expect(query.originCountries).toEqual(w.originCountries);
      if (w.originalLanguages !== undefined) expect(query.originalLanguages).toEqual(w.originalLanguages);
      if (w.excludeOriginalLanguages !== undefined) expect(query.excludeOriginalLanguages).toEqual(w.excludeOriginalLanguages);
      // Providers are resolved by the route through verified tools, never invented here.
      if (w.providerNamesPending !== undefined) expect(pendingResolution.requiredProviders).toEqual(w.providerNamesPending);
    });
  }
});
