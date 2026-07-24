import { describe, it, expect } from 'vitest';
import {
  buildCalibrationPlan,
  calibrationInvariants,
  calibrationProgress,
  CALIBRATION_SIZE,
  CAPS,
  MINS,
  type CalCandidate,
  type CalGenre,
} from './calibration';

/** Deterministic PRNG so any failure is reproducible from its seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;

let uid = 0;
function cand(over: Partial<CalCandidate>): CalCandidate {
  return { key: `t${uid++}`, mediaType: 'movie', genres: ['drama'], year: 2015, country: 'US', ...over };
}

/** A BROAD pool: every category present in ample supply, random media/era/origin. */
function broadPool(rng: () => number): CalCandidate[] {
  const p: CalCandidate[] = [];
  const push = (n: number, base: Partial<CalCandidate>) => {
    for (let i = 0; i < n; i++) {
      const mediaType = rng() < 0.5 ? 'movie' : 'tv';
      const year = rng() < 0.35 ? 1980 + Math.floor(rng() * 20) : 2008 + Math.floor(rng() * 16);
      const country = rng() < 0.25 ? pick(rng, ['JP', 'FR', 'KR', 'GB', 'ES']) : 'US';
      p.push(cand({ ...base, mediaType, year, country }));
    }
  };
  const g = (n: number, genre: CalGenre, extra: Partial<CalCandidate> = {}) => push(n, { genres: [genre], ...extra });
  g(8, 'drama'); g(8, 'comedy'); g(6, 'crime'); g(4, 'thriller'); g(5, 'action');
  g(5, 'mystery'); g(5, 'romance'); g(5, 'scifi'); g(5, 'fantasy'); g(5, 'horror');
  push(5, { genres: ['documentary'] });
  push(5, { genres: ['reality'] });          // reality
  push(4, { genres: ['soap'], mediaType: 'tv' });
  push(5, { genres: ['family'], family: true });
  push(4, { genres: ['animation'] });        // non-anime animation
  push(3, { genres: ['animation'], anime: true, country: 'JP' }); // anime supply (cap should hold at 1)
  push(4, { genres: ['romance'], hallmark: true });
  push(5, { genres: ['drama'], prestige: true });
  push(5, { genres: ['drama'], polarizing: true });
  // Guarantee plenty of both formats, intl, and old titles regardless of the above randomness.
  for (let i = 0; i < 12; i++) push(1, { genres: [pick(rng, ['drama', 'comedy', 'action'] as CalGenre[])], mediaType: i % 2 ? 'tv' : 'movie' });
  for (let i = 0; i < 6; i++) p.push(cand({ genres: ['drama'], country: 'IT', year: 2015 }));
  for (let i = 0; i < 6; i++) p.push(cand({ genres: ['comedy'], year: 1985 + i }));
  // Shuffle.
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j]!, p[i]!]; }
  return p;
}

/** A production-like ANIME-FLOODED pool — mostly anime + a few others. */
function floodedPool(rng: () => number): CalCandidate[] {
  const p: CalCandidate[] = [];
  for (let i = 0; i < 90; i++) p.push(cand({ genres: ['animation'], anime: true, mediaType: 'tv', country: 'JP', year: 2016 + (i % 8) }));
  for (let i = 0; i < 10; i++) p.push(cand({ genres: [pick(rng, ['drama', 'comedy', 'action', 'crime'] as CalGenre[])], mediaType: rng() < 0.5 ? 'movie' : 'tv' }));
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j]!, p[i]!]; }
  return p;
}

describe('Watch-DNA calibration: finite, forced-diversity, capped', () => {
  it('runs 1,000 broad sessions — always finite, balanced, capped, no shortfalls', () => {
    for (let s = 0; s < 1000; s++) {
      const rng = mulberry32(1000 + s);
      const plan = buildCalibrationPlan(broadPool(rng));
      const errs = calibrationInvariants(plan, /* broad */ true);
      expect(errs, `seed ${s}`).toEqual([]);
      const r = plan.report;
      // The exact spec caps + mins, proven on every single session.
      expect(plan.items.length).toBe(CALIBRATION_SIZE);
      expect(r.anime).toBeLessThanOrEqual(CAPS.anime);
      expect(r.animation).toBeLessThanOrEqual(CAPS.animation);
      expect(Math.max(...Object.values(r.perGenre))).toBeLessThanOrEqual(CAPS.perGenre);
      expect(r.movies).toBeGreaterThanOrEqual(MINS.movies);
      expect(r.tv).toBeGreaterThanOrEqual(MINS.tv);
      expect(r.international).toBeGreaterThanOrEqual(MINS.international);
      expect(r.old).toBeGreaterThanOrEqual(MINS.old);
      expect(r.reality).toBeGreaterThanOrEqual(1);
      expect(r.documentary).toBeGreaterThanOrEqual(1);
      expect(r.soap).toBeGreaterThanOrEqual(1);
      expect(r.hallmark).toBeGreaterThanOrEqual(1);
      expect(r.family).toBeGreaterThanOrEqual(1);
      expect(r.prestige).toBeGreaterThanOrEqual(1);
      expect(r.polarizing).toBeGreaterThanOrEqual(1);
    }
  });

  it('NEVER serves more than one anime, even from a 90%-anime pool (the prod bug)', () => {
    for (let s = 0; s < 500; s++) {
      const rng = mulberry32(50000 + s);
      const plan = buildCalibrationPlan(floodedPool(rng));
      expect(plan.report.anime, `seed ${s}`).toBeLessThanOrEqual(1);
      expect(plan.items.length).toBeLessThanOrEqual(CALIBRATION_SIZE);
      expect(new Set(plan.items.map((i) => i.key)).size).toBe(plan.items.length); // no dups
      // No genre may dominate even here.
      expect(Math.max(0, ...Object.values(plan.report.perGenre))).toBeLessThanOrEqual(CAPS.perGenre);
    }
  });

  it('no genre exceeds 3 and there are no duplicates across random mixed pools', () => {
    for (let s = 0; s < 500; s++) {
      const rng = mulberry32(9000 + s);
      // Random blend of broad + flooded.
      const pool = rng() < 0.5 ? broadPool(rng) : [...broadPool(rng), ...floodedPool(rng)];
      const plan = buildCalibrationPlan(pool);
      expect(calibrationInvariants(plan, false)).toEqual([]);
    }
  });

  it('progress model is finite with an early-complete milestone and ETA', () => {
    expect(calibrationProgress(0).index).toBe(1);
    expect(calibrationProgress(0).percent).toBe(0);
    expect(calibrationProgress(10).reachedEarly).toBe(true);
    expect(calibrationProgress(10).complete).toBe(false);
    expect(calibrationProgress(20).complete).toBe(true);
    expect(calibrationProgress(20).percent).toBe(100);
    expect(calibrationProgress(25).index).toBe(CALIBRATION_SIZE); // never past the cap
    expect(calibrationProgress(5).secondsRemaining).toBeGreaterThan(0);
  });
});
