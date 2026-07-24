import { describe, it, expect } from 'vitest';
import { CALIBRATION_BUCKETS, taggedFromBucket, type FetchedTitle } from './calibrationPool';
import { buildCalibrationPlan, calibrationInvariants, CALIBRATION_SIZE, CAPS } from './calibration';

/** Simulate each bucket returning `take` real titles, tagged by construction. */
function simulatePool(idBase = 1000) {
  let id = idBase;
  const pool = [];
  for (const b of CALIBRATION_BUCKETS) {
    for (let i = 0; i < b.take; i++) {
      const t: FetchedTitle = {
        id: id++,
        mediaType: b.mediaType,
        title: `${b.id}-${i}`,
        year: b.minYear ? b.minYear + 1 : 2020,
        posterPath: '/p.jpg',
      };
      pool.push(taggedFromBucket(t, b));
    }
  }
  return pool;
}

describe('calibration pool sourcing plan (pure)', () => {
  it('the fixed buckets guarantee every rare-but-required category has a source', () => {
    const has = (pred: (b: (typeof CALIBRATION_BUCKETS)[number]) => boolean) => CALIBRATION_BUCKETS.some(pred);
    expect(has((b) => b.genres.includes('reality'))).toBe(true);
    expect(has((b) => b.genres.includes('documentary'))).toBe(true);
    expect(has((b) => b.genres.includes('soap'))).toBe(true);
    expect(has((b) => !!b.anime)).toBe(true);
    expect(has((b) => !!b.hallmark)).toBe(true);
    expect(has((b) => !!b.originalLanguage && b.originalLanguage !== 'en')).toBe(true); // international
    expect(has((b) => !!b.minYear && b.minYear < 2005)).toBe(true); // classics
    expect(has((b) => b.mediaType === 'movie')).toBe(true);
    expect(has((b) => b.mediaType === 'tv')).toBe(true);
  });

  it('tags international titles with a non-domestic country', () => {
    const intlBucket = CALIBRATION_BUCKETS.find((b) => b.id === 'kdrama-tv')!;
    const c = taggedFromBucket({ id: 1, mediaType: 'tv', title: 'x', year: 2020, posterPath: null }, intlBucket, 'US');
    expect(c.country).toBe('KR');
    expect(c.country).not.toBe('US');
  });

  it('anime bucket titles are flagged anime (so the ≤1 cap applies)', () => {
    const anime = CALIBRATION_BUCKETS.find((b) => b.anime)!;
    const c = taggedFromBucket({ id: 1, mediaType: 'tv', title: 'x', year: 2020, posterPath: null }, anime);
    expect(c.anime).toBe(true);
  });

  it('a full pool from the buckets plans a valid, diverse 20 (caps respected, key mins met)', () => {
    const pool = simulatePool();
    expect(pool.length).toBeGreaterThanOrEqual(CALIBRATION_SIZE);
    const plan = buildCalibrationPlan(pool, { domestic: 'US' });
    // Exactly 20, no duplicates, no cap violations.
    expect(calibrationInvariants(plan, false)).toEqual([]);
    expect(plan.items.length).toBe(CALIBRATION_SIZE);
    // Hard requirements from the spec.
    expect(plan.report.anime).toBeLessThanOrEqual(CAPS.anime);
    expect(plan.report.international).toBeGreaterThanOrEqual(2);
    expect(plan.report.reality).toBeGreaterThanOrEqual(1);
    expect(plan.report.documentary).toBeGreaterThanOrEqual(1);
    expect(plan.report.old).toBeGreaterThanOrEqual(3);
    expect(plan.report.movies).toBeGreaterThanOrEqual(8);
    expect(plan.report.tv).toBeGreaterThanOrEqual(8);
    // No single genre dominates.
    for (const n of Object.values(plan.report.perGenre)) expect(n).toBeLessThanOrEqual(CAPS.perGenre);
  });

  it('no duplicate keys survive planning even if buckets overlap', () => {
    const pool = simulatePool();
    // inject a duplicate key
    pool.push({ ...pool[0]! });
    const plan = buildCalibrationPlan(pool, { domestic: 'US' });
    expect(new Set(plan.items.map((i) => i.key)).size).toBe(plan.items.length);
  });
});
