import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportReliabilityEvent } from '@/lib/monitoringClient';

/**
 * RELIABILITY SPRINT — item 9. The client beacon must prefer
 * `navigator.sendBeacon` (survives page unload, which a normal fetch would
 * not) and fall back to a keepalive fetch when it's unavailable — and must
 * never throw back into the caller, since every call site is fire-and-forget
 * inside a failure path that's already handling its own error.
 */

describe('reportReliabilityEvent', () => {
  const originalNavigator = global.navigator;
  const originalFetch = global.fetch;

  afterEach(() => {
    Object.defineProperty(global, 'navigator', { value: originalNavigator, configurable: true });
    global.fetch = originalFetch;
  });

  it('uses sendBeacon when available', () => {
    const sendBeacon = vi.fn((_url: string, _data?: BodyInit | null) => true);
    Object.defineProperty(global, 'navigator', { value: { sendBeacon }, configurable: true });
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve({ ok: true } as Response));
    global.fetch = fetchSpy as unknown as typeof fetch;

    reportReliabilityEvent('not_found', { path: '/x' });

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0]![0]).toBe('/api/monitor');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to a keepalive fetch when sendBeacon is unavailable', () => {
    Object.defineProperty(global, 'navigator', { value: {}, configurable: true });
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve({ ok: true } as Response));
    global.fetch = fetchSpy as unknown as typeof fetch;

    reportReliabilityEvent('js_error', { name: 'TypeError' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/monitor');
    expect(init!.method).toBe('POST');
    expect(init!.keepalive).toBe(true);
    expect(JSON.parse(init!.body as string)).toEqual({ name: 'js_error', props: { name: 'TypeError' } });
  });

  it('never throws when navigator/fetch are unavailable', () => {
    Object.defineProperty(global, 'navigator', { value: undefined, configurable: true });
    global.fetch = undefined as unknown as typeof fetch;
    expect(() => reportReliabilityEvent('quiz_load_failure', {})).not.toThrow();
  });
});
