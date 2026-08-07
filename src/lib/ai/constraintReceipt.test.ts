import { describe, it, expect } from 'vitest';
import { buildConstraintReceipt } from './constraintReceipt';
import { validateCanonicalDiscoveryRequest } from './schemas';
import { canonicalToQuery } from './canonicalToQuery';

function receiptFor(partial: Record<string, unknown>) {
  const res = validateCanonicalDiscoveryRequest({ intent: 'discover', interpretationSummary: 't', ...partial });
  if (!res.ok) throw new Error(res.error);
  return buildConstraintReceipt(canonicalToQuery(res.value).query);
}

describe('buildConstraintReceipt — the user SEES what survived', () => {
  it('the reported query reads "Shows · Non-English original · English dub · 10 requested"', () => {
    const r = receiptFor({
      mediaTypes: ['tv'],
      requestedCount: 10,
      hardConstraints: { international: { originalLanguageClass: 'non_english', audioRequirement: 'english_dub' } },
    });
    expect(r.mediaType).toBe('tv');
    expect(r.originalLanguage).toBe('non_english');
    expect(r.audio).toBe('english_dub');
    expect(r.requestedCount).toBe(10);
    expect(r.lines).toEqual(['Shows', 'Non-English original', 'English dub', '10 requested']);
    // NOT the lossy "Shows · English audio".
    expect(r.lines).not.toContain('English audio');
  });

  it('a plain "in English" request reads english_audio, not english_dub', () => {
    const r = receiptFor({ mediaTypes: ['movie'], hardConstraints: { international: { audioRequirement: 'english_audio' } } });
    expect(r.audio).toBe('english_audio');
    expect(r.lines).toContain('English audio');
    expect(r.lines).not.toContain('English dub');
  });

  it('reflects country + excluded language + runtime', () => {
    const r = receiptFor({
      mediaTypes: ['tv'],
      hardConstraints: {
        runtimeMaxMinutes: 60,
        international: { originCountriesRequired: ['KR'], originalLanguageClass: 'non_english', originalLanguagesExcluded: ['ja'] },
      },
    });
    expect(r.originCountries).toEqual(['KR']);
    expect(r.excludedOriginalLanguages).toEqual(['ja']);
    expect(r.lines).toContain('KR');
    expect(r.lines).toContain('not ja');
    expect(r.lines).toContain('under 60 min');
  });
});
