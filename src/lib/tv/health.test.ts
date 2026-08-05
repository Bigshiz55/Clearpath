import { describe, it, expect } from 'vitest';
import { tvHealthVerdict, coverageIsStale } from './health';

/**
 * The staleness rules behind BOTH surfaces — the operator health endpoint
 * (/api/health/tv) and the customer-facing stale-data notice on pack pages.
 * Pure functions; these tests pin the thresholds so a refactor cannot
 * silently redefine "healthy".
 */

const NOW = Date.parse('2026-08-05T12:00:00Z');
const iso = (offsetHours: number) => new Date(NOW + offsetHours * 3_600_000).toISOString();

const healthyInput = {
  nowMs: NOW,
  tvmazeLastSuccessAt: iso(-6),
  tvMediaConfigured: true,
  tvMediaLastSuccessAt: iso(-3),
  coverageEndUtc: iso(72),
  totalFutureAirings: 2500,
};

describe('tvHealthVerdict', () => {
  it('fresh successes on both providers with future coverage -> healthy, no notes', () => {
    const { verdict, notes } = tvHealthVerdict(healthyInput);
    expect(verdict).toBe('healthy');
    expect(notes).toEqual([]);
  });

  it('TV Media silent for >26h -> stale, and the note names the provider', () => {
    const { verdict, notes } = tvHealthVerdict({ ...healthyInput, tvMediaLastSuccessAt: iso(-30) });
    expect(verdict).toBe('stale');
    expect(notes.join(' ')).toContain('TV Media');
  });

  it('TV Media unconfigured -> degraded (Hallmark depends on it), never silently healthy', () => {
    const { verdict, notes } = tvHealthVerdict({
      ...healthyInput, tvMediaConfigured: false, tvMediaLastSuccessAt: null,
    });
    expect(verdict).toBe('degraded');
    expect(notes.join(' ')).toContain('not configured');
  });

  it('TVmaze silent for >2 days -> degraded', () => {
    expect(tvHealthVerdict({ ...healthyInput, tvmazeLastSuccessAt: iso(-49) }).verdict).toBe('degraded');
  });

  it('coverage ending within 24h -> stale', () => {
    expect(tvHealthVerdict({ ...healthyInput, coverageEndUtc: iso(12) }).verdict).toBe('stale');
  });

  it('zero future airings -> degraded regardless of run timestamps', () => {
    expect(tvHealthVerdict({ ...healthyInput, totalFutureAirings: 0 }).verdict).toBe('degraded');
  });

  it('degraded outranks stale when both apply', () => {
    const { verdict } = tvHealthVerdict({
      ...healthyInput, tvMediaLastSuccessAt: iso(-30), totalFutureAirings: 0,
    });
    expect(verdict).toBe('degraded');
  });
});

describe('coverageIsStale (the pack-page notice trigger)', () => {
  it('no coverage recorded at all IS stale — absence is not freshness', () => {
    expect(coverageIsStale(null, NOW)).toBe(true);
  });

  it('coverage ending within 24h is stale; beyond that is not', () => {
    expect(coverageIsStale(iso(12), NOW)).toBe(true);
    expect(coverageIsStale(iso(36), NOW)).toBe(false);
  });
});
