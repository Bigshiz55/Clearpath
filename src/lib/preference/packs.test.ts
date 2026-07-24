import { describe, it, expect } from 'vitest';
import { PACKS, packByKey, packSource } from './packs';

describe('calibration packs (pure)', () => {
  it('covers the required categories', () => {
    const keys = PACKS.map((p) => p.key);
    for (const k of ['crime', 'comedy', 'reality', 'anime', 'documentary', 'hallmark', 'family', 'international', 'action', 'classic']) {
      expect(keys).toContain(k);
    }
  });

  it('every pack is 5–10 titles and has a query', () => {
    for (const p of PACKS) {
      expect(p.size).toBeGreaterThanOrEqual(5);
      expect(p.size).toBeLessThanOrEqual(10);
      expect(p.query.genreIds.length).toBeGreaterThan(0);
    }
  });

  it('pack keys are unique', () => {
    expect(new Set(PACKS.map((p) => p.key)).size).toBe(PACKS.length);
  });

  it('packSource tags answers so they never count as onboarding calibration', () => {
    expect(packSource('crime')).toBe('pack:crime');
    expect(packSource('crime')).not.toBe('calibration');
  });

  it('packByKey resolves and rejects unknown keys', () => {
    expect(packByKey('anime')?.name).toBe('Anime');
    expect(packByKey('nope')).toBeNull();
  });
});
