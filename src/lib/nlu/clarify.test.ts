import { describe, it, expect } from 'vitest';
import { detectAmbiguities, firstClarification } from './clarify';

describe('confidence-aware clarification (§7)', () => {
  it('asks ONE concise question for a materially ambiguous "foreign" query', () => {
    const r = detectAmbiguities('a foreign mystery');
    expect(r.clarificationRequired).toBe(true);
    expect(r.confidence).toBeLessThan(1);
    expect(r.ambiguities).toHaveLength(1);
    expect(r.ambiguities[0]!.options.length).toBeGreaterThanOrEqual(2);
    expect(r.ambiguities[0]!.options.length).toBeLessThanOrEqual(4);
  });

  it('does NOT ask when the query already disambiguates itself (proceeds immediately)', () => {
    // "foreign … in Korean" resolves the language question.
    expect(detectAmbiguities('a foreign mystery in Korean').clarificationRequired).toBe(false);
    expect(detectAmbiguities('a non-English thriller').clarificationRequired).toBe(false);
    expect(detectAmbiguities('a foreign film with English dubbing').clarificationRequired).toBe(false);
    expect(detectAmbiguities('a foreign mystery in Korean').confidence).toBe(1);
  });

  it('resolves the "old movie" era ambiguity but not an anchored one', () => {
    expect(detectAmbiguities('an old movie').clarificationRequired).toBe(true);
    expect(detectAmbiguities('an old movie before 1970').clarificationRequired).toBe(false);
    expect(detectAmbiguities('a classic from the 80s').clarificationRequired).toBe(false);
  });

  it('does NOT interview an unambiguous query', () => {
    expect(detectAmbiguities('a boxing movie before 1970 on Netflix').clarificationRequired).toBe(false);
    expect(detectAmbiguities('a recent Korean thriller').clarificationRequired).toBe(false);
    expect(firstClarification('a funny courtroom movie from the 90s')).toBeNull();
  });

  it('firstClarification returns the single highest-value question or null', () => {
    expect(firstClarification('a foreign mystery')?.field).toContain('originalLanguageClass');
    expect(firstClarification('a well-tagged boxing movie')).toBeNull();
  });
});
