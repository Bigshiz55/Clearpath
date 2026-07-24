import { describe, it, expect } from 'vitest';
import {
  accumulate,
  CONFIDENCE_K,
  confidencePct,
  decisiveness,
  emptyBelief,
  evidenceConfidence,
  resolveConfidence,
} from './confidence';

describe('confidence / belief math', () => {
  it('an empty belief is neutral with zero evidence and zero confidence', () => {
    const b = emptyBelief();
    expect(b.pref).toBe(50);
    expect(b.evidence).toBe(0);
    expect(resolveConfidence(b).confidence).toBe(0);
    expect(resolveConfidence(b).polarity).toBe(0);
  });

  it('the first observation moves pref to the target (seeded at 50 with zero evidence)', () => {
    const b = accumulate(emptyBelief(), 90, 1);
    expect(b.pref).toBeCloseTo(90, 5);
    expect(b.evidence).toBe(1);
  });

  it('NEVER overreacts to one answer — a single extreme tap stays "learning"', () => {
    const one = resolveConfidence(accumulate(emptyBelief(), 100, 1));
    expect(one.decisiveness).toBe(1); // maximally decisive direction…
    expect(one.confidence).toBeLessThan(0.15); // …but low confidence: not enough evidence
    expect(one.tier).toBe('learning');
  });

  it('requires REPEATED evidence to become confident', () => {
    let b = emptyBelief();
    for (let i = 0; i < 6; i++) b = accumulate(b, 90, 1);
    const c = resolveConfidence(b);
    expect(c.pref).toBeCloseTo(90, 5);
    expect(c.confidence).toBeGreaterThan(0.4);
    expect(c.tier === 'moderate' || c.tier === 'strong').toBe(true);
    expect(c.polarity).toBe(1);
  });

  it('conflicting evidence collapses confidence even with lots of it', () => {
    let b = emptyBelief();
    for (let i = 0; i < 5; i++) b = accumulate(b, 90, 1);
    for (let i = 0; i < 5; i++) b = accumulate(b, 10, 1);
    const c = resolveConfidence(b);
    expect(c.pref).toBeCloseTo(50, 0);
    expect(c.decisiveness).toBeLessThan(0.1);
    expect(c.confidence).toBeLessThan(0.1); // we have data but no clear lean
    expect(c.polarity).toBe(0);
  });

  it('evidenceConfidence saturates and is monotonic', () => {
    expect(evidenceConfidence(0)).toBe(0);
    expect(evidenceConfidence(CONFIDENCE_K)).toBeCloseTo(1 - Math.exp(-1), 5);
    expect(evidenceConfidence(100)).toBeGreaterThan(evidenceConfidence(10));
    expect(evidenceConfidence(1000)).toBeLessThanOrEqual(1);
  });

  it('decisiveness measures distance from neutral', () => {
    expect(decisiveness(50)).toBe(0);
    expect(decisiveness(100)).toBe(1);
    expect(decisiveness(0)).toBe(1);
    expect(decisiveness(75)).toBeCloseTo(0.5, 5);
  });

  it('negative-leaning beliefs report polarity -1', () => {
    let b = emptyBelief();
    for (let i = 0; i < 6; i++) b = accumulate(b, 5, 1);
    expect(resolveConfidence(b).polarity).toBe(-1);
  });

  it('confidencePct is a whole number 0..100', () => {
    let b = emptyBelief();
    for (let i = 0; i < 8; i++) b = accumulate(b, 95, 1.3);
    const pct = confidencePct(b);
    expect(Number.isInteger(pct)).toBe(true);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it('ignores non-positive weights and non-finite targets', () => {
    const b = accumulate(emptyBelief(), 90, 0);
    expect(b.evidence).toBe(0);
    const b2 = accumulate(emptyBelief(), Number.NaN, 1);
    expect(b2.evidence).toBe(0);
  });
});
