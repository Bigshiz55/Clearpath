import { describe, it, expect, vi, beforeEach } from 'vitest';

const { reportSpy } = vi.hoisted(() => ({ reportSpy: vi.fn() }));
vi.mock('@/lib/monitoringClient', () => ({ reportReliabilityEvent: reportSpy }));

import { markHomepageArrival, reportFirstVerdictShown } from '@/lib/verdictTiming';

/**
 * RELIABILITY SPRINT — item 9's time-to-first-Verdict metric. Both halves
 * must be idempotent within a tab (a homepage revisit or a second Verdict
 * must not re-stamp or re-report) and reportFirstVerdictShown must not
 * fabricate a duration when there was never an arrival stamp to measure
 * from.
 */

function fakeSessionStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage;
}

beforeEach(() => {
  reportSpy.mockClear();
  Object.defineProperty(global, 'sessionStorage', { value: fakeSessionStorage(), configurable: true });
});

describe('markHomepageArrival', () => {
  it('stamps the current time once', () => {
    markHomepageArrival();
    const stamped = sessionStorage.getItem('wv.homeArrivalTs');
    expect(stamped).not.toBeNull();
  });

  it('does not overwrite an existing stamp on a repeat visit', () => {
    sessionStorage.setItem('wv.homeArrivalTs', '12345');
    markHomepageArrival();
    expect(sessionStorage.getItem('wv.homeArrivalTs')).toBe('12345');
  });
});

describe('reportFirstVerdictShown', () => {
  it('reports the elapsed ms since arrival', () => {
    const arrivedAt = Date.now() - 5000;
    sessionStorage.setItem('wv.homeArrivalTs', String(arrivedAt));
    reportFirstVerdictShown();
    expect(reportSpy).toHaveBeenCalledTimes(1);
    const [name, props] = reportSpy.mock.calls[0]!;
    expect(name).toBe('verdict_time_to_first');
    expect(props.ms).toBeGreaterThanOrEqual(4900);
  });

  it('reports nothing when there is no arrival stamp to measure from', () => {
    reportFirstVerdictShown();
    expect(reportSpy).not.toHaveBeenCalled();
  });

  it('reports only once per session even if called again', () => {
    sessionStorage.setItem('wv.homeArrivalTs', String(Date.now() - 1000));
    reportFirstVerdictShown();
    reportFirstVerdictShown();
    expect(reportSpy).toHaveBeenCalledTimes(1);
  });
});
