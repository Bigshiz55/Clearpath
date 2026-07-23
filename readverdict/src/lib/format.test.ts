import { describe, it, expect } from 'vitest';
import {
  readingMinutes,
  readingTimeLabel,
  lengthBand,
  eraBand,
} from './format';

describe('reading time', () => {
  it('returns null for unknown or zero page counts', () => {
    expect(readingMinutes(null)).toBeNull();
    expect(readingMinutes(0)).toBeNull();
    expect(readingTimeLabel(null)).toBeNull();
  });

  it('estimates minutes from pages', () => {
    // 279 pages × 275 wpp / 250 wpm ≈ 307 min
    expect(readingMinutes(279)).toBe(307);
  });

  it('formats hours and minutes', () => {
    expect(readingTimeLabel(279)).toBe('≈ 5h 7m');
    expect(readingTimeLabel(40)).toMatch(/^≈ \d+m$/);
  });
});

describe('bands', () => {
  it('classifies length bands', () => {
    expect(lengthBand(120)).toBe('short');
    expect(lengthBand(300)).toBe('standard');
    expect(lengthBand(600)).toBe('long');
    expect(lengthBand(900)).toBe('epic');
    expect(lengthBand(null)).toBe('unknown');
  });

  it('classifies era relative to a reference year', () => {
    expect(eraBand(2024, 2026)).toBe('contemporary');
    expect(eraBand(2000, 2026)).toBe('modern');
    expect(eraBand(1950, 2026)).toBe('classic');
    expect(eraBand(1600, 2026)).toBe('antiquarian');
    expect(eraBand(null, 2026)).toBe('unknown');
  });
});
