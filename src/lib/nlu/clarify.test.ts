import { describe, it, expect } from 'vitest';
import { detectAmbiguities, firstClarification } from './clarify';

describe('confidence-aware clarification (§7)', () => {
  it('asks ONE concise question with 2-4 appendable answers for "foreign"', () => {
    const r = detectAmbiguities('a foreign mystery');
    expect(r.clarificationRequired).toBe(true);
    expect(r.confidence).toBeLessThan(1);
    expect(r.ambiguities).toHaveLength(1);
    const a = r.ambiguities[0]!;
    expect(a.key).toBe('origin');
    expect(a.options.length).toBeGreaterThanOrEqual(2);
    expect(a.options.length).toBeLessThanOrEqual(4);
  });

  it('each answer is APPENDABLE — re-submitting query+answer no longer clarifies (no loop)', () => {
    const base = 'a foreign mystery';
    for (const opt of firstClarification(base)!.options) {
      expect(detectAmbiguities(`${base} ${opt}`).clarificationRequired, opt).toBe(false);
    }
    const eraBase = 'an old movie';
    for (const opt of firstClarification(eraBase)!.options) {
      expect(detectAmbiguities(`${eraBase} ${opt}`).clarificationRequired, opt).toBe(false);
    }
  });

  it('does NOT ask when the query already disambiguates itself', () => {
    expect(detectAmbiguities('a foreign mystery in Korean').clarificationRequired).toBe(false);
    expect(detectAmbiguities('a non-English thriller').clarificationRequired).toBe(false);
    expect(detectAmbiguities('a foreign film with English dubbing').clarificationRequired).toBe(false);
    expect(detectAmbiguities('an old movie before 1970').clarificationRequired).toBe(false);
    expect(detectAmbiguities('a classic from the 80s').clarificationRequired).toBe(false);
  });

  it('state-aware: an ambiguity already resolved by conversation state is never re-asked', () => {
    // The merged state already pinned language/country → don't re-ask "foreign".
    expect(detectAmbiguities('foreign', ['origin']).clarificationRequired).toBe(false);
    // Year already bound → don't re-ask "old".
    expect(detectAmbiguities('old', ['era']).clarificationRequired).toBe(false);
    // But an unresolved key still asks.
    expect(detectAmbiguities('a foreign old movie', ['origin']).ambiguities.map((a) => a.key)).toEqual(['era']);
  });

  it('does NOT interview an unambiguous query', () => {
    expect(detectAmbiguities('a boxing movie before 1970 on Netflix').clarificationRequired).toBe(false);
    expect(detectAmbiguities('a recent Korean thriller').clarificationRequired).toBe(false);
    expect(firstClarification('a funny courtroom movie from the 90s')).toBeNull();
    expect(firstClarification('a well-tagged boxing movie')).toBeNull();
  });
});
