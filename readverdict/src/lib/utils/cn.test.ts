import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins truthy class values', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy values from conditional expressions', () => {
    const active = false;
    const open = true;
    expect(cn('base', active && 'active', open && 'open', null, undefined)).toBe(
      'base open',
    );
  });

  it('collapses redundant whitespace', () => {
    expect(cn('  a  ', 'b   c')).toBe('a b c');
  });

  it('returns an empty string when nothing is truthy', () => {
    expect(cn(false, null, undefined, '')).toBe('');
  });
});
