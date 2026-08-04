import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout } from './fetchWithTimeout';

describe('fetchWithTimeout — a stalled request rejects instead of hanging forever', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('rejects once the timeout elapses, for a fetch that never resolves on its own', async () => {
    global.fetch = vi.fn((_url: unknown, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as unknown as typeof fetch;

    const promise = fetchWithTimeout('/api/thing', {}, 5000);
    const assertion = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('resolves normally when the underlying fetch settles well within the timeout', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response)) as unknown as typeof fetch;
    const res = await fetchWithTimeout('/api/thing');
    expect(res.ok).toBe(true);
  });

  it('passes through the caller\'s own init fields alongside the abort signal', async () => {
    const fetchSpy = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve({ ok: true } as Response));
    global.fetch = fetchSpy as unknown as typeof fetch;
    await fetchWithTimeout('/api/thing', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('defaults to an 8-second bound when none is given', async () => {
    global.fetch = vi.fn((_url: unknown, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as unknown as typeof fetch;
    let settled = false;
    const promise = fetchWithTimeout('/api/thing').catch(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(7999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await promise;
    expect(settled).toBe(true);
  });
});
