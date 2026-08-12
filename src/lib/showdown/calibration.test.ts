import { describe, it, expect } from 'vitest';
import {
  MAX_CALIBRATION_WEIGHT,
  MIN_CONTESTED,
  calibrationEvidence,
  calibrationResolution,
  calibrationWeight,
  contestedAxes,
  selectCalibration,
  targetForValue,
  type AxisObservation,
} from './calibration';

/**
 * THE QUESTION MUST BE EARNED.
 *
 * "Do not turn the game into sliders" is the constraint that shapes every test
 * here. A 1–10 question is only worth asking when the pairwise comparisons have
 * genuinely failed — when the player pushed the same axis both ways — and it
 * must be silent otherwise, however many rounds have gone by.
 */

const obs = (key: string, target: number, weight = 1): AxisObservation =>
  ({ key, target, weight }) as AxisObservation;

describe('it fires on contradiction, not on a counter', () => {
  it('asks about the axis the player argued with themselves about', () => {
    const q = selectCalibration([
      obs('horrorTolerance', 90, 1.6),
      obs('horrorTolerance', 15, 1.6),
      obs('comedy', 80, 1),
    ]);
    expect(q?.key).toBe('horrorTolerance');
    expect(q?.prompt).toContain('mixed signals on horror');
    expect(q?.label).toBe('Appetite for fear');
  });

  it('STAYS SILENT for a player who has been consistent', () => {
    /* The whole difference between a game and a form. Twenty consistent
       answers is not a reason to interrupt — there is nothing to ask. */
    const consistent = Array.from({ length: 20 }, () => obs('horrorTolerance', 92, 2));
    expect(selectCalibration(consistent)).toBeNull();
  });

  it('a strong one-way pull is understood, not contested', () => {
    expect(contestedAxes([obs('romance', 95, 5), obs('romance', 88, 5)])).toEqual([]);
  });

  it('ignores shrugs — two weak opposite nudges are not a split', () => {
    const q = selectCalibration([obs('romance', 53, 0.2), obs('romance', 47, 0.2)]);
    expect(q).toBeNull();
  });

  it('ignores an observation that states nothing at all', () => {
    expect(contestedAxes([obs('comedy', 50, 9), obs('comedy', 50, 9)])).toEqual([]);
  });

  it('holds its fire below the interruption floor', () => {
    /* Small genuine wobbles exist and are not worth a question. */
    const weak = [obs('scifi', 70, 0.5), obs('scifi', 30, 0.5)];
    expect(contestedAxes(weak)[0]!.contested).toBeLessThan(MIN_CONTESTED);
    expect(selectCalibration(weak)).toBeNull();
  });

  it('picks the WORST contradiction when several qualify', () => {
    const q = selectCalibration([
      obs('comedy', 90, 1.5), obs('comedy', 10, 1.5),
      obs('darkness', 95, 4), obs('darkness', 5, 4),
    ]);
    expect(q?.key).toBe('darkness');
  });

  it('never asks the same axis twice in one run', () => {
    const split = [obs('horrorTolerance', 95, 3), obs('horrorTolerance', 5, 3)];
    expect(selectCalibration(split)?.key).toBe('horrorTolerance');
    expect(selectCalibration(split, { asked: ['horrorTolerance'] })).toBeNull();
  });
});

describe('the answer maps onto the axis honestly', () => {
  it('1 is the floor, 10 is the ceiling, 5–6 is the middle', () => {
    expect(targetForValue(1)).toBe(0);
    expect(targetForValue(10)).toBe(100);
    expect(targetForValue(5)).toBeCloseTo(44.4, 1);
    expect(targetForValue(6)).toBeCloseTo(55.6, 1);
  });

  it('clamps rather than trusting the caller', () => {
    expect(targetForValue(0)).toBe(0);
    expect(targetForValue(99)).toBe(100);
  });
});

describe('a stated answer is worth what it settles — and no more', () => {
  it('resolving a deep split counts for more than a shallow one', () => {
    const deep = { contested: 2.0 };
    const shallow = { contested: 1.0 };
    expect(calibrationWeight(deep)).toBeGreaterThan(calibrationWeight(shallow));
  });

  it('IS CAPPED, so it can never outrank a profile built from real viewing', () => {
    /* `traits.ts`: "a calibration answer must never outrank a title you
       actually watched." This is also the A9 guard — a 12-question session must
       not be able to redefine somebody through this door. */
    expect(calibrationWeight({ contested: 500 })).toBe(MAX_CALIBRATION_WEIGHT);
  });

  it('always counts for something', () => {
    expect(calibrationWeight({ contested: 0 })).toBeGreaterThan(0);
  });

  it('produces exactly one piece of evidence, on the axis asked about', () => {
    const q = selectCalibration([obs('darkness', 95, 3), obs('darkness', 5, 3)])!;
    const ev = calibrationEvidence(q, 9);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.key).toBe('darkness');
    expect(ev[0]!.target).toBeGreaterThan(80);
    expect(ev[0]!.weight).toBeLessThanOrEqual(MAX_CALIBRATION_WEIGHT);
  });

  it('a low answer moves the axis DOWN, not merely less up', () => {
    const q = selectCalibration([obs('romance', 95, 3), obs('romance', 5, 3)])!;
    expect(calibrationEvidence(q, 2)[0]!.target).toBeLessThan(50);
  });
});

describe('the player is told what their answer did', () => {
  it('names the count of decisions it reconciled', () => {
    const q = selectCalibration([
      obs('horrorTolerance', 95, 2), obs('horrorTolerance', 10, 2), obs('horrorTolerance', 80, 2),
    ])!;
    expect(calibrationResolution(q, 9)).toContain('3 split decisions');
  });

  it('reads differently at the ends than in the middle', () => {
    const q = selectCalibration([obs('comedy', 95, 3), obs('comedy', 5, 3)])!;
    const low = calibrationResolution(q, 1);
    const mid = calibrationResolution(q, 5);
    const high = calibrationResolution(q, 10);
    expect(new Set([low, mid, high]).size).toBe(3);
    expect(low).not.toBe(high);
  });

  it('uses singular for a single decision', () => {
    const q = selectCalibration([obs('scifi', 99, 3), obs('scifi', 1, 3)])!;
    const single = { ...q, splitCount: 1 };
    expect(calibrationResolution(single, 7)).toContain('1 split decision');
    expect(calibrationResolution(single, 7)).not.toContain('decisions');
  });
});
