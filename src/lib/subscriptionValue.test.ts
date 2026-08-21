/**
 * THE SUBSCRIPTION CHECK'S FIRST TESTS. The audit found this module making
 * per-service worth/cancel claims (rendered with real dollar figures) with
 * zero test coverage. The verdict function is pure; its boundaries are the
 * product's honesty lines and they are now pinned.
 */
import { describe, it, expect } from 'vitest';
import { verdictFor } from './subscriptionValue';

describe('verdictFor — the worth/cancel call per service', () => {
  it('an unknown price never produces a money claim', () => {
    expect(verdictFor(null, 10)).toBe('unknown');
    expect(verdictFor(null, 0)).toBe('unknown');
  });

  it('a free service is free, whatever the usage', () => {
    expect(verdictFor(0, 0)).toBe('free');
    expect(verdictFor(0, 12)).toBe('free');
  });

  it('paying for zero recent watches is the cancel candidate', () => {
    expect(verdictFor(15.49, 0)).toBe('cancel');
  });

  it('one or two watches is underused, three is worth it', () => {
    expect(verdictFor(9.99, 1)).toBe('underused');
    expect(verdictFor(9.99, 2)).toBe('underused');
    expect(verdictFor(9.99, 3)).toBe('worth');
  });
});
