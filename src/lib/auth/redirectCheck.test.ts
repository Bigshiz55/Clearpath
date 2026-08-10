import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { checkAuthRedirect, resetRedirectCheckCache } from './redirectCheck';

/**
 * The preflight exists because of one real failure: a person asked for a
 * sign-in link on a deployed preview and the email dropped them on
 * `http://localhost:3000`. Supabase does not refuse a redirect it does not
 * recognise — it silently substitutes the project's Site URL — so the app has
 * no way to know the link is dead except to ask first.
 *
 * The behaviour that matters here is the ASYMMETRY: only a definite Location
 * pointing somewhere else may block a login. Everything else — a timeout, a
 * network error, no Location at all — has to pass, because a diagnostic that
 * can lock people out is worse than the bug it was written for.
 */

const ORIGIN = 'https://clearpath-11owpo22t-bigshiz56.vercel.app';

type FetchStub = (...args: unknown[]) => Promise<Response> | Response;

function mockFetch(impl: FetchStub) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

beforeEach(() => {
  resetRedirectCheckCache();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://vajgviraxigkwlvysxfz.supabase.co');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the magic-link preflight', () => {
  it('passes when Supabase echoes our own origin back', async () => {
    mockFetch(() => redirectTo(`${ORIGIN}/auth/callback#error=access_denied&error_code=otp_expired`));
    await expect(checkAuthRedirect(ORIGIN)).resolves.toEqual({ ok: true });
  });

  it('blocks — and names the destination — when the link would land elsewhere', async () => {
    mockFetch(() => redirectTo('http://localhost:3000#error=access_denied'));
    const result = await checkAuthRedirect(ORIGIN);
    expect(result.ok).toBe(false);
    expect(result.landsOn).toBe('http://localhost:3000');
  });

  it('reports the ORIGIN it would strand you on, not the whole error URL', async () => {
    mockFetch(() => redirectTo('https://clearpath-pearl-chi.vercel.app#error=access_denied&sb='));
    const result = await checkAuthRedirect(ORIGIN);
    expect(result.landsOn).toBe('https://clearpath-pearl-chi.vercel.app');
  });

  it('asks about the callback on the origin it was given', async () => {
    const spy = vi.fn<FetchStub>(() => redirectTo(`${ORIGIN}/auth/callback`));
    mockFetch(spy);
    await checkAuthRedirect(ORIGIN);
    const url = String(spy.mock.calls[0]?.[0] ?? '');
    expect(url).toContain('/auth/v1/verify');
    expect(url).toContain(encodeURIComponent(`${ORIGIN}/auth/callback`));
  });

  // ── Fail-open. Each of these would otherwise lock a real person out. ──────
  it('passes when the probe throws', async () => {
    mockFetch(() => {
      throw new Error('network down');
    });
    await expect(checkAuthRedirect(ORIGIN)).resolves.toEqual({ ok: true });
  });

  it('passes when there is no Location header to read', async () => {
    mockFetch(() => new Response('', { status: 200 }));
    await expect(checkAuthRedirect(ORIGIN)).resolves.toEqual({ ok: true });
  });

  it('passes when Supabase is not configured at all', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    mockFetch(() => redirectTo('http://localhost:3000'));
    await expect(checkAuthRedirect(ORIGIN)).resolves.toEqual({ ok: true });
  });

  it('passes when it has no origin to ask about', async () => {
    const spy = vi.fn<FetchStub>(() => redirectTo('http://localhost:3000'));
    mockFetch(spy);
    await expect(checkAuthRedirect('')).resolves.toEqual({ ok: true });
    expect(spy).not.toHaveBeenCalled();
  });

  it('never sends a usable token — the probe cannot log anyone in', async () => {
    const spy = vi.fn<FetchStub>(() => redirectTo(`${ORIGIN}/auth/callback`));
    mockFetch(spy);
    await checkAuthRedirect(ORIGIN);
    expect(String(spy.mock.calls[0]?.[0] ?? '')).toContain('not-a-real-token');
  });
});

describe('caching', () => {
  it('asks once per origin while the answer is good', async () => {
    const spy = vi.fn<FetchStub>(() => redirectTo(`${ORIGIN}/auth/callback`));
    mockFetch(spy);
    await checkAuthRedirect(ORIGIN, 1_000);
    await checkAuthRedirect(ORIGIN, 9_999_000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('re-checks after a failure, so fixing the allow-list needs no redeploy', async () => {
    let location = 'http://localhost:3000';
    const spy = vi.fn<FetchStub>(() => redirectTo(location));
    mockFetch(spy);

    expect((await checkAuthRedirect(ORIGIN, 1_000)).ok).toBe(false);
    expect((await checkAuthRedirect(ORIGIN, 2_000)).ok).toBe(false); // still cached
    expect(spy).toHaveBeenCalledTimes(1);

    location = `${ORIGIN}/auth/callback`;
    expect((await checkAuthRedirect(ORIGIN, 120_000)).ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
