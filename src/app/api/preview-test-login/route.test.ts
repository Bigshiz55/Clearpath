import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A TEST-ONLY LOGIN IS A PRODUCTION BACKDOOR IF ANY ONE OF THESE SLIPS.
 *
 * Each assertion here is a way this route could become one: alive in
 * production, open when unconfigured, satisfied by a wrong or absent secret,
 * or leaking the session it creates into a response body. They are pinned
 * individually rather than as one happy-path test because it only takes one.
 */

const signIn = vi.fn();
let cookiesSet: Array<{ name: string; value: string }> = [];

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: { setAll: (c: Array<{ name: string; value: string }>) => void } }) => ({
    auth: {
      signInWithPassword: async (creds: { email: string; password: string }) => {
        const result = await signIn(creds);
        if (!result?.error) opts.cookies.setAll([{ name: 'sb-access-token', value: 'SESSIONVALUE' }]);
        return result;
      },
    },
  }),
}));
vi.mock('next/headers', () => ({
  cookies: () => ({ getAll: () => [], set: (name: string, value: string) => cookiesSet.push({ name, value }) }),
}));
vi.mock('@/lib/env', () => ({
  publicEnv: { supabaseUrl: () => 'https://example.supabase.co', supabasePublishableKey: () => 'anon' },
}));

import { POST } from './route';

const SECRET = 'preview-test-secret-value';
const req = (secret?: string) =>
  new Request('http://localhost/api/preview-test-login', {
    method: 'POST',
    headers: secret === undefined ? {} : { 'x-preview-test-secret': secret },
  });

const original = { ...process.env };
beforeEach(() => {
  cookiesSet = [];
  signIn.mockReset().mockResolvedValue({ error: null });
  process.env.VERCEL_ENV = 'preview';
  process.env.PREVIEW_TEST_LOGIN_SECRET = SECRET;
  process.env.PREVIEW_TEST_EMAIL = 'ci-test@example.invalid';
  process.env.PREVIEW_TEST_PASSWORD = 'test-password';
});
afterEach(() => {
  process.env = { ...original };
});

describe('it does not exist in production', () => {
  it('404s when VERCEL_ENV is production, even fully configured and correctly authorised', () => {
    process.env.VERCEL_ENV = 'production';
    return POST(req(SECRET)).then(async (res) => {
      expect(res.status).toBe(404);
      expect(signIn, 'production attempted a sign-in').not.toHaveBeenCalled();
    });
  });

  it('cannot be re-enabled by the caller', async () => {
    // The environment is set by the platform. A header or body must never be
    // able to talk the route back to life.
    process.env.VERCEL_ENV = 'production';
    const res = await POST(
      new Request('http://localhost/api/preview-test-login', {
        method: 'POST',
        headers: { 'x-preview-test-secret': SECRET, 'x-vercel-env': 'preview' },
        body: JSON.stringify({ env: 'preview' }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe('the secret is required and must be right', () => {
  it('404s on a wrong secret', async () => {
    const res = await POST(req('wrong-secret-value-entirely'));
    expect(res.status).toBe(404);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('404s when the header is absent', async () => {
    expect((await POST(req())).status).toBe(404);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('404s on an empty secret rather than matching an unconfigured deployment', async () => {
    // The dangerous case: an unset expected secret matching an empty header
    // would leave the route wide open on any preview that forgot to configure it.
    process.env.PREVIEW_TEST_LOGIN_SECRET = '';
    expect((await POST(req(''))).status).toBe(404);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('404s when the test identity is not configured', async () => {
    delete process.env.PREVIEW_TEST_EMAIL;
    expect((await POST(req(SECRET))).status).toBe(404);
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe('a correct call produces a real cookie session', () => {
  it('signs in and writes SSR cookies', async () => {
    const res = await POST(req(SECRET));
    expect(res.status).toBe(200);
    expect(signIn).toHaveBeenCalledWith({ email: 'ci-test@example.invalid', password: 'test-password' });
    expect(cookiesSet.length, 'no session cookie was written').toBeGreaterThan(0);
  });

  it('never returns the session, the credentials or the secret', async () => {
    const body = JSON.stringify(await (await POST(req(SECRET))).json());
    for (const leak of ['SESSIONVALUE', 'test-password', SECRET, 'sb-access-token']) {
      expect(body, `${leak} appeared in the response body`).not.toContain(leak);
    }
    // A count is the useful signal; a name or a value is not.
    expect(JSON.parse(body).cookiesSet).toBe(1);
  });

  it('reports a failed sign-in without echoing credentials', async () => {
    signIn.mockResolvedValue({ error: { message: 'Invalid login credentials for test-password' } });
    const res = await POST(req(SECRET));
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain('test-password');
  });
});
