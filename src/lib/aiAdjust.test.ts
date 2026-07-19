import { describe, it, expect } from 'vitest';
import { parseAdjustment, MAX_ADJUSTMENT } from './aiAdjustParse';

describe('parseAdjustment', () => {
  it('parses a clean JSON object', () => {
    const r = parseAdjustment('{"adjustment": -6, "reasoning": "23 seasons of procedural vs. a limited-series profile."}');
    expect(r).not.toBeNull();
    expect(r!.adjustment).toBe(-6);
    expect(r!.reasoning).toContain('procedural');
  });

  it('tolerates markdown-fenced JSON (models return it even when told not to)', () => {
    const r = parseAdjustment('```json\n{"adjustment": 4, "reasoning": "A beloved niche the numbers underrate."}\n```');
    expect(r!.adjustment).toBe(4);
  });

  it('clamps beyond the ±15 cap', () => {
    expect(parseAdjustment('{"adjustment": 40, "reasoning": "x"}')!.adjustment).toBe(MAX_ADJUSTMENT);
    expect(parseAdjustment('{"adjustment": -99, "reasoning": "x"}')!.adjustment).toBe(-MAX_ADJUSTMENT);
  });

  it('rounds non-integers and pulls JSON out of surrounding prose', () => {
    const r = parseAdjustment('Sure! Here you go: {"adjustment": 2.7, "reasoning": "ok"} hope that helps');
    expect(r!.adjustment).toBe(3);
  });

  it('returns null on garbage or a missing adjustment', () => {
    expect(parseAdjustment('not json at all')).toBeNull();
    expect(parseAdjustment('{"reasoning": "no number"}')).toBeNull();
    expect(parseAdjustment('')).toBeNull();
  });
});
