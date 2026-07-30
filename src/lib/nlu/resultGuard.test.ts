import { describe, it, expect } from 'vitest';
import { validateTitleResult } from './resultGuard';

const base = {
  requiredProvider: null, providerStrength: null as 'hard' | 'soft' | null,
  providerAvailability: 'unverified' as const,
};

describe('validateTitleResult — the anti-substitution guard', () => {
  it('BLOCKS Gone Girl as the answer to "Gone"', () => {
    const g = validateTitleResult({ ...base, requestedTitle: 'Gone', returnedTitle: 'Gone Girl' });
    expect(g.status).toBe('POSSIBLE_MATCH');
    expect(g.blockAsAnswer).toBe(true);
    expect(g.failedConstraint).toBe('title');
  });

  it('accepts an exact title with no provider requirement', () => {
    const g = validateTitleResult({ ...base, requestedTitle: 'Gone', returnedTitle: 'Gone', providerAvailability: 'verified' });
    expect(g.status).toBe('EXACT_MATCH');
    expect(g.blockAsAnswer).toBe(false);
  });

  it('exact title + hard provider VERIFIED → EXACT_MATCH', () => {
    const g = validateTitleResult({ requestedTitle: 'Gone', returnedTitle: 'Gone', requiredProvider: 'BritBox', providerStrength: 'hard', providerAvailability: 'verified' });
    expect(g.status).toBe('EXACT_MATCH');
  });

  it('exact title + hard provider UNVERIFIED → NOT_VERIFIED (no substitution, honest)', () => {
    const g = validateTitleResult({ requestedTitle: 'Gone', returnedTitle: 'Gone', requiredProvider: 'BritBox', providerStrength: 'hard', providerAvailability: 'unverified' });
    expect(g.status).toBe('NOT_VERIFIED');
    expect(g.message).toMatch(/could not verify/i);
  });

  it('exact title + hard provider CONFIRMED ABSENT → NOT_AVAILABLE_ON_SERVICE', () => {
    const g = validateTitleResult({ requestedTitle: 'Gone', returnedTitle: 'Gone', requiredProvider: 'BritBox', providerStrength: 'hard', providerAvailability: 'confirmed_absent' });
    expect(g.status).toBe('NOT_AVAILABLE_ON_SERVICE');
    expect(g.blockAsAnswer).toBe(true);
  });

  it('no returned title → NO_MATCH', () => {
    const g = validateTitleResult({ ...base, requestedTitle: 'Zzzxq', returnedTitle: null });
    expect(g.status).toBe('NO_MATCH');
    expect(g.blockAsAnswer).toBe(true);
  });

  it('media-type mismatch blocks (asked movie, got tv)', () => {
    const g = validateTitleResult({ ...base, requestedTitle: 'Fargo', returnedTitle: 'Fargo', requestedType: 'movie', returnedType: 'tv', providerAvailability: 'verified' });
    expect(g.status).toBe('POSSIBLE_MATCH');
    expect(g.failedConstraint).toBe('media_type');
  });
});
