import { describe, it, expect } from 'vitest';
import { timeAgo } from './timeAgo';

const NOW = Date.parse('2026-08-04T12:00:00Z');

describe('timeAgo', () => {
  it('is null for missing or invalid input, never a fake timestamp', () => {
    expect(timeAgo(null)).toBeNull();
    expect(timeAgo(undefined)).toBeNull();
    expect(timeAgo('not a date')).toBeNull();
  });

  it('says "just now" under a minute', () => {
    expect(timeAgo(new Date(NOW - 10_000).toISOString(), NOW)).toBe('just now');
  });

  it('buckets minutes, hours, days and months correctly', () => {
    expect(timeAgo(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe('5m ago');
    expect(timeAgo(new Date(NOW - 3 * 3_600_000).toISOString(), NOW)).toBe('3h ago');
    expect(timeAgo(new Date(NOW - 2 * 86_400_000).toISOString(), NOW)).toBe('2d ago');
    expect(timeAgo(new Date(NOW - 40 * 86_400_000).toISOString(), NOW)).toBe('1mo ago');
  });

  it('never returns a negative age for a clock-skewed future timestamp', () => {
    expect(timeAgo(new Date(NOW + 60_000).toISOString(), NOW)).toBe('just now');
  });
});
