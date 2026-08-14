import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A CONFIG DIAGNOSTIC IS ONE MISTAKE AWAY FROM BEING A CREDENTIAL LEAK.
 *
 * The whole value of this endpoint is answering "is it wired up?", and the
 * whole risk is answering it with any part of the secret. These pin that the
 * response is a mode name and booleans, that a real key value can never appear
 * in it however the reporting is written, and that an unauthorised caller
 * learns nothing at all.
 */

let email: string | null = null;
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: email ? { email } : null } }) } }),
}));
vi.mock('@/lib/admin', () => ({ isAdminEmail: (e?: string | null) => e === 'admin@example.com' }));
vi.mock('@/lib/env', () => ({ serverEnv: { aiDiscoveryMode: () => 'legacy' } }));
vi.mock('@/lib/buildInfo', () => ({ getBuildInfo: () => ({ gitSha: 'abc1234', gitBranch: 'main' }) }));

import { GET } from './route';

/** Distinctive fake values — if any fragment appears in the body, it leaked. */
const SECRETS = {
  ANTHROPIC_API_KEY: 'sk-ant-LEAKCANARY-0001',
  OPENAI_API_KEY: 'sk-openai-LEAKCANARY-0002',
  TMDB_API_KEY: 'tmdb-LEAKCANARY-0003',
  SUPABASE_SERVICE_ROLE_KEY: 'service-LEAKCANARY-0004',
  NEXT_PUBLIC_SUPABASE_URL: 'https://LEAKCANARY.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pub-LEAKCANARY-0005',
};

beforeEach(() => {
  email = 'admin@example.com';
  for (const [k, v] of Object.entries(SECRETS)) process.env[k] = v;
});

describe('the config diagnostic', () => {
  it('reports presence as booleans, never values', async () => {
    const body = await (await GET()).json();
    expect(body.anthropicKeyPresent).toBe(true);
    expect(body.tmdbKeyPresent).toBe(true);
    expect(body.supabaseServiceRoleKeyPresent).toBe(true);
    for (const [key, value] of Object.entries(body)) {
      if (key.endsWith('Present')) expect(typeof value, `${key} is not a boolean`).toBe('boolean');
    }
  });

  it('leaks no fragment of any configured secret', async () => {
    const serialised = JSON.stringify(await (await GET()).json());
    for (const [name, value] of Object.entries(SECRETS)) {
      expect(serialised, `${name} appeared in the response`).not.toContain(value);
      // Not even a prefix or a tail: both narrow a search space.
      expect(serialised, `a fragment of ${name} appeared`).not.toContain(value.slice(0, 12));
      expect(serialised, `a fragment of ${name} appeared`).not.toContain(value.slice(-8));
    }
    expect(serialised).not.toMatch(/LEAKCANARY/);
    // A length is a partial value too.
    expect(serialised).not.toMatch(/"(?:\w*(?:[Ll]ength|[Pp]refix|[Ss]uffix|[Mm]asked))"\s*:/);
  });

  it('distinguishes missing from configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.TMDB_API_KEY = '   '; // whitespace is not configured
    const body = await (await GET()).json();
    expect(body.anthropicKeyPresent).toBe(false);
    expect(body.tmdbKeyPresent).toBe(false);
  });

  it('answers the question it exists for', async () => {
    const body = await (await GET()).json();
    expect(['legacy', 'shadow', 'anthropic']).toContain(body.aiDiscoveryMode);
    expect(body.buildSha).toBe('abc1234');
  });

  it('tells an unauthorised caller nothing, not even that it exists', async () => {
    email = 'someone@example.com';
    const res = await GET();
    expect(res.status).toBe(404);
    const serialised = JSON.stringify(await res.json());
    expect(serialised).not.toMatch(/aiDiscoveryMode|Present|buildSha/);
  });

  it('is closed to signed-out callers', async () => {
    email = null;
    expect((await GET()).status).toBe(404);
  });
});
