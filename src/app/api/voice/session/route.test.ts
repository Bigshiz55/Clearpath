import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * THE SESSION ROUTE'S CONTRACTS, PINNED.
 *
 *  1. IDENTITY GATE — any session may mint a Realtime token, including the
 *     anonymous guest; an UNAUTHENTICATED hit still gets the hidden 404 and no
 *     OpenAI request is ever attempted, because a paid session needs someone to
 *     attribute it to. Founder status is deliberately NOT required any more:
 *     the interview is a normal product surface.
 *  2. GRACEFUL FALLBACK — with no key the route answers 200
 *     `{ mode: 'fallback' }`, NOT an error, so the keyless browser-speech path
 *     can take over. An upstream OpenAI failure also degrades to a 200 fallback.
 *  3. NO SECRET LEAK — the realtime response returns only the ephemeral
 *     `client_secret`; the server key never appears in the body.
 */

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'founder@test.com' } as { id: string; email: string } | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
  }),
}));

import { POST } from './route';

const KEY = 'OPENAI_API_KEY';
const ENABLED = 'VOICE_INTERVIEW_ENABLED';

beforeEach(() => {
  h.user = { id: 'u1', email: 'founder@test.com' };
  process.env.ADMIN_EMAILS = 'founder@test.com';
  delete process.env[KEY];
  delete process.env[ENABLED];
  vi.restoreAllMocks();
});
afterEach(() => {
  delete process.env.ADMIN_EMAILS;
  delete process.env[KEY];
  delete process.env[ENABLED];
});

describe('identity gate', () => {
  it('unauthenticated → hidden 404, no OpenAI call', async () => {
    h.user = null;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await POST();
    expect(res.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('an ordinary signed-in user is admitted — no founder check', async () => {
    h.user = { id: 'u2', email: 'stranger@example.com' };
    const res = await POST();
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe('fallback'); // no key configured here
  });

  it('an anonymous guest session is admitted too', async () => {
    // Middleware mints these for "no account needed to explore"; they have an
    // id and no email at all.
    h.user = { id: 'guest-1', email: '' };
    const res = await POST();
    expect(res.status).toBe(200);
  });
});

describe('fallback (no key, or voice switched off)', () => {
  it('no key → 200 { mode: "fallback" }, no OpenAI call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: 'fallback' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a key alone now means realtime — no second opt-in', async () => {
    process.env[KEY] = 'sk-secret';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ client_secret: { value: 'ephem-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await POST();
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe('realtime');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('an explicit VOICE_INTERVIEW_ENABLED=0 still switches voice off', async () => {
    process.env[KEY] = 'sk-secret';
    process.env[ENABLED] = '0';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: 'fallback' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('realtime (key present)', () => {
  beforeEach(() => {
    process.env[KEY] = 'sk-super-secret';
  });

  it('mints an ephemeral secret and never leaks the server key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ client_secret: { value: 'ephem-abc', expires_at: 123 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('realtime');
    expect(body.client_secret).toEqual({ value: 'ephem-abc', expires_at: 123 });
    expect(body.model).toBeTruthy();
    // The server key must not appear anywhere in the response.
    expect(JSON.stringify(body)).not.toContain('sk-super-secret');
    // Called OpenAI with a Bearer of the server key (in the request, not the body).
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe('https://api.openai.com/v1/realtime/sessions');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer sk-super-secret' });
  });

  it('upstream failure degrades to a 200 fallback, not a 5xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe('fallback');
    expect(body.error).toContain('429');
  });

  it('a thrown fetch degrades to a 200 fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const res = await POST();
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe('fallback');
  });

  it('a 200 with no client_secret degrades to fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ nope: true }), { status: 200 }),
    );
    const res = await POST();
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe('fallback');
  });
});
