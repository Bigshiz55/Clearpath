import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the options handed to supabase-js so we can assert the fetch wrapper.
const createClientMock = vi.fn((..._args: unknown[]) => ({}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));
// Env validates at runtime; stub it so the client can be constructed in tests.
vi.mock('@/lib/env', () => ({
  publicEnv: { supabaseUrl: () => 'https://example.supabase.co' },
  serverEnv: { serviceRoleKey: () => 'service-role-key' },
}));

import { createAdminClient } from './admin';

describe('createAdminClient — a service-role read is never served from a cache', () => {
  beforeEach(() => createClientMock.mockClear());

  it('constructs the client with the service-role key and no session persistence', () => {
    createAdminClient();
    expect(createClientMock).toHaveBeenCalledTimes(1);
    const [url, key, options] = createClientMock.mock.calls[0] as unknown as [string, string, Record<string, unknown>];
    expect(url).toBe('https://example.supabase.co');
    expect(key).toBe('service-role-key');
    expect((options.auth as { persistSession: boolean }).persistSession).toBe(false);
  });

  it('installs a global fetch that forces cache: no-store on every request', async () => {
    createAdminClient();
    const options = (createClientMock.mock.calls[0] as unknown as unknown[])[2] as { global: { fetch: typeof fetch } };
    const wrapped = options.global.fetch;
    expect(typeof wrapped).toBe('function');

    // The wrapper must delegate to the platform fetch with cache disabled — this
    // is the whole point: a stale Next.js Data Cache entry once made
    // /api/health/tv report a run row two days stale while the ingest gate saw
    // it live. Preserve the caller's other init fields untouched.
    const realFetch = vi.fn(async () => new Response('{}'));
    const globalRef = globalThis as unknown as { fetch: typeof fetch };
    const prev = globalRef.fetch;
    globalRef.fetch = realFetch as unknown as typeof fetch;
    try {
      await wrapped('https://example.supabase.co/rest/v1/tv_ingestion_runs', { method: 'GET' });
    } finally {
      globalRef.fetch = prev;
    }

    expect(realFetch).toHaveBeenCalledTimes(1);
    const passedInit = (realFetch.mock.calls[0] as unknown as unknown[])[1] as RequestInit;
    expect(passedInit.cache).toBe('no-store');
    expect(passedInit.method).toBe('GET');
  });
});
