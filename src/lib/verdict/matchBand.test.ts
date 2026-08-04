import { describe, it, expect } from 'vitest';
import { matchBand } from './matchBand';

describe('matchBand', () => {
  it('maps evidence levels to the plain-language bands', () => {
    expect(matchBand('high')).toBe('Strong match');
    expect(matchBand('medium')).toBe('Good match');
    expect(matchBand('low')).toBe('Uncertain match');
  });

  it('calls it an early profile rather than fabricating one when there is no signal', () => {
    expect(matchBand(null)).toBe('Early profile');
    expect(matchBand(undefined)).toBe('Early profile');
  });
});
